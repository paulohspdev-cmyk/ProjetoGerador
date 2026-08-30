import os
import shutil
import sqlite3
import tarfile
import tempfile
import time
from pathlib import Path

from . import db
from .config import DATA_DIR, DB_FILE, PROJECT_ROOT

BACKUP_DIR = DATA_DIR / "backups"
DEFAULT_RETENTION = int(os.environ.get("RC_BACKUP_RETENTION", "14"))
INCLUDE_SECRETS = os.environ.get("RC_BACKUP_INCLUDE_SECRETS", "0").strip() == "1"


def _snapshot_database(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with db.connect() as source:
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            dest.close()


def _add_if_exists(tar: tarfile.TarFile, path: Path, arcname: str):
    if path.exists():
        tar.add(path, arcname=arcname, recursive=True)


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

    try:
        with tempfile.TemporaryDirectory(prefix="rc-backup-") as tmp:
            db_copy = Path(tmp) / "product-db.sqlite3"
            _snapshot_database(db_copy)
            with tarfile.open(archive, "w:gz") as tar:
                tar.add(db_copy, arcname="product/product-db.sqlite3")
                # Segredos ficam fora do backup baixável por padrão. Para um pacote
                # de disaster recovery controlado, o operador pode habilitar
                # RC_BACKUP_INCLUDE_SECRETS=1 e deve proteger o arquivo externamente.
                if INCLUDE_SECRETS:
                    _add_if_exists(tar, Path("/etc/rc-geradores.env"), "product/rc-geradores.env")
                _add_if_exists(tar, PROJECT_ROOT / "rapid", "product/rapid")
                _add_if_exists(tar, PROJECT_ROOT / "controllers", "product/controllers")
                _add_if_exists(tar, Path("/opt/scada/BaseDAT"), "rapid-scada/BaseDAT")
                _add_if_exists(tar, Path("/opt/scada/Config"), "rapid-scada/Config")
                _add_if_exists(tar, Path("/opt/scada/ScadaComm/Config"), "rapid-scada/ScadaCommConfig")
        try:
            os.chmod(archive, 0o640)
        except PermissionError:
            pass
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
        f"{result} {size} bytes; secrets={'included' if INCLUDE_SECRETS else 'excluded'}",
    )
    if result == "OK":
        apply_retention(retention if retention is not None else DEFAULT_RETENTION)
    return {
        "id": backup_id,
        "path": str(archive),
        "size_bytes": size,
        "type": "Completo",
        "result": result,
        "detail": detail,
        "created_at": int(time.time()),
        "secretsIncluded": INCLUDE_SECRETS,
    }


def apply_retention(keep: int = DEFAULT_RETENTION):
    keep = max(1, min(int(keep), 365))
    archives = sorted(BACKUP_DIR.glob("rc-geradores-full-*.tar.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in archives[keep:]:
        try:
            path.unlink()
        except OSError:
            pass


def safe_archive_path(path: str | Path) -> Path:
    candidate = Path(path).resolve()
    root = BACKUP_DIR.resolve()
    if root not in candidate.parents or not candidate.name.startswith("rc-geradores-full-") or candidate.suffixes[-2:] != [".tar", ".gz"]:
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


def _restore_product_ownership() -> None:
    try:
        shutil.chown(DB_FILE, user="rcgeradores", group="rcgeradores")
        os.chmod(DB_FILE, 0o640)
    except (LookupError, PermissionError, FileNotFoundError):
        pass


def restore_archive(archive_path: str | Path, restore_rapid: bool = True) -> dict:
    """Restaura backup local. Deve ser chamado pelo utilitário administrativo como root.

    A API web não chama esta função diretamente para evitar que uma sessão HTTP possa
    substituir a própria instalação. O CLI para serviços, restaura e sobe novamente.
    """
    archive = safe_archive_path(archive_path)
    with tempfile.TemporaryDirectory(prefix="rc-restore-") as tmp:
        root = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            _validate_members(tar, root)
            # Ubuntu 24.04 usa Python 3.12; o filtro data aplica uma segunda camada
            # de proteção contra metadados perigosos durante a extração.
            tar.extractall(root, filter="data")

        db_src = root / "product/product-db.sqlite3"
        if not db_src.exists():
            raise ValueError("Backup sem banco do produto")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(db_src, DB_FILE)
        _restore_product_ownership()

        env_src = root / "product/rc-geradores.env"
        if env_src.exists():
            shutil.copy2(env_src, "/etc/rc-geradores.env")
            os.chmod("/etc/rc-geradores.env", 0o640)
            try:
                shutil.chown("/etc/rc-geradores.env", user="root", group="rcgeradores")
            except (LookupError, PermissionError):
                pass

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

    return {
        "ok": True,
        "archive": str(archive),
        "rapidRestored": bool(restore_rapid),
        "secretsRestored": env_src.exists(),
    }
