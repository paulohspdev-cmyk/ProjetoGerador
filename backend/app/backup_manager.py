import json
import os
import shutil
import sqlite3
import tarfile
import tempfile
import time
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
    RAPID_BINDINGS_FILE,
    TOTP_KEY_FILE,
)

BACKUP_DIR = DATA_DIR / "backups"
RUNTIME_BINDINGS = Path(RAPID_BINDINGS_FILE)
RETIRED_BINDINGS = DATA_DIR / "rapid-retired-bindings.json"
DEFAULT_RETENTION = int(os.environ.get("RC_BACKUP_RETENTION", "14"))
INCLUDE_SECRETS = os.environ.get("RC_BACKUP_INCLUDE_SECRETS", "0").strip() == "1"


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


def _build_offsite_payload(archive: Path, target: Path) -> bool:
    """Cria pacote temporário para DR sem expor a chave TOTP no backup local."""
    totp_key = Path(TOTP_KEY_FILE)
    with tempfile.TemporaryDirectory(prefix="rc-offsite-validate-") as tmp:
        with tarfile.open(archive, "r:gz") as source:
            _validate_members(source, Path(tmp))
            members = source.getmembers()
            with tarfile.open(target, "w:gz") as destination:
                for member in members:
                    fileobj = source.extractfile(member) if member.isfile() else None
                    destination.addfile(member, fileobj)
                if totp_key.is_file() and not any(
                    member.name == "product/totp-fernet.key" for member in members
                ):
                    destination.add(totp_key, arcname="product/totp-fernet.key", recursive=False)
                    return True
    return any(member.name == "product/totp-fernet.key" for member in members)


def _offsite_target(archive: Path) -> Path | None:
    if not BACKUP_OFFSITE_DIR:
        if BACKUP_OFFSITE_REQUIRED:
            raise ValueError("RC_BACKUP_OFFSITE_REQUIRED=1, mas RC_BACKUP_OFFSITE_DIR não foi configurado")
        return None
    target_dir = Path(BACKUP_OFFSITE_DIR).resolve()
    data_root = DATA_DIR.resolve()
    if target_dir == data_root or data_root in target_dir.parents:
        raise ValueError("Destino off-site deve ficar fora de RC_DATA_DIR")
    cipher = _offsite_cipher()
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{archive.name}.fernet"
    staged = target_dir / f".{target.name}.{os.getpid()}.tmp"
    with tempfile.TemporaryDirectory(prefix="rc-offsite-payload-") as tmp:
        payload = Path(tmp) / archive.name
        _build_offsite_payload(archive, payload)
        encrypted = cipher.encrypt(payload.read_bytes())
    staged.write_bytes(encrypted)
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
    archive = BACKUP_DIR / f"rc-geradores-full-{stamp}.tar.gz"
    result = "OK"
    detail = ""
    offsite_path = None
    bindings_included = False

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

            with tarfile.open(archive, "w:gz") as tar:
                tar.add(db_copy, arcname="product/product-db.sqlite3")
                _add_if_exists(tar, RUNTIME_BINDINGS, "product/rapid-bindings.json")
                _add_if_exists(tar, RETIRED_BINDINGS, "product/rapid-retired-bindings.json")
                if INCLUDE_SECRETS:
                    _add_if_exists(tar, Path("/etc/rc-geradores.env"), "product/rc-geradores.env")
                    _add_if_exists(tar, Path(TOTP_KEY_FILE), "product/totp-fernet.key")
                _add_if_exists(tar, PROJECT_ROOT / "rapid", "product/rapid")
                _add_if_exists(tar, PROJECT_ROOT / "controllers", "product/controllers")
                _add_if_exists(tar, Path("/opt/scada/BaseDAT"), "rapid-scada/BaseDAT")
                _add_if_exists(tar, Path("/opt/scada/Config"), "rapid-scada/Config")
                _add_if_exists(tar, Path("/opt/scada/ScadaComm/Config"), "rapid-scada/ScadaCommConfig")
        try:
            os.chmod(archive, 0o640)
        except PermissionError:
            pass
        offsite = _offsite_target(archive)
        offsite_path = str(offsite) if offsite else None
    except Exception as exc:
        result = "Falha"
        detail = str(exc)[:1000]
        archive.unlink(missing_ok=True)

    size = archive.stat().st_size if archive.exists() else 0
    backup_id = f"bk-{stamp}"
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
    }


