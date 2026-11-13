"""Contrato de admissão: teste isolado, sem acessar banco ou modem de produção."""

import os
import tempfile
import time
from pathlib import Path

temporary = tempfile.TemporaryDirectory(prefix="rc-modem-admission-")
data_dir = Path(temporary.name)
os.environ["RC_DATA_DIR"] = str(data_dir)
os.environ["RC_DB_FILE"] = str(data_dir / "admission.db")

from app import db, platform_store, traffic_store  # noqa: E402

db.init_db()
platform_store.init_platform_db()
now = int(time.time())

traffic_store.record_bridge_peer(15030, "10.0.0.30", True, now=now)
observed = platform_store.list_modem_admissions()
assert any(row["remotePort"] == 15030 and row["state"] == "pending" for row in observed)

approved = platform_store.approve_modem_admission(
    15030, {"name": "Modem ensaio isolado", "metadata": {}}, "test"
)
assert approved["state"] == "approved"
device = platform_store.approved_modem_for_port(15030)
assert device is not None
assert device["status"] == "approved_unlinked"
assert device["metadata"]["admissionPort"] == 15030
assert platform_store.require_approved_inventory_modem(device["id"])["id"] == device["id"]
assert platform_store.require_approved_modem(device["id"], 15030)["id"] == device["id"]

traffic_store.record_bridge_peer(15031, "10.0.0.31", True, now=now)
rejected = platform_store.reject_modem_admission(15031, "Teste", "test")
assert rejected["state"] == "rejected"
reopened = platform_store.reopen_modem_admission(15031, "test")
assert reopened is not None and reopened["state"] == "pending"

print("RC Geradores admissão isolada: OK")
