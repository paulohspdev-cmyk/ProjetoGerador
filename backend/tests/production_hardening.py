import ipaddress
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
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
os.environ["RC_ENV_FILE"] = str(root / "rc-geradores.env")
scada_root = root / "scada"
for rel in ("BaseDAT", "Config", "ScadaComm/Config"):
    target = scada_root / rel
    target.mkdir(parents=True, exist_ok=True)
    (target / "placeholder.txt").write_text("test")
os.environ["RC_RAPID_SCADA_ROOT"] = str(scada_root)
os.environ["RC_TOTP_KEY_FILE"] = str(key_file)
os.environ["RC_BACKUP_OFFSITE_DIR"] = str(offsite_dir)
os.environ["RC_BACKUP_OFFSITE_KEY_FILE"] = str(offsite_key)
os.environ["RC_BACKUP_OFFSITE_REQUIRED"] = "1"
os.environ["RC_BACKUP_INCLUDE_SECRETS"] = "0"
rapid_archive_dir = root / "rapid-archive"
rapid_archive_dir.mkdir(parents=True, exist_ok=True)
(rapid_archive_dir / "history.bin").write_bytes(b"history")
os.environ["RC_RAPID_ARCHIVE_DIR"] = str(rapid_archive_dir)
os.environ["RC_RAPID_REMOTE_ALLOWED_CIDRS"] = "10.0.0.0/8,2001:db8::/32"
os.environ["RC_RAPID_REQUIRE_ALLOWLIST"] = "1"
os.environ["RC_RETENTION_AUDIT_DAYS"] = "1"
os.environ["RC_RETENTION_EVENT_DAYS"] = "1"
os.environ["RC_RETENTION_PROCESS_DAYS"] = "1"
os.environ["RC_RETENTION_NOTIFICATION_DAYS"] = "1"

from app import config as app_config  # noqa: E402
from app import rapid as rapid_module  # noqa: E402
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
from app import backup_manager  # noqa: E402
from app.backup_manager import create_full_backup, materialize_offsite_backup, restore_archive  # noqa: E402

# Sem override explicito, bindings runtime devem acompanhar RC_DATA_DIR.
assert app_config.RAPID_BINDINGS_FILE == data_dir / "rapid-bindings.json", app_config.RAPID_BINDINGS_FILE
from app.bridge_runtime import (  # noqa: E402
    FRAMING_MODBUS_RTU,
    FRAMING_MODBUS_TCP,
    HardenedBridgePort,
    PORT_ALLOWED_NETWORKS,
    REMOTE_ALLOWED_NETWORKS,
    _modbus_crc16,
    _remote_framing_for_generator,
    _rtu_frame,
    _validate_rtu_crc,
)
from app.data_maintenance import apply_data_retention  # noqa: E402
from app.migrations import LATEST_SCHEMA_VERSION, run_migrations  # noqa: E402
from app.rapid import _is_undefined_raw  # noqa: E402
from app.secret_box import PREFIX, protect_secret, reveal_secret  # noqa: E402
from app.production_guard import validate_production_runtime  # noqa: E402


# Off-site precisa ser mount real: diretório ausente ou no mesmo filesystem
# do banco não pode ser aceito como recuperação de desastre.
data_dir.mkdir(parents=True, exist_ok=True)
try:
    backup_manager._validate_offsite_target_dir(offsite_dir)
except ValueError as exc:
    assert "não existe" in str(exc)
else:
    raise AssertionError("off-site aceitou diretório ausente")

offsite_dir.mkdir(parents=True, exist_ok=True)
try:
    backup_manager._validate_offsite_target_dir(offsite_dir)
except ValueError as exc:
    assert "mesmo filesystem" in str(exc)
else:
    raise AssertionError("off-site aceitou diretório no mesmo filesystem")

# O ambiente de CI não possui segundo mount. A partir daqui simulamos apenas
# essa característica física para continuar testando envelope/restore.
_original_validate_offsite_target_dir = backup_manager._validate_offsite_target_dir
backup_manager._validate_offsite_target_dir = lambda _target: None


