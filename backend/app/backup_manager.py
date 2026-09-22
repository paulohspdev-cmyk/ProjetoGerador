import hashlib
import json
import os
import shutil
import sqlite3
import struct
import tarfile
import tempfile
import time
import uuid
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from . import db
from .binding_store import BindingStoreError, load_runtime_bindings, validate_runtime_bindings
from .config import (
    BACKUP_OFFSITE_DIR,
    BACKUP_OFFSITE_KEY_FILE,
    BACKUP_OFFSITE_REQUIRED,
    DATA_DIR,
    DB_FILE,
    PROJECT_ROOT,
    RAPID_ARCHIVE_DIR,
    RAPID_BINDINGS_FILE,
    RAPID_SCADA_ROOT,
    TOTP_KEY_FILE,
)

BACKUP_DIR = DATA_DIR / "backups"
RUNTIME_BINDINGS = Path(RAPID_BINDINGS_FILE)
RETIRED_BINDINGS = DATA_DIR / "rapid-retired-bindings.json"
DEFAULT_RETENTION = int(os.environ.get("RC_BACKUP_RETENTION", "14"))
INCLUDE_SECRETS = os.environ.get("RC_BACKUP_INCLUDE_SECRETS", "0").strip() == "1"
ENV_FILE = Path(os.environ.get("RC_ENV_FILE", "/etc/rc-geradores.env"))

OFFSITE_STREAM_MAGIC = b"RCG-OFFSITE-FERNET-CHUNKED-V1\n"
OFFSITE_STREAM_CHUNK_SIZE = 4 * 1024 * 1024
OFFSITE_STREAM_MAX_TOKEN_SIZE = 8 * 1024 * 1024


def _quick_check(path: Path) -> None:
    if not path.exists() or not path.is_file():
        raise ValueError(f"Banco SQLite não encontrado: {path}")
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = connection.execute("PRAGMA quick_check").fetchall()
    finally:
        connection.close()
    messages = [str(row[0]) for row in rows]
    if messages != ["ok"]:
        raise ValueError("SQLite quick_check falhou: " + "; ".join(messages[:20]))


def _integrity_check(path: Path) -> None:
    """Valida páginas, integridade e chaves estrangeiras."""
    _quick_check(path)
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        integrity = [str(row[0]) for row in connection.execute("PRAGMA integrity_check").fetchall()]
        foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    finally:
        connection.close()
    if integrity != ["ok"]:
        raise ValueError("SQLite integrity_check falhou: " + "; ".join(integrity[:20]))
    if foreign_keys:
        preview = "; ".join(str(tuple(row)) for row in foreign_keys[:20])
        raise ValueError("SQLite foreign_key_check falhou: " + preview)


def _snapshot_database(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with db.connect() as source:
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            dest.close()
    _quick_check(target)


def _database_requires_bindings(path: Path) -> bool:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT 1 FROM generators WHERE rapid_device_num IS NOT NULL LIMIT 1"
        ).fetchone()
        return row is not None
    finally:
        connection.close()


def _validate_binding_file(path: Path) -> None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Bindings Rapid inválidos no backup: {path}: {exc}") from exc
    if not isinstance(value, list):
        raise ValueError(f"Bindings Rapid inválidos no backup: {path} deve conter uma lista")
    try:
        validate_runtime_bindings(value)
    except BindingStoreError as exc:
        raise ValueError(f"Bindings Rapid inválidos no backup: {exc}") from exc


def _add_if_exists(tar: tarfile.TarFile, path: Path, arcname: str):
    if path.exists():
        tar.add(path, arcname=arcname, recursive=True)


def _validate_members(tar: tarfile.TarFile, root: Path) -> None:
    root_resolved = root.resolve()
    for member in tar.getmembers():
        if member.islnk() or member.issym() or member.isdev() or member.isfifo():
            raise ValueError("Backup contém link ou dispositivo não permitido")
        resolved = (root / member.name).resolve()
        if root_resolved not in resolved.parents and resolved != root_resolved:
            raise ValueError("Backup contém caminho inseguro")