def apply_retention(keep: int = DEFAULT_RETENTION):
    keep = max(1, min(int(keep), 365))
    archives = sorted(
        BACKUP_DIR.glob("rc-geradores-full-*.tar.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in archives[keep:]:
        try:
            path.unlink()
        except OSError:
            pass


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
    try:
        clear = cipher.decrypt(source.read_bytes())
    except InvalidToken as exc:
        raise ValueError("Envelope off-site não autentica com a chave informada") from exc

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    plain_name = source.name.removesuffix(".fernet")
    target = BACKUP_DIR / plain_name
    if target.exists():
        stem = plain_name.removesuffix(".tar.gz")
        target = BACKUP_DIR / f"{stem}-recovered-{int(time.time())}.tar.gz"
    staged = BACKUP_DIR / f".{target.name}.{os.getpid()}.tmp"
    staged.write_bytes(clear)
    try:
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


def _install_database(source: Path) -> None:
    _quick_check(source)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    staged = DATA_DIR / f".{DB_FILE.name}.restore-{os.getpid()}.tmp"
    shutil.copy2(source, staged)
    _quick_check(staged)
    _restore_product_ownership(staged)
    os.replace(staged, DB_FILE)
    _restore_product_ownership(DB_FILE)
    _quick_check(DB_FILE)


def _rollback_database(snapshot: Path | None) -> None:
    if not snapshot or not snapshot.exists():
        return
    staged = DATA_DIR / f".{DB_FILE.name}.rollback-{os.getpid()}.tmp"
    shutil.copy2(snapshot, staged)
    _quick_check(staged)
    _restore_product_ownership(staged)
    os.replace(staged, DB_FILE)
    _restore_product_ownership(DB_FILE)
    _quick_check(DB_FILE)


def _restore_totp_key(source: Path) -> None:
    target = Path(TOTP_KEY_FILE)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    os.chmod(target, 0o600)
    try:
        shutil.chown(target, user="rcgeradores", group="rcgeradores")
    except (LookupError, PermissionError):
        pass


def restore_archive(archive_path: str | Path, restore_rapid: bool = True) -> dict:
    """Restaura backup local por CLI administrativo, nunca por uma sessão HTTP."""
    archive = safe_archive_path(archive_path)
    pre_restore: Path | None = None
    secrets_restored = False
    bindings_restored = False
    retired_bindings_restored = False

    with tempfile.TemporaryDirectory(prefix="rc-restore-") as tmp:
        root = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            _validate_members(tar, root)
            tar.extractall(root, filter="data")

        db_src = root / "product/product-db.sqlite3"
        if not db_src.exists():
            raise ValueError("Backup sem banco do produto")
        _quick_check(db_src)

        binding_src = root / "product/rapid-bindings.json"
        retired_src = root / "product/rapid-retired-bindings.json"
        if binding_src.exists():
            _validate_binding_file(binding_src)
        if restore_rapid and _database_requires_bindings(db_src) and not binding_src.exists():
            raise ValueError(
                "Restore Rapid recusado: o banco do backup possui gerador(es) provisionado(s), "
                "mas o archive não contém product/rapid-bindings.json"
            )

        pre_restore = _pre_restore_snapshot()
        bindings_before = _capture_state_file(RUNTIME_BINDINGS)
        retired_before = _capture_state_file(RETIRED_BINDINGS)

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

            env_src = root / "product/rc-geradores.env"
            if env_src.exists():
                shutil.copy2(env_src, "/etc/rc-geradores.env")
                os.chmod("/etc/rc-geradores.env", 0o640)
                try:
                    shutil.chown("/etc/rc-geradores.env", user="root", group="rcgeradores")
                except (LookupError, PermissionError):
                    pass
                secrets_restored = True

            totp_key_src = root / "product/totp-fernet.key"
            if totp_key_src.exists():
                _restore_totp_key(totp_key_src)
                secrets_restored = True

            if restore_rapid:
                pairs = [
                    (root / "rapid-scada/BaseDAT", Path("/opt/scada/BaseDAT")),
                    (root / "rapid-scada/Config", Path("/opt/scada/Config")),
                    (root / "rapid-scada/ScadaCommConfig", Path("/opt/scada/ScadaComm/Config")),
                ]
                for src, dst in pairs:
                    if src.exists():
                        if dst.exists():
                            shutil.rmtree(dst)
                        shutil.copytree(src, dst)
        except Exception:
            _rollback_database(pre_restore)
            _rollback_state_file(RUNTIME_BINDINGS, bindings_before)
            _rollback_state_file(RETIRED_BINDINGS, retired_before)
            raise

    return {
        "ok": True,
        "archive": str(archive),
        "rapidRestored": bool(restore_rapid),
        "bindingsRestored": bindings_restored,
        "retiredBindingsRestored": retired_bindings_restored,
        "secretsRestored": secrets_restored,
        "preRestoreSnapshot": str(pre_restore) if pre_restore else None,
        "databaseQuickCheck": "ok",
    }