# Runtime de produção deve falhar fechado se o cookie de sessão puder viajar sem TLS.
_previous_environment = os.environ.get("RC_ENVIRONMENT")
_previous_cookie_secure = os.environ.get("RC_AUTH_COOKIE_SECURE")
_previous_api_docs = os.environ.get("RC_API_DOCS")
_previous_dse_lab = os.environ.get("RC_ENABLE_DSE_LAB_CONTROL")
_previous_ig4_lab = os.environ.get("RC_ENABLE_IG4_LAB_CONTROL")
_previous_trusted_proxy_cidrs = os.environ.get("RC_TRUSTED_PROXY_CIDRS")
try:
    os.environ["RC_ENVIRONMENT"] = "production"
    os.environ["RC_API_DOCS"] = "0"
    os.environ["RC_ENABLE_DSE_LAB_CONTROL"] = "0"
    os.environ["RC_ENABLE_IG4_LAB_CONTROL"] = "0"
    os.environ["RC_AUTH_COOKIE_SECURE"] = "0"
    try:
        validate_production_runtime()
    except RuntimeError as exc:
        assert "RC_AUTH_COOKIE_SECURE" in str(exc)
    else:
        raise AssertionError("produção aceitou cookie de sessão sem Secure")
    os.environ["RC_AUTH_COOKIE_SECURE"] = "1"
    os.environ["RC_TRUSTED_PROXY_CIDRS"] = "127.0.0.1/32,::1/128"
    validate_production_runtime()

    os.environ["RC_TRUSTED_PROXY_CIDRS"] = "0.0.0.0/0"
    try:
        validate_production_runtime()
    except RuntimeError as exc:
        assert "RC_TRUSTED_PROXY_CIDRS" in str(exc)
    else:
        raise AssertionError("produção aceitou confiar X-Real-IP de toda a Internet")

    os.environ["RC_TRUSTED_PROXY_CIDRS"] = "not-a-cidr"
    try:
        validate_production_runtime()
    except RuntimeError as exc:
        assert "RC_TRUSTED_PROXY_CIDRS" in str(exc)
    else:
        raise AssertionError("produção aceitou CIDR inválido para proxy confiável")
finally:
    for key, value in (
        ("RC_ENVIRONMENT", _previous_environment),
        ("RC_AUTH_COOKIE_SECURE", _previous_cookie_secure),
        ("RC_API_DOCS", _previous_api_docs),
        ("RC_ENABLE_DSE_LAB_CONTROL", _previous_dse_lab),
        ("RC_ENABLE_IG4_LAB_CONTROL", _previous_ig4_lab),
        ("RC_TRUSTED_PROXY_CIDRS", _previous_trusted_proxy_cidrs),
    ):
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


# DSE GenComm: sentinelas de instrumentação não podem virar valores físicos.
dse = {"controller_type": "DSE"}
assert _is_undefined_raw(dse, "rpm", 0xFFFB)
assert _is_undefined_raw(dse, "coolant_temperature", 0x7FFB)
assert _is_undefined_raw(dse, "voltage_l1", 0xFFFFFFFB)
assert _is_undefined_raw(dse, "power_kw", 0x7FFFFFFB)
assert not _is_undefined_raw(dse, "fuel_level", 100)
assert not _is_undefined_raw(dse, "battery_voltage", 124)
assert not _is_undefined_raw(dse, "controller_mode_raw", 0xFFFF)

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

# Reset de senha one-time deve ser atômico mesmo sob duas confirmações concorrentes.
reset_user = db.create_user(
    {
        "name": "Reset Concorrente",
        "email": "reset-race@example.test",
        "password_hash": "old-hash",
        "role": "visualizacao",
        "active": True,
    },
    actor="hardening-test",
)
reset_token = platform_store.create_password_reset(reset_user["id"], ttl=300)
with db.connect() as conn:
    conn.execute(
        "INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen,remote_ip,user_agent) "
        "VALUES (?,?,?,?,?,?,?)",
        ("reset-session", reset_user["id"], int(time.time()) + 300, int(time.time()), int(time.time()), "", "test"),
    )

reset_results = []
reset_lock = threading.Lock()


def run_reset(candidate_hash: str) -> None:
    result = platform_store.complete_password_reset(reset_token, candidate_hash)
    with reset_lock:
        reset_results.append((candidate_hash, result))