def _offsite_cipher(key_file: str | Path | None = None) -> Fernet:
    configured = str(key_file or BACKUP_OFFSITE_KEY_FILE or "").strip()
    if not configured:
        raise ValueError("Backup off-site exige RC_BACKUP_OFFSITE_KEY_FILE para criptografia")
    key_path = Path(configured)
    if not key_path.is_file():
        raise ValueError(f"Chave de backup off-site não encontrada: {key_path}")
    try:
        return Fernet(key_path.read_bytes().strip())
    except Exception as exc:
        raise ValueError(f"Chave de backup off-site inválida: {key_path}") from exc


def _write_offsite_record(target, token: bytes) -> None:
    if not token or len(token) > OFFSITE_STREAM_MAX_TOKEN_SIZE:
        raise ValueError("Token off-site inválido ou grande demais")
    target.write(struct.pack(">I", len(token)))
    target.write(token)


def _encrypt_offsite_payload(source: Path, target: Path, cipher: Fernet) -> None:
    digest = hashlib.sha256()
    index = 0
    with source.open("rb") as src, target.open("wb") as dst:
        dst.write(OFFSITE_STREAM_MAGIC)
        while True:
            chunk = src.read(OFFSITE_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
            clear_record = b"D" + struct.pack(">Q", index) + chunk
            _write_offsite_record(dst, cipher.encrypt(clear_record))
            index += 1

        end_record = b"E" + struct.pack(">Q", index) + digest.digest()
        _write_offsite_record(dst, cipher.encrypt(end_record))
        dst.flush()
        os.fsync(dst.fileno())


def _decrypt_chunked_offsite_payload(source: Path, target: Path, cipher: Fernet) -> None:
    digest = hashlib.sha256()
    expected_index = 0
    saw_end = False

    with source.open("rb") as src, target.open("wb") as dst:
        magic = src.read(len(OFFSITE_STREAM_MAGIC))
        if magic != OFFSITE_STREAM_MAGIC:
            raise ValueError("Envelope off-site chunked inválido")

        while True:
            header = src.read(4)
            if not header:
                break
            if len(header) != 4:
                raise ValueError("Envelope off-site truncado no cabeçalho de registro")

            token_size = struct.unpack(">I", header)[0]
            if token_size <= 0 or token_size > OFFSITE_STREAM_MAX_TOKEN_SIZE:
                raise ValueError("Envelope off-site contém tamanho de registro inválido")

            token = src.read(token_size)
            if len(token) != token_size:
                raise ValueError("Envelope off-site truncado no conteúdo de registro")

            try:
                clear_record = cipher.decrypt(token)
            except InvalidToken as exc:
                raise ValueError("Envelope off-site não autentica com a chave informada") from exc

            if len(clear_record) < 9:
                raise ValueError("Envelope off-site contém registro autenticado inválido")

            record_type = clear_record[:1]
            record_index = struct.unpack(">Q", clear_record[1:9])[0]
            if record_index != expected_index:
                raise ValueError(
                    f"Envelope off-site fora de sequência: esperado {expected_index}, recebido {record_index}"
                )

            if record_type == b"D":
                if saw_end:
                    raise ValueError("Envelope off-site contém dados após o terminador")
                chunk = clear_record[9:]
                if not chunk:
                    raise ValueError("Envelope off-site contém chunk vazio")
                digest.update(chunk)
                dst.write(chunk)
                expected_index += 1
                continue

            if record_type == b"E":
                if saw_end or len(clear_record) != 41:
                    raise ValueError("Envelope off-site contém terminador inválido")
                expected_digest = clear_record[9:]
                if expected_digest != digest.digest():
                    raise ValueError("Envelope off-site falhou na verificação SHA-256 final")
                saw_end = True
                if src.read(1):
                    raise ValueError("Envelope off-site contém dados após o terminador")
                break

            raise ValueError("Envelope off-site contém tipo de registro desconhecido")

        if not saw_end:
            raise ValueError("Envelope off-site truncado: terminador autenticado ausente")

        dst.flush()
        os.fsync(dst.fileno())


def _decrypt_offsite_payload(source: Path, target: Path, cipher: Fernet) -> None:
    with source.open("rb") as src:
        prefix = src.read(len(OFFSITE_STREAM_MAGIC))

    if prefix == OFFSITE_STREAM_MAGIC:
        _decrypt_chunked_offsite_payload(source, target, cipher)
        return

    # Compatibilidade de leitura com envelopes legados de token Fernet único.
    try:
        clear = cipher.decrypt(source.read_bytes())
    except InvalidToken as exc:
        raise ValueError("Envelope off-site não autentica com a chave informada") from exc
    target.write_bytes(clear)


def _build_offsite_payload(archive: Path, target: Path) -> bool:
    """Cria envelope de DR criptografado sem expor segredos no backup local."""
    totp_key = Path(TOTP_KEY_FILE)
    env_file = Path(ENV_FILE)
    with tempfile.TemporaryDirectory(prefix="rc-offsite-validate-") as tmp:
        with tarfile.open(archive, "r:gz") as source:
            _validate_members(source, Path(tmp))
            members = source.getmembers()
            member_names = {member.name for member in members}
            with tarfile.open(target, "w:gz") as destination:
                for member in members:
                    fileobj = source.extractfile(member) if member.isfile() else None
                    destination.addfile(member, fileobj)
                if env_file.is_file() and "product/rc-geradores.env" not in member_names:
                    destination.add(env_file, arcname="product/rc-geradores.env", recursive=False)
                if totp_key.is_file() and "product/totp-fernet.key" not in member_names:
                    destination.add(totp_key, arcname="product/totp-fernet.key", recursive=False)
                    return True
    return "product/totp-fernet.key" in member_names


def _validate_offsite_target_dir(target_dir: Path) -> None:
    target_dir = target_dir.resolve()
    data_root = DATA_DIR.resolve()
    if target_dir == data_root or data_root in target_dir.parents:
        raise ValueError("Destino off-site deve ficar fora de RC_DATA_DIR")
    if not target_dir.exists():
        raise ValueError(
            "Destino off-site não existe. O mount/volume deve estar presente antes do backup; "
            "o RC Geradores não cria o diretório para evitar falso off-site no disco local."
        )
    if not target_dir.is_dir():
        raise ValueError(f"Destino off-site não é diretório: {target_dir}")
    if not os.access(target_dir, os.W_OK | os.X_OK):
        raise ValueError(f"Destino off-site não está gravável pelo serviço: {target_dir}")
    try:
        data_device = data_root.stat().st_dev
        target_device = target_dir.stat().st_dev
    except OSError as exc:
        raise ValueError(f"Não foi possível validar filesystem do destino off-site: {exc}") from exc
    if data_device == target_device:
        raise ValueError(
            "Destino off-site está no mesmo filesystem de RC_DATA_DIR; "
            "use volume/mount remoto ou dispositivo separado."
        )


def offsite_storage_status() -> tuple[bool, str]:
    if not BACKUP_OFFSITE_REQUIRED:
        return False, "RC_BACKUP_OFFSITE_REQUIRED não está habilitado"
    if not BACKUP_OFFSITE_DIR:
        return False, "RC_BACKUP_OFFSITE_DIR não foi configurado"
    if not BACKUP_OFFSITE_KEY_FILE:
        return False, "RC_BACKUP_OFFSITE_KEY_FILE não foi configurado"
    try:
        _offsite_cipher()
        target_dir = Path(BACKUP_OFFSITE_DIR).resolve()
        _validate_offsite_target_dir(target_dir)
    except Exception as exc:
        return False, str(exc)
    return True, f"Destino off-site validado em filesystem separado: {target_dir}"


def _offsite_target(archive: Path) -> Path | None:
    if not BACKUP_OFFSITE_DIR:
        if BACKUP_OFFSITE_REQUIRED:
            raise ValueError("RC_BACKUP_OFFSITE_REQUIRED=1, mas RC_BACKUP_OFFSITE_DIR não foi configurado")
        return None
    target_dir = Path(BACKUP_OFFSITE_DIR).resolve()
    _validate_offsite_target_dir(target_dir)
    cipher = _offsite_cipher()
    target = target_dir / f"{archive.name}.fernet"
    staged = target_dir / f".{target.name}.{os.getpid()}.tmp"
    with tempfile.TemporaryDirectory(prefix="rc-offsite-payload-") as tmp:
        payload = Path(tmp) / archive.name
        _build_offsite_payload(archive, payload)
        _encrypt_offsite_payload(payload, staged, cipher)
    try:
        os.chmod(staged, 0o600)
    except PermissionError:
        pass
    os.replace(staged, target)
    return target


def create_full_backup(actor: str = "system", retention: int | None = None) -> dict:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(BACKUP_DIR, 0o750)
    except PermissionError:
        pass
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    nonce = f"{time.time_ns()}-{uuid.uuid4().hex[:8]}"
    backup_id = f"bk-{stamp}-{nonce}"
    archive = BACKUP_DIR / f"rc-geradores-full-{stamp}-{nonce}.tar.gz"
    staged_archive = BACKUP_DIR / f".{archive.name}.{os.getpid()}.tmp"
    result = "OK"
    detail = ""
    offsite_path = None
    bindings_included = False
    rapid_archive_included = False

    try:
        with tempfile.TemporaryDirectory(prefix="rc-backup-") as tmp:
            db_copy = Path(tmp) / "product-db.sqlite3"
            _snapshot_database(db_copy)
            requires_bindings = _database_requires_bindings(db_copy)
            if RUNTIME_BINDINGS.exists():
                load_runtime_bindings(RUNTIME_BINDINGS)
                bindings_included = True
            elif requires_bindings:
                raise ValueError(
                    "Backup completo recusado: banco possui gerador(es) provisionado(s), "
                    "mas rapid-bindings.json não existe"
                )

            with tarfile.open(staged_archive, "w:gz") as tar:
                tar.add(db_copy, arcname="product/product-db.sqlite3")
                _add_if_exists(tar, RUNTIME_BINDINGS, "product/rapid-bindings.json")
                _add_if_exists(tar, RETIRED_BINDINGS, "product/rapid-retired-bindings.json")
                if INCLUDE_SECRETS:
                    _add_if_exists(tar, ENV_FILE, "product/rc-geradores.env")
                    _add_if_exists(tar, Path(TOTP_KEY_FILE), "product/totp-fernet.key")
                _add_if_exists(tar, PROJECT_ROOT / "rapid", "product/rapid")
                _add_if_exists(tar, PROJECT_ROOT / "controllers", "product/controllers")
                _add_if_exists(tar, Path(RAPID_SCADA_ROOT) / "BaseDAT", "rapid-scada/BaseDAT")
                _add_if_exists(tar, Path(RAPID_SCADA_ROOT) / "Config", "rapid-scada/Config")
                _add_if_exists(tar, Path(RAPID_SCADA_ROOT) / "ScadaComm/Config", "rapid-scada/ScadaCommConfig")
                if Path(RAPID_ARCHIVE_DIR).exists():
                    _add_if_exists(tar, Path(RAPID_ARCHIVE_DIR), "rapid-scada/Archive")
                    rapid_archive_included = True
            os.replace(staged_archive, archive)
        try:
            os.chmod(archive, 0o640)
        except PermissionError:
            pass
        offsite = _offsite_target(archive)
        offsite_path = str(offsite) if offsite else None
    except Exception as exc:
        result = "Falha"
        detail = str(exc)[:1000]
        staged_archive.unlink(missing_ok=True)
        archive.unlink(missing_ok=True)

    size = archive.stat().st_size if archive.exists() else 0
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO backup_records(id,created_at,path,size_bytes,type,result,detail) VALUES (?,?,?,?,?,?,?)",
            (backup_id, int(time.time()), str(archive), size, "Completo", result, detail),
        )
    db.add_audit(
        actor,
        "backup",
        "system",
        backup_id,
        f"{result} {size} bytes; bindings={bindings_included}; secrets={'included' if INCLUDE_SECRETS else 'excluded'}; offsite={bool(offsite_path)}",
    )
    if result == "OK":
        apply_retention(retention if retention is not None else DEFAULT_RETENTION)
    return {
        "id": backup_id,
        "path": str(archive),
        "offsitePath": offsite_path,
        "size_bytes": size,
        "type": "Completo",
        "result": result,
        "detail": detail,
        "created_at": int(time.time()),
        "bindingsIncluded": bindings_included,
        "secretsIncluded": INCLUDE_SECRETS,
        "totpSecretEncryptedInDatabase": True,
        "offsiteCarriesTotpRecoveryKey": bool(offsite_path and Path(TOTP_KEY_FILE).is_file()),
        "rapidHistoricalArchiveIncluded": rapid_archive_included,
    }


