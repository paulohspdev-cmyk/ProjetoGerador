import os
import tempfile
import time
from pathlib import Path

from openpyxl import load_workbook

root_tmp = tempfile.TemporaryDirectory(prefix="rc-audit-reg-")
root = Path(root_tmp.name)
data = root / "data"
archive = root / "rapid-archive"
archive.mkdir(parents=True)
(archive / "history.bin").write_bytes(b"history")
os.environ["RC_DATA_DIR"] = str(data)
os.environ["RC_DB_FILE"] = str(data / "rc-geradores.db")
scada_root = root / "scada"
for rel in ("BaseDAT", "Config", "ScadaComm/Config"):
    target = scada_root / rel
    target.mkdir(parents=True, exist_ok=True)
    (target / "placeholder.txt").write_text("test")
os.environ["RC_RAPID_SCADA_ROOT"] = str(scada_root)
os.environ["RC_TOTP_KEY_FILE"] = str(root / "totp.key")
os.environ["RC_RAPID_ARCHIVE_DIR"] = str(archive)
os.environ["RC_PUBLIC_BASE_URL"] = "https://example.invalid"
os.environ["RC_SMTP_HOST"] = "smtp.invalid"
os.environ["RC_SMTP_FROM"] = "noreply@example.invalid"

from app import db, diagnostics, industrial_store, platform_store, traffic_store  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.rapid import _downsample_points  # noqa: E402
from app.reporting import generate_report  # noqa: E402
from app.secret_box import protect_secret  # noqa: E402
from app.security_service import disable_totp, setup_totp, totp_code  # noqa: E402


def init_all():
    db.init_db()
    platform_store.init_platform_db()
    industrial_store.init_industrial_db()


init_all()

# F01: reset token must never escape through operational notification listings.
token = "super-secret-reset-token"
platform_store.enqueue_notification(
    "auth.password_reset",
    "email",
    destination="admin@example.invalid",
    subject="reset",
    body=f"https://example.invalid/reset-password?token={token}",
    payload={"token": token},
)
visible = platform_store.list_notifications(10)
assert visible and token not in repr(visible), visible
assert visible[0]["body"] == "Mensagem de segurança protegida"

# F02: setting up again cannot disable an already-enabled factor.
user = db.create_user(
    {
        "name": "Admin",
        "email": "admin@example.invalid",
        "password_hash": hash_password("StrongPass123!"),
        "role": "administrador",
        "active": True,
    },
    actor="test",
)
platform_store.set_totp(user["id"], protect_secret("JBSWY3DPEHPK3PXP"), True)
try:
    setup_totp(user)
except ValueError:
    pass
else:
    raise AssertionError("setup_totp replaced active factor")
assert platform_store.get_totp(user["id"])["enabled"] is True
try:
    disable_totp(user, totp_code("JBSWY3DPEHPK3PXP"), "SenhaIncorreta123")
except ValueError:
    pass
else:
    raise AssertionError("2FA disabled without current-password reauthentication")
assert platform_store.get_totp(user["id"])["enabled"] is True

# F03: administrative password replacement revokes all old sessions.
db.create_session("old-session-hash", user["id"], int(time.time()) + 3600)
assert db.get_session_user("old-session-hash") is not None
db.update_user(user["id"], {"password_hash": hash_password("AnotherPass123!")}, actor="test")
assert db.get_session_user("old-session-hash") is None

# F04: reset flow is throttled independently from login.
assert platform_store.password_reset_allowed("target@example.invalid", "192.0.2.10") is True
assert platform_store.password_reset_allowed("target@example.invalid", "192.0.2.10") is False

# F05/F11: spreadsheet text is neutralized, numeric telemetry stays numeric, report is a snapshot.
report = {"id": "rep-audit", "name": "=1+1", "period": "Ontem", "format": "XLSX"}
generator = {
    "tag": "GEN001",
    "site": "=2+2",
    "status": "online",
    "controller": "ComAp",
    "availableMetrics": ["rpm"],
    "rpm": 1500,
}
artifact = generate_report(report, [generator])
wb = load_workbook(artifact["path"], data_only=False)
ws = wb.active
assert ws["A1"].data_type != "f" and str(ws["A1"].value).startswith("'")
assert ws["B6"].data_type != "f" and str(ws["B6"].value).startswith("'")
assert ws["E6"].value == 1500 and ws["E6"].data_type == "n"
assert ws["A2"].value == "Tipo" and ws["B2"].value == "Fotografia operacional"

