import ipaddress
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

from cryptography.fernet import Fernet

# Toda configuração sensível precisa ser definida antes de importar app.config.
tmp = tempfile.TemporaryDirectory(prefix="rc-hardening-")
root = Path(tmp.name)
data_dir = root / "data"
key_file = root / "secrets" / "totp.key"
offsite_dir = root / "offsite"
offsite_key = root / "offsite.key"
offsite_key.write_bytes(Fernet.generate_key() + b"\n")

os.environ["RC_DATA_DIR"] = str(data_dir)
os.environ["RC_DB_FILE"] = str(data_dir / "rc-geradores.db")
os.environ["RC_TOTP_KEY_FILE"] = str(key_file)
os.environ["RC_BACKUP_OFFSITE_DIR"] = str(offsite_dir)
os.environ["RC_BACKUP_OFFSITE_KEY_FILE"] = str(offsite_key)
os.environ["RC_BACKUP_OFFSITE_REQUIRED"] = "1"
os.environ["RC_BACKUP_INCLUDE_SECRETS"] = "0"
os.environ["RC_RAPID_REMOTE_ALLOWED_CIDRS"] = "10.0.0.0/8,2001:db8::/32"
os.environ["RC_RAPID_REQUIRE_ALLOWLIST"] = "1"
os.environ["RC_RETENTION_AUDIT_DAYS"] = "1"
os.environ["RC_RETENTION_EVENT_DAYS"] = "1"
os.environ["RC_RETENTION_PROCESS_DAYS"] = "1"
os.environ["RC_RETENTION_NOTIFICATION_DAYS"] = "1"

from app import (  # noqa: E402
    db,
    domain_store,
    industrial_store,
    ops_store,
    platform_store,
    transport_store,
)
from app.backup_manager import create_full_backup  # noqa: E402
from app.bridge_runtime import HardenedBridgePort, REMOTE_ALLOWED_NETWORKS  # noqa: E402
from app.data_maintenance import apply_data_retention  # noqa: E402
from app.migrations import LATEST_SCHEMA_VERSION, run_migrations  # noqa: E402
from app.secret_box import PREFIX, protect_secret, reveal_secret  # noqa: E402


def init_all() -> None:
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    transport_store.init_transport_db()
    domain_store.init_domain_db()
    industrial_store.init_industrial_db()


init_all()

# Migrações precisam ser idempotentes e registrar a versão suportada.
assert run_migrations() == LATEST_SCHEMA_VERSION
assert run_migrations() == LATEST_SCHEMA_VERSION
with db.connect() as conn:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    recorded = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
assert int(version) == LATEST_SCHEMA_VERSION
assert int(recorded) == LATEST_SCHEMA_VERSION

# O segredo TOTP não pode ficar em texto claro no armazenamento.
plain_totp = "JBSWY3DPEHPK3PXP"
protected = protect_secret(plain_totp)
assert protected.startswith(PREFIX)
assert plain_totp not in protected
revealed, legacy = reveal_secret(protected)
assert revealed == plain_totp
assert legacy is False
assert key_file.exists()
assert stat.S_IMODE(key_file.stat().st_mode) == 0o600

# Retenção deve remover auditoria expirada e preservar registro recente.
db.add_audit("hardening-test", "old", "system", "old", "old")
db.add_audit("hardening-test", "new", "system", "new", "new")
now = int(time.time())
with db.connect() as conn:
    conn.execute("UPDATE audit_log SET created_at=? WHERE entity_id='old'", (now - 3 * 86400,))
removed = apply_data_retention(now=now)
assert removed["audit_log"] >= 1
with db.connect() as conn:
    assert conn.execute("SELECT 1 FROM audit_log WHERE entity_id='old'").fetchone() is None
    assert conn.execute("SELECT 1 FROM audit_log WHERE entity_id='new'").fetchone() is not None

# Backup obrigatório off-site só é aceito se existir cópia criptografada utilizável.
backup = create_full_backup("hardening-test", retention=2)
assert backup["result"] == "OK", backup
assert backup["offsitePath"], backup
archive = Path(backup["path"])
encrypted = Path(backup["offsitePath"])
assert archive.is_file() and encrypted.is_file()
with tarfile.open(archive, "r:gz") as tar:
    names = set(tar.getnames())
    assert "product/product-db.sqlite3" in names
    assert "product/rc-geradores.env" not in names
    assert "product/totp-fernet.key" not in names
cipher = Fernet(offsite_key.read_bytes().strip())
decrypted = cipher.decrypt(encrypted.read_bytes())
assert decrypted[:2] == b"\x1f\x8b"

# Allowlist reverse TCP deve aceitar apenas redes explicitamente configuradas.
assert REMOTE_ALLOWED_NETWORKS
port = HardenedBridgePort(15050)
assert port._allowed(ipaddress.ip_address("10.20.30.40")) is True
assert port._allowed(ipaddress.ip_address("192.168.1.50")) is False
assert port._allowed(ipaddress.ip_address("2001:db8::10")) is True

# Quando a política exigir allowlist, configuração vazia precisa falhar no import.
child_env = os.environ.copy()
child_env["RC_RAPID_REMOTE_ALLOWED_CIDRS"] = ""
child_env["RC_RAPID_REQUIRE_ALLOWLIST"] = "1"
failed = subprocess.run(
    [sys.executable, "-c", "import app.bridge_runtime"],
    cwd=Path(__file__).resolve().parents[1],
    env=child_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    check=False,
)
assert failed.returncode != 0
assert "RC_RAPID_REQUIRE_ALLOWLIST=1 exige" in failed.stdout

print("RC Geradores production hardening smoke: OK")
tmp.cleanup()