threads = [
    threading.Thread(target=run_reset, args=("new-hash-a",)),
    threading.Thread(target=run_reset, args=("new-hash-b",)),
]
for thread in threads:
    thread.start()
for thread in threads:
    thread.join()

winners = [(candidate, result) for candidate, result in reset_results if result]
assert len(winners) == 1, reset_results
with db.connect() as conn:
    stored = conn.execute(
        "SELECT password_hash FROM users WHERE id=?", (reset_user["id"],)
    ).fetchone()[0]
    active_sessions = conn.execute(
        "SELECT COUNT(*) FROM sessions WHERE user_id=?", (reset_user["id"],)
    ).fetchone()[0]
assert stored == winners[0][0]
assert active_sessions == 0
assert platform_store.complete_password_reset(reset_token, "third-hash") is None

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

# Retenção precisa manter filesystem e catálogo SQLite coerentes. Um backup
# expirado não pode continuar aparecendo na UI para depois falhar no download.
previous_backup_dir = backup_manager.BACKUP_DIR
retention_dir = data_dir / "retention-regression"
retention_dir.mkdir(parents=True, exist_ok=True)
old_retained = retention_dir / "rc-geradores-full-20000101-000000-old.tar.gz"
new_retained = retention_dir / "rc-geradores-full-20000102-000000-new.tar.gz"
old_retained.write_bytes(b"old")
new_retained.write_bytes(b"new")
os.utime(old_retained, (now - 20, now - 20))
os.utime(new_retained, (now - 10, now - 10))
with db.connect() as conn:
    conn.execute(
        "INSERT INTO backup_records(id,created_at,path,size_bytes,type,result,detail) VALUES (?,?,?,?,?,?,?)",
        ("retention-old", now - 20, str(old_retained), 3, "Completo", "OK", ""),
    )
    conn.execute(
        "INSERT INTO backup_records(id,created_at,path,size_bytes,type,result,detail) VALUES (?,?,?,?,?,?,?)",
        ("retention-new", now - 10, str(new_retained), 3, "Completo", "OK", ""),
    )
backup_manager.BACKUP_DIR = retention_dir
try:
    assert backup_manager.apply_retention(1) == 1
finally:
    backup_manager.BACKUP_DIR = previous_backup_dir
assert not old_retained.exists()
assert new_retained.exists()
with db.connect() as conn:
    assert conn.execute(
        "SELECT 1 FROM backup_records WHERE id='retention-old'"
    ).fetchone() is None
    assert conn.execute(
        "SELECT 1 FROM backup_records WHERE id='retention-new'"
    ).fetchone() is not None

# O backup local continua sem segredos por padrão. O envelope off-site, por ser
# autenticado/criptografado, carrega .env + chave TOTP para DR completo.
env_file = Path(os.environ["RC_ENV_FILE"])
env_file.write_text("RC_TEST_VALUE=offsite\n", encoding="utf-8")
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
    assert "rapid-scada/Archive/history.bin" in names
assert backup["rapidHistoricalArchiveIncluded"] is True

# F19: dois backups no mesmo segundo não podem compartilhar ID nem caminho.
backup2 = create_full_backup("hardening-test-2", retention=3)
assert backup2["result"] == "OK", backup2
assert backup2["id"] != backup["id"]
assert backup2["path"] != backup["path"]
assert Path(backup2["path"]).is_file() and archive.is_file()
cipher = Fernet(offsite_key.read_bytes().strip())
with encrypted.open("rb") as stream:
    assert stream.read(len(backup_manager.OFFSITE_STREAM_MAGIC)) == backup_manager.OFFSITE_STREAM_MAGIC

# Retenção off-site precisa limitar envelopes criptografados sem tocar outros arquivos.
previous_offsite_dir = backup_manager.BACKUP_OFFSITE_DIR
retention_offsite_dir = root / "offsite-retention"
retention_offsite_dir.mkdir(parents=True, exist_ok=True)
offsite_candidates = []
for index in range(3):
    item = retention_offsite_dir / f"rc-geradores-full-retention-{index}.tar.gz.fernet"
    item.write_bytes(f"backup-{index}".encode())
    os.utime(item, (now + index, now + index))
    offsite_candidates.append(item)
