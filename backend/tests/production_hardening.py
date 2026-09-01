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
    bridge,
    db,
    domain_store,
    industrial_store,
    ops_store,
    platform_store,
    scheduler_jobs,
    transport_store,
)
from app.backup_manager import create_full_backup, materialize_offsite_backup  # noqa: E402
from app.bridge_runtime import (  # noqa: E402
    FRAMING_MODBUS_RTU,
    FRAMING_MODBUS_TCP,
    HardenedBridgePort,
    REMOTE_ALLOWED_NETWORKS,
    _modbus_crc16,
    _remote_framing_for_generator,
    _rtu_frame,
    _validate_rtu_crc,
)
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

# O backup local continua sem segredos por padrão. O envelope off-site, por ser
# autenticado/criptografado, carrega a chave TOTP necessária para DR total.
backup = create_full_backup("hardening-test", retention=2)
assert backup["result"] == "OK", backup
assert backup["offsitePath"], backup
assert backup["offsiteCarriesTotpRecoveryKey"] is True
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

# A recuperação off-site precisa autenticar, validar o SQLite e produzir um
# archive local restaurável que contenha a chave TOTP protegida pelo envelope.
materialized = materialize_offsite_backup(encrypted, key_file=offsite_key)
assert materialized.is_file()
assert materialized != archive
with tarfile.open(materialized, "r:gz") as tar:
    recovered_names = set(tar.getnames())
    assert "product/product-db.sqlite3" in recovered_names
    assert "product/totp-fernet.key" in recovered_names
    assert "product/rc-geradores.env" not in recovered_names

# Chave off-site errada deve falhar antes de materializar qualquer backup.
wrong_key = root / "wrong-offsite.key"
wrong_key.write_bytes(Fernet.generate_key() + b"\n")
try:
    materialize_offsite_backup(encrypted, key_file=wrong_key)
except ValueError as exc:
    assert "não autentica" in str(exc)
else:
    raise AssertionError("envelope off-site aceitou chave incorreta")

# Allowlist reverse TCP deve aceitar apenas redes explicitamente configuradas.
assert REMOTE_ALLOWED_NETWORKS
port = HardenedBridgePort(15050)
assert port._allowed(ipaddress.ip_address("10.20.30.40")) is True
assert port._allowed(ipaddress.ip_address("192.168.1.50")) is False
assert port._allowed(ipaddress.ip_address("2001:db8::10")) is True

# O framing reverse TCP é definido pelo Controller Pack: IG200 mantém MBAP e
# IG4 200, quando usado atrás do modem RS485, usa RTU transparente com CRC16.
assert _remote_framing_for_generator({"controller_model": "InteliGen 200"}) == FRAMING_MODBUS_TCP
assert _remote_framing_for_generator({"controller_model": "IG4 200"}) == FRAMING_MODBUS_RTU
rtu_request = _rtu_frame(3, bridge.read_holding_pdu(1000, 1))
assert rtu_request.hex() == "030303e800010598"
assert _modbus_crc16(rtu_request[:-2]) == 0x9805
_validate_rtu_crc(rtu_request)
bad_crc = rtu_request[:-1] + bytes([rtu_request[-1] ^ 0x01])
try:
    _validate_rtu_crc(bad_crc)
except ValueError as exc:
    assert "CRC RTU inválido" in str(exc)
else:
    raise AssertionError("bridge aceitou frame RTU com CRC inválido")

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

# Scheduler precisa particionar jobs: o worker operacional não executa backup/
# relatório e o heavy worker não consome notificações.
assert scheduler_jobs.OPERATIONAL_JOB_KINDS.isdisjoint(scheduler_jobs.HEAVY_JOB_KINDS)
assert scheduler_jobs.OPERATIONAL_JOB_KINDS | scheduler_jobs.HEAVY_JOB_KINDS == scheduler_jobs.ALLOWED_JOB_KINDS
job_now = int(time.time()) - 1
platform_store.upsert_scheduler_job(
    {
        "id": "job-hardening-notification",
        "name": "notificação",
        "kind": "notification",
        "interval_seconds": 60,
        "next_run": job_now,
        "enabled": True,
        "payload": {},
    },
    "hardening-test",
)
platform_store.upsert_scheduler_job(
    {
        "id": "job-hardening-backup",
        "name": "backup",
        "kind": "backup",
        "interval_seconds": 60,
        "next_run": job_now,
        "enabled": True,
        "payload": {},
    },
    "hardening-test",
)
executed: list[str] = []
original_run = scheduler_jobs.run_scheduler_job


def fake_run(job: dict) -> str:
    kind = str(job.get("kind") or "")
    executed.append(kind)
    return f"OK {kind}"


scheduler_jobs.run_scheduler_job = fake_run
try:
    assert scheduler_jobs.process_scheduler_jobs(scheduler_jobs.OPERATIONAL_JOB_KINDS) == 1
    assert executed == ["notification"]
    rows = {item["id"]: item for item in platform_store.list_scheduler_jobs()}
    assert rows["job-hardening-notification"]["last_result"] == "OK notification"
    assert rows["job-hardening-backup"]["last_run"] is None

    executed.clear()
    assert scheduler_jobs.process_scheduler_jobs(scheduler_jobs.HEAVY_JOB_KINDS) == 1
    assert executed == ["backup"]
    rows = {item["id"]: item for item in platform_store.list_scheduler_jobs()}
    assert rows["job-hardening-backup"]["last_result"] == "OK backup"
finally:
    scheduler_jobs.run_scheduler_job = original_run

print("RC Geradores production hardening smoke: OK")
tmp.cleanup()