def apply_retention(keep: int = DEFAULT_RETENTION):
    keep = max(1, min(int(keep), 365))
    archives = sorted(
        BACKUP_DIR.glob("rc-geradores-full-*.tar.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    staged: list[tuple[Path, Path]] = []
    for path in archives[keep:]:
        temporary = path.with_name(f".{path.name}.retention-{uuid.uuid4().hex[:8]}.tmp")
        try:
            os.replace(path, temporary)
        except OSError:
            continue
        staged.append((path, temporary))

    if not staged:
        return 0

    try:
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            for original, _temporary in staged:
                conn.execute("DELETE FROM backup_records WHERE path=?", (str(original),))
    except Exception:
        for original, temporary in reversed(staged):
            if temporary.exists() and not original.exists():
                os.replace(temporary, original)
        raise

    removed = 0
    for _original, temporary in staged:
        try:
            temporary.unlink()
            removed += 1
        except OSError:
            # O registro já foi removido; um temporário oculto é preferível a
            # anunciar na UI um backup que não pode mais ser baixado.
            pass
    return removed


def safe_archive_path(path: str | Path) -> Path:
    candidate = Path(path).resolve()
    root = BACKUP_DIR.resolve()
    if (
        root not in candidate.parents
        or not candidate.name.startswith("rc-geradores-full-")
        or candidate.suffixes[-2:] != [".tar", ".gz"]
    ):
        raise ValueError("Arquivo de backup inválido")
    if not candidate.exists():
        raise FileNotFoundError(candidate)
    return candidate


def _validate_archive_database(archive: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="rc-backup-validate-") as tmp:
        root = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            _validate_members(tar, root)
            member = tar.getmember("product/product-db.sqlite3")
            if not member.isfile():
                raise ValueError("Backup sem banco do produto")
            source = tar.extractfile(member)
            if source is None:
                raise ValueError("Banco do produto não pôde ser lido do backup")
            db_copy = root / "product-db.sqlite3"
            with db_copy.open("wb") as target:
                shutil.copyfileobj(source, target)
        _quick_check(db_copy)


def materialize_offsite_backup(
    encrypted_path: str | Path,
    key_file: str | Path | None = None,
) -> Path:
    """Autentica/decripta um envelope off-site e o materializa no diretório local de backup."""
    source = Path(encrypted_path).resolve()
    if not source.is_file() or not source.name.endswith(".tar.gz.fernet"):
        raise ValueError("Envelope off-site inválido; esperado rc-geradores-full-*.tar.gz.fernet")
    if not source.name.startswith("rc-geradores-full-"):
        raise ValueError("Envelope off-site não pertence ao formato RC Geradores")
    cipher = _offsite_cipher(key_file)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    plain_name = source.name.removesuffix(".fernet")
    target = BACKUP_DIR / plain_name
    if target.exists():
        stem = plain_name.removesuffix(".tar.gz")
        target = BACKUP_DIR / f"{stem}-recovered-{int(time.time())}.tar.gz"
    staged = BACKUP_DIR / f".{target.name}.{os.getpid()}.tmp"
    try:
        _decrypt_offsite_payload(source, staged, cipher)
        os.chmod(staged, 0o600)
        _validate_archive_database(staged)
        os.replace(staged, target)
        os.chmod(target, 0o640)
    except Exception:
        staged.unlink(missing_ok=True)
        raise
    return safe_archive_path(target)


def _restore_product_ownership(path: Path = DB_FILE) -> None:
    try:
        shutil.chown(path, user="rcgeradores", group="rcgeradores")
        os.chmod(path, 0o640)
    except (LookupError, PermissionError, FileNotFoundError):
        pass


def _restore_state_file_ownership(path: Path) -> None:
    try:
        shutil.chown(path, user="rcgeradores", group="rcgeradores")
        os.chmod(path, 0o640)
    except (LookupError, PermissionError, FileNotFoundError):
        pass


def _install_state_file(source: Path, target: Path, *, validate_bindings: bool = False) -> None:
    if validate_bindings:
        _validate_binding_file(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = target.parent / f".{target.name}.restore-{os.getpid()}.tmp"
    shutil.copy2(source, staged)
    _restore_state_file_ownership(staged)
    os.replace(staged, target)
    _restore_state_file_ownership(target)


def _capture_state_file(path: Path) -> tuple[bool, bytes | None]:
    return (path.exists(), path.read_bytes() if path.exists() else None)


def _rollback_state_file(path: Path, snapshot: tuple[bool, bytes | None]) -> None:
    existed, content = snapshot
    if not existed:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.parent / f".{path.name}.rollback-{os.getpid()}.tmp"
    staged.write_bytes(content or b"")
    _restore_state_file_ownership(staged)
    os.replace(staged, path)
    _restore_state_file_ownership(path)


def _pre_restore_snapshot() -> Path | None:
    if not DB_FILE.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    target = BACKUP_DIR / f"pre-restore-{stamp}-{os.getpid()}.sqlite3"
    _snapshot_database(target)
    try:
        os.chmod(target, 0o640)
    except PermissionError:
        pass
    return target


def _remove_database_sidecars() -> None:
    for suffix in ("-wal", "-shm"):
        Path(str(DB_FILE) + suffix).unlink(missing_ok=True)


def _install_database(source: Path) -> None:
    _integrity_check(source)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    staged = DATA_DIR / f".{DB_FILE.name}.restore-{os.getpid()}.tmp"
    shutil.copy2(source, staged)
    _integrity_check(staged)
    _restore_product_ownership(staged)
    _remove_database_sidecars()
    os.replace(staged, DB_FILE)
    _restore_product_ownership(DB_FILE)
    _integrity_check(DB_FILE)


def _rollback_database(snapshot: Path | None, existed_before: bool = True) -> None:
    if snapshot and snapshot.exists():
        staged = DATA_DIR / f".{DB_FILE.name}.rollback-{os.getpid()}.tmp"
        shutil.copy2(snapshot, staged)
        _integrity_check(staged)
        _restore_product_ownership(staged)
        _remove_database_sidecars()
        os.replace(staged, DB_FILE)
        _restore_product_ownership(DB_FILE)
        _integrity_check(DB_FILE)
        return
    if not existed_before:
        _remove_database_sidecars()
        DB_FILE.unlink(missing_ok=True)


def _restore_env_file(source: Path) -> None:
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    staged = ENV_FILE.parent / f".{ENV_FILE.name}.restore-{os.getpid()}.tmp"
    shutil.copy2(source, staged)
    os.chmod(staged, 0o640)
    try:
        shutil.chown(staged, user="root", group="rcgeradores")
    except (LookupError, PermissionError):
        pass
    os.replace(staged, ENV_FILE)


def _rollback_env_file(snapshot: tuple[bool, bytes | None]) -> None:
    existed, content = snapshot
    if not existed:
        ENV_FILE.unlink(missing_ok=True)
        return
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    staged = ENV_FILE.parent / f".{ENV_FILE.name}.rollback-{os.getpid()}.tmp"
    staged.write_bytes(content or b"")
    os.chmod(staged, 0o640)
    try:
        shutil.chown(staged, user="root", group="rcgeradores")
    except (LookupError, PermissionError):
        pass
    os.replace(staged, ENV_FILE)


def _rollback_totp_key(snapshot: tuple[bool, bytes | None]) -> None:
    target = Path(TOTP_KEY_FILE)
    existed, content = snapshot
    if not existed:
        target.unlink(missing_ok=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = target.parent / f".{target.name}.rollback-{os.getpid()}.tmp"
    staged.write_bytes(content or b"")
    os.chmod(staged, 0o600)
    try:
        shutil.chown(staged, user="rcgeradores", group="rcgeradores")
    except (LookupError, PermissionError):
        pass
    os.replace(staged, target)


def _install_directory_tree(source: Path, target: Path) -> tuple[Path, bool]:
    target.parent.mkdir(parents=True, exist_ok=True)
    token = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"
    staged = target.parent / f".{target.name}.restore-new-{token}"
    previous = target.parent / f".{target.name}.restore-before-{token}"
    shutil.copytree(source, staged)
    existed = target.exists()
    try:
        if existed:
            os.replace(target, previous)
        os.replace(staged, target)
    except Exception:
        if staged.exists():
            shutil.rmtree(staged, ignore_errors=True)
        if existed and previous.exists() and not target.exists():
            os.replace(previous, target)
        raise
    return previous, existed


def _rollback_directory_tree(target: Path, previous: Path, existed: bool) -> None:
    if target.exists():
        shutil.rmtree(target)
    if existed and previous.exists():
        os.replace(previous, target)
    elif previous.exists():
        shutil.rmtree(previous, ignore_errors=True)


def _commit_directory_tree(previous: Path) -> None:
    if previous.exists():
        shutil.rmtree(previous, ignore_errors=True)


def _restore_totp_key(source: Path) -> None:
    target = Path(TOTP_KEY_FILE)
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = target.parent / f".{target.name}.restore-{os.getpid()}.tmp"
    shutil.copy2(source, staged)
    os.chmod(staged, 0o600)
    try:
        shutil.chown(staged, user="rcgeradores", group="rcgeradores")
    except (LookupError, PermissionError):
        pass
    os.replace(staged, target)


def restore_archive(archive_path: str | Path, restore_rapid: bool = True) -> dict:
    """Restaura backup administrativo com rollback de todos os artefatos tocados."""
    archive = safe_archive_path(archive_path)
    pre_restore: Path | None = None
    secrets_restored = False
    bindings_restored = False
    retired_bindings_restored = False
    directory_swaps: list[tuple[Path, Path, bool]] = []

    with tempfile.TemporaryDirectory(prefix="rc-restore-") as tmp:
        root = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            _validate_members(tar, root)
            tar.extractall(root, filter="data")

        db_src = root / "product/product-db.sqlite3"
        if not db_src.exists():
            raise ValueError("Backup sem banco do produto")
        _integrity_check(db_src)

        binding_src = root / "product/rapid-bindings.json"
        retired_src = root / "product/rapid-retired-bindings.json"
        if binding_src.exists():
            _validate_binding_file(binding_src)
        if restore_rapid and _database_requires_bindings(db_src) and not binding_src.exists():
            raise ValueError(
                "Restore Rapid recusado: o banco do backup possui gerador(es) provisionado(s), "
                "mas o archive não contém product/rapid-bindings.json"
            )

        database_existed_before = DB_FILE.exists()
        pre_restore = _pre_restore_snapshot()
        bindings_before = _capture_state_file(RUNTIME_BINDINGS)
        retired_before = _capture_state_file(RETIRED_BINDINGS)
        env_before = _capture_state_file(ENV_FILE)
        totp_key_before = _capture_state_file(Path(TOTP_KEY_FILE))

        try:
            _install_database(db_src)

            if binding_src.exists():
                _install_state_file(binding_src, RUNTIME_BINDINGS, validate_bindings=True)
                bindings_restored = True
            elif not _database_requires_bindings(db_src):
                RUNTIME_BINDINGS.unlink(missing_ok=True)

            if retired_src.exists():
                _install_state_file(retired_src, RETIRED_BINDINGS)
                retired_bindings_restored = True
            else:
                RETIRED_BINDINGS.unlink(missing_ok=True)

            env_src = root / "product/rc-geradores.env"
            if env_src.exists():
                _restore_env_file(env_src)
                secrets_restored = True

            totp_key_src = root / "product/totp-fernet.key"
            if totp_key_src.exists():
                _restore_totp_key(totp_key_src)
                secrets_restored = True

            if restore_rapid:
                pairs = [
                    (root / "rapid-scada/BaseDAT", Path(RAPID_SCADA_ROOT) / "BaseDAT"),
                    (root / "rapid-scada/Config", Path(RAPID_SCADA_ROOT) / "Config"),
                    (root / "rapid-scada/ScadaCommConfig", Path(RAPID_SCADA_ROOT) / "ScadaComm/Config"),
                    (root / "rapid-scada/Archive", Path(RAPID_ARCHIVE_DIR)),
                ]
                for src, dst in pairs:
                    if src.exists():
                        previous, existed = _install_directory_tree(src, dst)
                        directory_swaps.append((dst, previous, existed))

            _integrity_check(DB_FILE)
        except Exception:
            for target, previous, existed in reversed(directory_swaps):
                try:
                    _rollback_directory_tree(target, previous, existed)
                except Exception:
                    pass
            _rollback_totp_key(totp_key_before)
            _rollback_env_file(env_before)
            _rollback_database(pre_restore, database_existed_before)
            _rollback_state_file(RUNTIME_BINDINGS, bindings_before)
            _rollback_state_file(RETIRED_BINDINGS, retired_before)
            raise
        else:
            for _target, previous, _existed in directory_swaps:
                _commit_directory_tree(previous)

    return {
        "ok": True,
        "archive": str(archive),
        "rapidRestored": bool(restore_rapid),
        "bindingsRestored": bindings_restored,
        "retiredBindingsRestored": retired_bindings_restored,
        "secretsRestored": secrets_restored,
        "preRestoreSnapshot": str(pre_restore) if pre_restore else None,
        "databaseQuickCheck": "ok",
        "databaseIntegrityCheck": "ok",
        "databaseForeignKeyCheck": "ok",
    }