backup_manager.BACKUP_OFFSITE_DIR = str(retention_offsite_dir)
try:
    assert backup_manager.apply_offsite_retention(1) == 2
finally:
    backup_manager.BACKUP_OFFSITE_DIR = previous_offsite_dir
assert not offsite_candidates[0].exists()
assert not offsite_candidates[1].exists()
assert offsite_candidates[2].exists()

# Falha de limpeza remota não pode transformar um backup recém-concluído em falha.
original_offsite_retention = backup_manager.apply_offsite_retention
backup_manager.apply_offsite_retention = lambda _keep: (_ for _ in ()).throw(
    OSError("falha sintética de retenção remota")
)
try:
    warning_backup = create_full_backup("hardening-retention-warning", retention=10)
finally:
    backup_manager.apply_offsite_retention = original_offsite_retention
assert warning_backup["result"] == "OK", warning_backup
assert warning_backup["retentionWarnings"], warning_backup
assert "retenção off-site" in warning_backup["detail"], warning_backup
with db.connect() as conn:
    warning_row = conn.execute(
        "SELECT detail FROM backup_records WHERE id=?",
        (warning_backup["id"],),
    ).fetchone()
assert warning_row is not None
assert "retenção off-site" in str(warning_row["detail"])

# A recuperação off-site precisa autenticar, validar o SQLite e produzir um
# archive local restaurável que contenha a chave TOTP protegida pelo envelope.
materialized = materialize_offsite_backup(encrypted, key_file=offsite_key)
assert materialized.is_file()
assert materialized != archive
with tarfile.open(materialized, "r:gz") as tar:
    recovered_names = set(tar.getnames())
    assert "product/product-db.sqlite3" in recovered_names
    assert "product/totp-fernet.key" in recovered_names
    assert "product/rc-geradores.env" in recovered_names
    recovered_env = tar.extractfile("product/rc-geradores.env")
    assert recovered_env is not None
    assert recovered_env.read() == b"RC_TEST_VALUE=offsite\n"

# Envelope chunked truncado precisa falhar fechado antes de materializar archive.
truncated = offsite_dir / "rc-geradores-full-truncated.tar.gz.fernet"
shutil.copy2(encrypted, truncated)
with truncated.open("r+b") as stream:
    stream.truncate(max(len(backup_manager.OFFSITE_STREAM_MAGIC) + 8, truncated.stat().st_size - 32))
try:
    materialize_offsite_backup(truncated, key_file=offsite_key)
except ValueError as exc:
    assert "truncado" in str(exc) or "terminador" in str(exc)
else:
    raise AssertionError("envelope off-site truncado foi aceito")

# Compatibilidade: envelopes legados com um único token Fernet continuam legíveis.
legacy_envelope = offsite_dir / "rc-geradores-full-legacy.tar.gz.fernet"
legacy_envelope.write_bytes(cipher.encrypt(materialized.read_bytes()))
legacy_materialized = materialize_offsite_backup(legacy_envelope, key_file=offsite_key)
assert legacy_materialized.is_file()
with tarfile.open(legacy_materialized, "r:gz") as tar:
    assert "product/product-db.sqlite3" in set(tar.getnames())

# Restore real: banco, segredo e Rapid devem voltar ao snapshot do archive.
env_file.write_text("RC_TEST_VALUE=before\n", encoding="utf-8")
original_totp_key = key_file.read_bytes()
original_base = (scada_root / "BaseDAT" / "placeholder.txt").read_text(encoding="utf-8")

# O snapshot não contém retired bindings quando o arquivo não existia.
backup_manager.RETIRED_BINDINGS.unlink(missing_ok=True)
previous_include_secrets = backup_manager.INCLUDE_SECRETS
backup_manager.INCLUDE_SECRETS = True
try:
    restore_source = create_full_backup("restore-roundtrip", retention=5)
finally:
    backup_manager.INCLUDE_SECRETS = previous_include_secrets
assert restore_source["result"] == "OK", restore_source