# F06: clearing and reopening the same alarm starts a fresh escalation occurrence.
policy = industrial_store.create_escalation_policy(
    {
        "name": "comm",
        "severity": "fault",
        "after_seconds": 0,
        "channel": "panel",
        "repeat_seconds": 0,
        "max_repeats": 1,
    },
    "test",
)
offline = [{"id": "g1", "tag": "GEN001", "status": "offline", "lastError": "loss"}]
online = [{"id": "g1", "tag": "GEN001", "status": "online"}]
assert industrial_store.process_escalations(offline) == 1
industrial_store.process_escalations(online)
assert industrial_store.process_escalations(offline) == 1
with db.connect() as conn:
    count = conn.execute(
        "SELECT COUNT(*) FROM notification_queue WHERE event_type='industrial.alarm.escalation'"
    ).fetchone()[0]
assert count == 2, count

# F07: an abandoned sending lease is reclaimed for retry.
queue_id = platform_store.enqueue_notification("test.lease", "panel", body="lease")
claimed = platform_store.claim_due_notifications(20, lease_seconds=30)
assert any(item["id"] == queue_id for item in claimed)
with db.connect() as conn:
    conn.execute(
        "UPDATE notification_queue SET status='sending',updated_at=? WHERE id=?",
        (int(time.time()) - 120, queue_id),
    )
reclaimed = platform_store.claim_due_notifications(20, lease_seconds=30)
assert any(item["id"] == queue_id for item in reclaimed)

# F08: downsampling preserves the complete window and a strict bound.
for size in (2001, 2880, 3999, 10000):
    points = [{"timestamp": str(i), "value": i, "stat": 1} for i in range(size)]
    sampled = _downsample_points(points, 2000)
    assert len(sampled) == 2000
    assert sampled[0]["value"] == 0
    assert sampled[-1]["value"] == size - 1

# F10: lifecycle operations are durable, exclusive per generator and idempotent by ID.
operation_payload = {"confirmation": "PROVISION", "operationId": "op-audit-0001"}
queued = platform_store.enqueue_lifecycle_operation(
    "op-audit-0001",
    "g-operation",
    "provision",
    operation_payload,
    "admin@example.invalid",
    "administrador",
)
assert queued["status"] == "queued"
claimed_operation = platform_store.claim_lifecycle_operation()
assert claimed_operation and claimed_operation["operationId"] == "op-audit-0001"
assert claimed_operation["status"] == "running"
try:
    platform_store.enqueue_lifecycle_operation(
        "op-audit-0002",
        "g-operation",
        "deprovision",
        {"confirmation": "DEPROVISION", "operationId": "op-audit-0002"},
        "admin@example.invalid",
        "administrador",
    )
except ValueError:
    pass
else:
    raise AssertionError("concurrent lifecycle operation accepted for same generator")
platform_store.finish_lifecycle_operation("op-audit-0001", {"ok": True})
finished = platform_store.get_lifecycle_operation("op-audit-0001", "g-operation")
assert finished and finished["status"] == "succeeded"
assert finished["result"]["ok"] is True
replayed = platform_store.enqueue_lifecycle_operation(
    "op-audit-0001",
    "g-operation",
    "provision",
    operation_payload,
    "admin@example.invalid",
    "administrador",
)
assert replayed["status"] == "succeeded"

# Observability: each supervised worker is individually visible and queue health is bounded.
for worker_name in platform_store.EXPECTED_WORKERS:
    platform_store.touch_worker_heartbeat(worker_name, "ok", "regression")
workers = platform_store.worker_health(stale_after=45)
assert len(workers) == 4 and all(item["healthy"] for item in workers), workers
queue_health = platform_store.queue_health()
assert queue_health["staleNotificationClaims"] == 0, queue_health
assert queue_health["staleLifecycleOperations"] == 0, queue_health
assert queue_health["healthy"] is True, queue_health


