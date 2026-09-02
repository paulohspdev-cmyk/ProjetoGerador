import asyncio
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException

tmp = tempfile.TemporaryDirectory(prefix="rc-reconfigure-transaction-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "reconfigure.db")

from app import db, domain_routes, domain_store  # noqa: E402

db.init_db()
domain_store.init_domain_db()
generator = db.create_generator(
    {
        "tag": "GEN901",
        "name": "Teste transação",
        "site": "Bancada",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "host": "",
        "listen_port": 15004,
        "modbus_unit": 4,
        "rapid_device_num": 901,
        "enabled": True,
    }
)
user = {"email": "admin@test", "role": "administrador"}
state = {"active": True, "provisions": 0}


def active_binding(_generator_id):
    return {"generator_id": generator["id"]} if state["active"] else None


async def deprovision(_generator_id):
    state["active"] = False
    return {"ok": True, "historyPreserved": True}


async def provision(_generator_id, operation):
    assert operation == "provision"
    state["provisions"] += 1
    state["active"] = True
    return {"ok": True}


domain_routes._active_binding = active_binding
domain_routes._privileged_deprovision = deprovision
domain_routes._privileged_operation = provision

payload = domain_routes.GeneratorReconfigureRequest(
    transport="reverse_tcp",
    ip="",
    listenPort=15006,
    modbusUnit=10,
    confirmation="RECONFIGURAR GEN901",
)
result = asyncio.run(domain_routes.generator_reconfigure(generator["id"], payload, user))
assert result["ok"] is True and result["reprovisioned"] is True
current = db.get_generator(generator["id"])
assert current["listen_port"] == 15006 and current["modbus_unit"] == 10


async def fail_then_restore(_generator_id, operation):
    state["provisions"] += 1
    if state["provisions"] == 2:
        raise RuntimeError("falha simulada na configuração nova")
    state["active"] = True
    return {"ok": True}


domain_routes._privileged_operation = fail_then_restore
payload = domain_routes.GeneratorReconfigureRequest(
    transport="reverse_tcp",
    ip="",
    listenPort=15007,
    modbusUnit=11,
    confirmation="RECONFIGURAR GEN901",
)
try:
    asyncio.run(domain_routes.generator_reconfigure(generator["id"], payload, user))
except HTTPException as exc:
    assert exc.status_code == 502
    assert "anterior restaurada" in exc.detail
else:
    raise AssertionError("falha de reprovisionamento não foi propagada")

restored = db.get_generator(generator["id"])
assert restored["listen_port"] == 15006 and restored["modbus_unit"] == 10
assert state["active"] is True

print("RC Geradores transação de reconfiguração: OK")