# Estado criado depois do backup precisa desaparecer num restore completo.
backup_manager.RETIRED_BINDINGS.parent.mkdir(parents=True, exist_ok=True)
backup_manager.RETIRED_BINDINGS.write_text('[{"stale": true}]', encoding="utf-8")
db.add_audit("hardening-test", "after-backup", "system", "after-backup", "must disappear")
env_file.write_text("RC_TEST_VALUE=mutated\n", encoding="utf-8")
key_file.write_bytes(Fernet.generate_key() + b"\n")
(scada_root / "BaseDAT" / "placeholder.txt").write_text("mutated", encoding="utf-8")

restored = restore_archive(restore_source["path"], restore_rapid=True)
assert restored["databaseIntegrityCheck"] == "ok"
assert env_file.read_text(encoding="utf-8") == "RC_TEST_VALUE=before\n"
assert key_file.read_bytes() == original_totp_key
assert not backup_manager.RETIRED_BINDINGS.exists()
assert not list(key_file.parent.glob(f".{key_file.name}.restore-*.tmp"))
assert (scada_root / "BaseDAT" / "placeholder.txt").read_text(encoding="utf-8") == original_base
with db.connect() as conn:
    assert conn.execute(
        "SELECT 1 FROM audit_log WHERE entity_id='after-backup'"
    ).fetchone() is None

# Falha parcial no Rapid precisa restaurar também env/chave/diretórios anteriores.
env_file.write_text("RC_TEST_VALUE=state-before-failure\n", encoding="utf-8")
pre_failure_env = env_file.read_bytes()
pre_failure_key = key_file.read_bytes()
pre_failure_base = (scada_root / "BaseDAT" / "placeholder.txt").read_bytes()
original_install_tree = backup_manager._install_directory_tree
calls = {"count": 0}


def fail_during_directory_restore(source, target):
    calls["count"] += 1
    if calls["count"] == 2:
        raise RuntimeError("falha sintética durante restore Rapid")
    return original_install_tree(source, target)


backup_manager._install_directory_tree = fail_during_directory_restore
try:
    restore_archive(restore_source["path"], restore_rapid=True)
except RuntimeError as exc:
    assert "falha sintética" in str(exc)
else:
    raise AssertionError("restore deveria ter falhado para exercitar rollback")
finally:
    backup_manager._install_directory_tree = original_install_tree

assert env_file.read_bytes() == pre_failure_env
assert key_file.read_bytes() == pre_failure_key
assert (scada_root / "BaseDAT" / "placeholder.txt").read_bytes() == pre_failure_base

# Se o restore começou sem banco prévio e falha depois de instalar um, rollback
# precisa voltar ao estado "sem banco", inclusive removendo sidecars.
previous_db_file = backup_manager.DB_FILE
previous_data_dir = backup_manager.DATA_DIR
empty_restore_dir = root / "empty-restore"
empty_restore_dir.mkdir()
try:
    backup_manager.DATA_DIR = empty_restore_dir
    backup_manager.DB_FILE = empty_restore_dir / "new.db"
    backup_manager.DB_FILE.write_bytes(b"candidate")
    Path(str(backup_manager.DB_FILE) + "-wal").write_bytes(b"wal")
    Path(str(backup_manager.DB_FILE) + "-shm").write_bytes(b"shm")
    backup_manager._rollback_database(None, existed_before=False)
    assert not backup_manager.DB_FILE.exists()
    assert not Path(str(backup_manager.DB_FILE) + "-wal").exists()
    assert not Path(str(backup_manager.DB_FILE) + "-shm").exists()
finally:
    backup_manager.DB_FILE = previous_db_file
    backup_manager.DATA_DIR = previous_data_dir

# Chave off-site errada deve falhar antes de materializar qualquer backup.
# Use o envelope mais novo porque a retenção pode legitimamente remover o primeiro.
wrong_key_target = Path(restore_source["offsitePath"])
assert wrong_key_target.is_file()
wrong_key = root / "wrong-offsite.key"
wrong_key.write_bytes(Fernet.generate_key() + b"\n")
try:
    materialize_offsite_backup(wrong_key_target, key_file=wrong_key)
except ValueError as exc:
    assert "não autentica" in str(exc)
else:
    raise AssertionError("envelope off-site aceitou chave incorreta")

# Portas reverse TCP precisam caber também no listener local (remote + offset).
try:
    bridge.BridgePort(60000)