# Reverse TCP peer history must aggregate metadata without storing transport payloads.
first_peer = traffic_store.record_bridge_peer(
    15001,
    "203.0.113.10",
    accepted=True,
    reason="conexão aceita",
    now=1_700_000_000,
)
assert first_peer["acceptedCount"] == 1 and first_peer["rejectedCount"] == 0, first_peer
second_peer = traffic_store.record_bridge_peer(
    15001,
    "203.0.113.10",
    accepted=False,
    reason="origem fora da allowlist",
    now=1_700_000_060,
)
assert second_peer["acceptedCount"] == 1 and second_peer["rejectedCount"] == 1, second_peer
assert second_peer["firstSeenAt"] == 1_700_000_000
assert second_peer["lastSeenAt"] == 1_700_000_060
assert second_peer["lastDecision"] == "rejected"
peer_rows = traffic_store.list_bridge_peers(10, remote_port=15001)
assert peer_rows and peer_rows[0]["remoteIp"] == "203.0.113.10", peer_rows
assert "payload" not in peer_rows[0] and "frame" not in peer_rows[0], peer_rows[0]
traffic_store.record_bridge_peer(
    15002,
    "203.0.113.11",
    accepted=True,
    reason="conexão aceita",
    now=1_700_000_060 + 91 * 86400,
)
retained = traffic_store.list_bridge_peers(20)
assert all(item["remoteIp"] != "203.0.113.10" for item in retained), retained
assert any(item["remoteIp"] == "203.0.113.11" for item in retained), retained

# Reverse TCP security posture must remain visible to diagnostics.
bridge_status = root / "bridge-status.json"
bridge_status.write_text(
    '{"updatedAt": %d, "security": {"peerAllowlistEnabled": false, "peerAllowlistRequired": false}, "ports": []}'
    % int(time.time())
)
previous_bridge_status = diagnostics.BRIDGE_STATUS_FILE
try:
    diagnostics.BRIDGE_STATUS_FILE = bridge_status
    status = diagnostics._bridge_runtime_status()
finally:
    diagnostics.BRIDGE_STATUS_FILE = previous_bridge_status
assert status["security"]["peerAllowlistEnabled"] is False, status

print("Audit regressions: OK")


# F12: production Controller Packs use schema v4 and every enabled command has a contract.
from app.controller_library import list_controller_packs  # noqa: E402

for pack in list_controller_packs():
    if pack.get("lifecycle") != "production":
        continue
    assert pack.get("schema") == 4, pack.get("packId")
    capabilities = pack.get("capabilities") or {}
    contracts = pack.get("commands") or {}
    for action in (
        "start",
        "stop",
        "auto",
        "manual",
        "test",
        "mcb_open",
        "mcb_close",
        "gcb_open",
        "gcb_close",
        "paralleling",
    ):
        if capabilities.get(action):
            assert action in contracts, (pack.get("packId"), action)

# F13: production refuses experimental control flags.
from app.production_guard import validate_production_runtime  # noqa: E402

previous_environment = os.environ.get("RC_ENVIRONMENT")
previous_dse_lab = os.environ.get("RC_ENABLE_DSE_LAB_CONTROL")
try:
    os.environ["RC_ENVIRONMENT"] = "production"
    os.environ["RC_ENABLE_DSE_LAB_CONTROL"] = "1"
    try:
        validate_production_runtime()
    except RuntimeError:
        pass
    else:
        raise AssertionError("production accepted RC_ENABLE_DSE_LAB_CONTROL=1")
finally:
    if previous_environment is None:
        os.environ.pop("RC_ENVIRONMENT", None)
    else:
        os.environ["RC_ENVIRONMENT"] = previous_environment
    if previous_dse_lab is None:
        os.environ.pop("RC_ENABLE_DSE_LAB_CONTROL", None)
    else:
        os.environ["RC_ENABLE_DSE_LAB_CONTROL"] = previous_dse_lab

# F14: the composed API must not expose duplicate method/path contracts.
import re  # noqa: E402
from collections import defaultdict  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402
from app.main import app  # noqa: E402


def _walk_routes(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        elif type(route).__name__ == "_IncludedRouter":
            yield from _walk_routes(route.original_router.routes)


contracts = defaultdict(list)
for route in _walk_routes(app.routes):
    normalized = re.sub(r"\{[^}]+\}", "{}", route.path)
    for method in route.methods or []:
        contracts[(method, normalized)].append(route.name)
duplicates = {key: names for key, names in contracts.items() if len(names) > 1}
assert not duplicates, duplicates

print("Production hardening regressions: OK")
