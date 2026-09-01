import os
import shutil
import sqlite3
import tarfile
import tempfile
import time
from pathlib import Path

from cryptography.fernet import Fernet

from . import db
from .config import (
    BACKUP_OFFSITE_DIR,
    BACKUP_OFFSITE_KEY_FILE,
    BACKUP_OFFSITE_REQUIRED,
    DATA_DIR,
    DB_FILE,
    PROJECT_ROOT,
    TOTP_KEY_FILE,
)

BACKUP_DIR = DATA_DIR / "backups"
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


def _add_if_exists(tar: tarfile.TarFile, path: Path, arcname: str):
    if path.exists():
        tar.add(path, arcname=arcname, recursive=True)


def _offsite_target(archive: Path) -> Path | None:
    if not BACKUP_OFFSITE_DIR:
        if BACKUP_OFFSITE_REQUIRED:
            raise ValueError("RC_BACKUP_OFFSITE_REQUIRED=1, mas RC_BACKUP_OFFSITE_DIR não foi configurado")
        return None
    target_dir = Path(BACKUP_OFFSITE_DIR).resolve()
    data_root = DATA_DIR.resolve()
    if target_dir == data_root or data_root in target_dir.parents:
        raise ValueError("Destino off-site deve ficar fora de RC_DATA_DIR")
    if not BACKUP_OFFSITE_KEY_FILE:
        raise ValueError("Backup off-site exige RC_BACKUP_OFFSITE_KEY_FILE para criptografia")
    key_path = Path(BACKUP_OFFSITE_KEY_FILE)
    if not key_path.is_file():
        raise ValueError(f"Chave de backup off-site não encontrada: {key_path}")
    key = key_path.read_bytes().strip()
    cipher = Fernet(key)
    target_dir.mkdir(parents=True, exist_ok=True)
    encrypted = cipher.encrypt(archive.read_bytes())
    target = target_dir / f"{archive.name}.fernet"
    staged = target_dir / f".{target.name}.{os.getpid()}.tmp"
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

    try:
        with tempfile.TemporaryDirectory(prefix="rc-backup-") as tmp:
            db_copy = Path(tmp) / "product-db.sqlite3"
            _snapshot_database(db_copy)
            with tarfile.open(archive, "w:gz") as tar:
                tar.add(db_copy, arcname="product/product-db.sqlite3")
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
        f"{result} {size} bytes; secrets={'included' if INCLUDE_SECRETS else 'excluded'}; offsite={bool(offsite_path)}",
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
        "secretsIncluded": INCLUDE_SECRETS,
        "totpSecretEncryptedInDatabase": True,
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


def _validate_members(tar: tarfile.TarFile, root: Path) -> None:
    root_resolved = root.resolve()
    for member in tar.getmembers():
        if member.islnk() or member.issym() or member.isdev() or member.isfifo():
            raise ValueError("Backup contém link ou dispositivo não permitido")
        resolved = (root / member.name).resolve()
        if root_resolved not in resolved.parents and resolved != root_resolved:
            raise ValueError("Backup contém caminho inseguro")


def _restore_product_ownership(path: Path = DB_FILE) -> None:
    try:
        shutil.chown(path, user="rcgeradores", group="rcgeradores")
        os.chmod(path, 0o640)
    except (LookupError, PermissionError, FileNotFoundError):
        pass


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

    with tempfile.TemporaryDirectory(prefix="rc-restore-") as tmp:
        root = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            _validate_members(tar, root)
            tar.extractall(root, filter="data")

        db_src = root / "product/product-db.sqlite3"
        if not db_src.exists():
            raise ValueError("Backup sem banco do produto")
        _quick_check(db_src)
        pre_restore = _pre_restore_snapshot()

        try:
            _install_database(db_src)

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
            raise

    return {
        "ok": True,
        "archive": str(archive),
        "rapidRestored": bool(restore_rapid),
        "secretsRestored": secrets_restored,
        "preRestoreSnapshot": str(pre_restore) if pre_restore else None,
        "databaseQuickCheck": "ok",
    }