except ValueError as exc:
    assert "porta local inválida" in str(exc)
else:
    raise AssertionError("bridge aceitou remote+offset acima de 65535")

try:
    db.create_generator(
        {
            "tag": "GEN-OVERFLOW",
            "name": "Overflow",
            "customer": "",
            "site": "Teste",
            "controller_type": "COMAP",
            "controller_model": "InteliGen 200",
            "transport": "reverse_tcp",
            "host": "",
            "listen_port": 60000,
            "modbus_unit": 1,
            "rapid_device_num": None,
            "enabled": True,
        },
        actor="hardening-test",
    )
except ValueError as exc:
    assert "RC_RAPID_LOCAL_OFFSET" in str(exc)
else:
    raise AssertionError("cadastro aceitou porta reverse incompatível com offset local")

# Allowlist reverse TCP deve aceitar apenas redes explicitamente configuradas.
assert REMOTE_ALLOWED_NETWORKS
port = HardenedBridgePort(15050)
assert port._allowed(ipaddress.ip_address("10.20.30.40")) is True
assert port._allowed(ipaddress.ip_address("192.168.1.50")) is False
assert port._allowed(ipaddress.ip_address("2001:db8::10")) is True

# Override por porta deve ter prioridade sobre a allowlist global.
os.environ["RC_RAPID_REMOTE_ALLOWED_CIDRS_15051"] = "172.20.0.0/16"
try:
    # O mapa é resolvido no import; teste a função em subprocesso para garantir
    # que a configuração de ambiente por porta seja materializada de forma limpa.
    child_env = os.environ.copy()
    per_port = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import ipaddress;"
                "from app.bridge_runtime import HardenedBridgePort,PORT_ALLOWED_NETWORKS;"
                "p=HardenedBridgePort(15051);"
                "assert 15051 in PORT_ALLOWED_NETWORKS;"
                "assert p._allowed(ipaddress.ip_address('172.20.1.10'));"
                "assert not p._allowed(ipaddress.ip_address('10.20.30.40'))"
            ),
        ],
        cwd=Path(__file__).resolve().parents[1],
        env=child_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    assert per_port.returncode == 0, per_port.stdout
finally:
    os.environ.pop("RC_RAPID_REMOTE_ALLOWED_CIDRS_15051", None)

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

world_open_env = os.environ.copy()
world_open_env["RC_RAPID_REQUIRE_ALLOWLIST"] = "1"
world_open_env["RC_RAPID_REMOTE_ALLOWED_CIDRS"] = "0.0.0.0/0"
world_open = subprocess.run(
    [sys.executable, "-c", "import app.bridge_runtime"],
    cwd=Path(__file__).resolve().parents[1],
    env=world_open_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    check=False,
)
assert world_open.returncode != 0
assert "amplo demais" in world_open.stdout

per_port_env = child_env.copy()
per_port_env["RC_RAPID_REMOTE_ALLOWED_CIDRS_15001"] = "10.99.0.0/16"
per_port_only = subprocess.run(
    [
        sys.executable,
        "-c",
        (
            "import ipaddress;"
            "from app.bridge_runtime import HardenedBridgePort;"
            "p=HardenedBridgePort(15001);"
            "assert p._allowed(ipaddress.ip_address('10.99.1.2'));"
            "assert not p._allowed(ipaddress.ip_address('10.20.30.40'))"
        ),
    ],
    cwd=Path(__file__).resolve().parents[1],
    env=per_port_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    check=False,
)
assert per_port_only.returncode == 0, per_port_only.stdout

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

# DSE GenComm and ComAp use different controller-mode enumerations.
assert rapid_module._mode({"controller_type": "DSE"}, {"controller_mode_raw": 1}) == "AUTO"
assert rapid_module._mode({"controller_type": "DSE"}, {"controller_mode_raw": 2}) == "MANUAL"
assert rapid_module._mode({"controller_type": "DSE"}, {"controller_mode_raw": 3}) == "TESTE"
assert rapid_module._mode({"controller_type": "COMAP"}, {"controller_mode_raw": 1}) == "MANUAL"
assert rapid_module._mode({"controller_type": "COMAP"}, {"controller_mode_raw": 2}) == "AUTO"
