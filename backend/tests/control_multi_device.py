import asyncio
import json
import os
import struct
import tempfile
from pathlib import Path
from unittest.mock import patch


tmp = tempfile.TemporaryDirectory(prefix="rc-control-device-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "test.db")
os.environ["RC_RAPID_BINDINGS"] = str(Path(tmp.name) / "bindings.json")

from app import bridge, bridge_runtime, control, db, domain_store, rapid  # noqa: E402
from app.controller_library import command_firmware_approval  # noqa: E402


db.init_db()

approved, detail = command_firmware_approval(
    {"firmware": {"tested": ["1.2.3"]}},
    "1.2.3",
)
assert approved is True, detail
assert command_firmware_approval({"firmware": {"tested": ["1.2.3"]}}, "")[0] is False
assert command_firmware_approval({"firmware": {"tested": []}}, "1.2.3")[0] is False
assert command_firmware_approval({"firmware": {"tested": ["1.2.3"]}}, "1.2.4")[0] is False

generator = db.create_generator(
    {
        "tag": "GEN005",
        "name": "Gerador 05",
        "site": "Campo",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "listen_port": 15002,
        "modbus_unit": 16,
        "rapid_device_num": 204,
        "enabled": True,
    }
)
domain_store.sync_legacy_generators()
asset = next(
    item
    for item in domain_store.list_assets()
    if item.get("legacy_generator_id") == generator["id"]
)
controller = domain_store.list_controllers(asset["id"])[0]
domain_store.update_controller(controller["id"], {"firmware": "TEST-FW"}, actor="test")

Path(os.environ["RC_RAPID_BINDINGS"]).write_text(
    json.dumps(
        [
            {
                "generator_id": generator["id"],
                "controller_type": "COMAP",
                "controller_model": "InteliGen 200",
                "transport": "reverse_tcp",
                "listen_port": 15002,
                "modbus_unit": 16,
                "rapid_line_num": 102,
                "rapid_device_num": 204,
                "status": "field_validated",
            }
        ]
    ),
    encoding="utf-8",
)

resolved, port, unit = bridge_runtime.resolve_ig200_bound_device(204)
assert resolved["id"] == generator["id"]
assert resolved["rapid_device_num"] == 204
assert port == 15002
assert unit == 16
assert bridge_runtime._remote_framing_for_generator(resolved) == bridge_runtime.FRAMING_MODBUS_TCP

try:
    bridge_runtime.resolve_ig200_bound_device(200)
except ValueError:
    pass
else:
    raise AssertionError("Device sem binding não pode ser resolvido para controle")

bindings_path = Path(os.environ["RC_RAPID_BINDINGS"])
owned_bindings = json.loads(bindings_path.read_text(encoding="utf-8"))
foreign_binding = {**owned_bindings[0], "generator_id": "gen-other"}
bindings_path.write_text(json.dumps([foreign_binding]), encoding="utf-8")
try:
    bridge_runtime.resolve_ig200_bound_device(204)
except ValueError:
    pass
else:
    raise AssertionError("binding de outro generator_id não pode controlar este equipamento")
bindings_path.write_text(json.dumps(owned_bindings), encoding="utf-8")


class FakeReader:
    async def readline(self):
        return b'{"ok":true,"accepted":true,"reason":"teste"}\n'


class FakeWriter:
    def __init__(self):
        self.payload = b""

    def write(self, data):
        self.payload += data

    async def drain(self):
        return None

    def close(self):
        return None

    async def wait_closed(self):
        return None


# Firmware não homologado continua fail-closed.
try:
    control.command_contract(generator, "start")
except ValueError as exc:
    assert "firmware" in str(exc).lower(), exc
else:
    raise AssertionError("comando foi aceito com firmware não homologado")

# O firmware 1.8.1.1 foi capturado em campo e possui histórico posterior de
# START/STOP aceitos; o contrato deve ficar disponível sem executar o comando.
domain_store.update_controller(controller["id"], {"firmware": "1.8.1.1"}, actor="test")
pack, contract = control.command_contract(generator, "start")
assert pack["model"] == "InteliGen 200"
assert contract["executor"] == "ig200_privileged"
_, stop_contract = control.command_contract(generator, "stop")
assert stop_contract["executor"] == "ig200_privileged"


async def validate_payload():
    writer = FakeWriter()

    async def fake_open_unix_connection(_path):
        return FakeReader(), writer

    with patch.object(control, "command_firmware_approval", return_value=(True, "teste")), patch.object(
        control.Path, "exists", return_value=True
    ), patch.object(
        control.asyncio,
        "open_unix_connection",
        side_effect=fake_open_unix_connection,
    ):
        result = await control.send_homologated_command(generator, "start")

    assert result["accepted"] is True
    payload = json.loads(writer.payload.decode("utf-8").strip())
    assert payload["device"] == 204
    assert payload["action"] == "start"
    assert payload["confirm"] == "REMOTE_CONTROL_CONFIRMED"


async def validate_unit_backoff():
    """Um Unit em timeout deve falhar rápido sem impedir outro Unit de responder."""
    port = bridge_runtime.HardenedBridgePort(15999)
    calls: list[int] = []

    async def fake_request(unit, _pdu):
        calls.append(int(unit))
        if int(unit) == 15:
            raise asyncio.TimeoutError()
        return bytes([3, 2, 0, 1])

    port.request_locked = fake_request
    pdu = bridge.read_holding_pdu(1000, 1)

    first = await port.transact(1, 15, pdu)
    assert first == bridge.exception_pdu(3, 11)
    assert calls == [15]

    second = await port.transact(2, 15, pdu)
    assert second == bridge.exception_pdu(3, 11)
    assert calls == [15]

    healthy = await port.transact(3, 16, pdu)
    assert healthy == bytes([3, 2, 0, 1])
    assert calls == [15, 16]

    snapshot = port.snapshot()
    assert snapshot["unitBackoffSkips"] == 1
    assert snapshot["unitHealth"]["15"]["consecutiveTimeouts"] == 1
    assert snapshot["unitHealth"]["15"]["backoffRemainingSeconds"] > 0
    assert snapshot["unitHealth"]["16"]["lastResponseAt"] is not None


async def validate_disconnect_backoff():
    """Modem desconectado deve falhar rápido sem inundar logs/polls locais."""
    port = bridge_runtime.HardenedBridgePort(15998)
    calls: list[int] = []

    async def disconnected(unit, _pdu):
        calls.append(int(unit))
        raise ConnectionError("modem desconectado")

    port.request_locked = disconnected
    pdu = bridge.read_holding_pdu(1000, 1)
    first = await port.transact(1, 2, pdu)
    second = await port.transact(2, 2, pdu)
    assert first == bridge.exception_pdu(3, 11)
    assert second == bridge.exception_pdu(3, 11)
    assert calls == [2]
    snapshot = port.snapshot()
    assert snapshot["unitBackoffSkips"] == 1
    assert snapshot["unitHealth"]["2"]["backoffRemainingSeconds"] > 0


def validate_dse4520_production_contract():
    dse = db.create_generator(
        {
            "tag": "GEN163-TEST",
            "name": "G-191 test fixture",
            "site": "Campo",
            "controller_type": "DSE",
            "controller_model": "DSE4520 MKII",
            "transport": "modbus_tcp_direct",
            "host": "192.0.2.10",
            "listen_port": 502,
            "modbus_unit": 1,
            "rapid_device_num": 207,
            "enabled": True,
        }
    )
    domain_store.sync_legacy_generators()
    asset = next(
        item for item in domain_store.list_assets()
        if item.get("legacy_generator_id") == dse["id"]
    )
    controller = next(
        item for item in domain_store.list_controllers(asset["id"])
        if item.get("model") == "DSE4520 MKII"
    )
    domain_store.update_controller(controller["id"], {"firmware": "4.8"}, actor="test")

    bindings = json.loads(bindings_path.read_text(encoding="utf-8"))
    bindings.append(
        {
            "generator_id": dse["id"],
            "controller_type": "DSE",
            "controller_model": "DSE4520 MKII",
            "transport": "modbus_tcp_direct",
            "listen_port": 502,
            "modbus_unit": 1,
            "rapid_line_num": 103,
            "rapid_device_num": 207,
            "status": "field_validated",
        }
    )
    bindings_path.write_text(json.dumps(bindings), encoding="utf-8")

    for action in ("start", "stop", "off", "auto", "manual", "test"):
        pack, contract = control.command_contract(dse, action)
        assert pack["model"] == "DSE4520 MKII"
        assert pack["firmware"]["tested"] == ["4.8"]
        assert contract["executor"] == "dse_gencomm_privileged"

    caps = rapid._effective_capabilities(dse, "online", True)
    for action in ("start", "stop", "off", "auto", "manual", "test"):
        assert caps[action] is True, (action, caps)
    for action in ("mcb_open", "mcb_close", "gcb_open", "gcb_close", "paralleling"):
        assert caps[action] is False, (action, caps)

    domain_store.update_controller(controller["id"], {"firmware": "4.9"}, actor="test")
    try:
        control.command_contract(dse, "start")
    except ValueError as exc:
        assert "firmware" in str(exc).lower(), exc
    else:
        raise AssertionError("DSE4520 com firmware fora da matriz aceitou START")

async def validate_ig4_production_gate():
    ig4 = db.create_generator(
        {
            "tag": "GEN204",
            "name": "Gerador 204",
            "site": "LAB",
            "controller_type": "COMAP",
            "controller_model": "IG4 200",
            "transport": "reverse_tcp",
            "listen_port": 15003,
            "modbus_unit": 4,
            "rapid_device_num": 206,
            "enabled": True,
        }
    )
    domain_store.sync_legacy_generators()
    asset = next(
        item for item in domain_store.list_assets()
        if item.get("legacy_generator_id") == ig4["id"]
    )
    controller = next(
        item for item in domain_store.list_controllers(asset["id"])
        if item.get("model") == "IG4 200"
    )
    domain_store.update_controller(controller["id"], {"firmware": "2.1.0.15"}, actor="test")

    bindings_path = Path(os.environ["RC_RAPID_BINDINGS"])
    bindings = json.loads(bindings_path.read_text(encoding="utf-8"))
    bindings.append(
        {
            "generator_id": ig4["id"],
            "controller_type": "COMAP",
            "controller_model": "IG4 200",
            "transport": "reverse_tcp",
            "listen_port": 15003,
            "modbus_unit": 4,
            "rapid_line_num": 103,
            "rapid_device_num": 206,
            "status": "field_validated",
        }
    )
    bindings_path.write_text(json.dumps(bindings), encoding="utf-8")

    caps = rapid._effective_capabilities(ig4, "online", True)
    assert caps["start"] is True, caps
    assert caps["stop"] is False, caps
    pack, contract = control.command_contract(ig4, "start")
    assert pack["model"] == "IG4 200"
    assert contract["executor"] == "comap_privileged"
    assert "2.1.0.15" in pack["firmware"]["tested"]

    resolved, port, unit = bridge_runtime.resolve_ig4_bound_device(ig4["id"], 206)
    assert resolved["id"] == ig4["id"]
    assert port == 15003
    assert unit == 4

    # O capability é restrito aos tags explicitamente autorizados no pack.
    not_allowlisted = {**ig4, "tag": "GEN999"}
    blocked_caps = rapid._effective_capabilities(not_allowlisted, "online", True)
    assert blocked_caps["start"] is False, blocked_caps
    try:
        control.command_contract(not_allowlisted, "start")
    except ValueError as exc:
        assert "allowlist" in str(exc).lower(), exc
    else:
        raise AssertionError("IG4 fora da allowlist recebeu contrato START")

    # Variáveis LAB não ampliam nem substituem a autorização production.
    os.environ["RC_ENABLE_IG4_LAB_CONTROL"] = "1"
    os.environ["RC_IG4_LAB_ALLOWLIST"] = "GEN204"
    try:
        caps = rapid._effective_capabilities(ig4, "online", True)
        assert caps["start"] is True
        assert caps["stop"] is False
    finally:
        os.environ.pop("RC_ENABLE_IG4_LAB_CONTROL", None)
        os.environ.pop("RC_IG4_LAB_ALLOWLIST", None)


async def validate_ig4_lab_start_interlock():
    port = bridge_runtime.HardenedRtuBridgePort(15998)
    writes = []
    ready = {
        "mode": 1,
        "engine": 1,
        "breaker": 1,
        "timer": 0,
        "rpm": 0,
        "battery_raw": 249,
        "log_bout_1": 0,
    }
    running = {**ready, "engine": 7, "rpm": 1500}
    states = [dict(ready), dict(ready), running]

    async def fake_snapshot(_unit):
        return states.pop(0) if states else running

    async def fake_request(_unit, pdu):
        writes.append(bytes(pdu))
        if pdu[0] == 16:
            return struct.pack(">BHH", 16, bridge_runtime.IG4_COMMAND_ARGUMENT_ADDRESS, 2)
        if pdu[0] == 6:
            return struct.pack(">BHH", 6, bridge_runtime.IG4_COMMAND_CODE_ADDRESS, 1)
        raise AssertionError(f"escrita inesperada FC{pdu[0]}")

    async def fake_read(_unit, address, count=1):
        if address == bridge_runtime.IG4_COMMAND_ARGUMENT_ADDRESS and count == 2:
            return [0, 0x01FF]
        raise AssertionError(f"leitura inesperada {address}/{count}")

    port._ig4_lab_snapshot_locked = fake_snapshot
    port._ig4_lab_request_locked = fake_request
    port._ig4_lab_read_locked = fake_read

    result = await port.ig4_lab_start(4)
    assert result["accepted"] is True
    assert result["return_value"] == "0x000001FF"
    assert result["running_confirmed"] is True
    assert [pdu[0] for pdu in writes] == [16, 6]

    unsafe = bridge_runtime.HardenedRtuBridgePort(15997)
    attempted = []

    async def unsafe_snapshot(_unit):
        return {**ready, "engine": 2}

    async def must_not_write(_unit, pdu):
        attempted.append(bytes(pdu))
        raise AssertionError("intertravamento falhou: houve escrita")

    unsafe._ig4_lab_snapshot_locked = unsafe_snapshot
    unsafe._ig4_lab_request_locked = must_not_write
    try:
        await unsafe.ig4_lab_start(4)
    except PermissionError:
        pass
    else:
        raise AssertionError("START deveria ser recusado com Engine=NotReady")
    assert attempted == []


asyncio.run(validate_payload())
asyncio.run(validate_unit_backoff())
asyncio.run(validate_disconnect_backoff())
validate_dse4520_production_contract()
asyncio.run(validate_ig4_production_gate())
asyncio.run(validate_ig4_lab_start_interlock())
print("RC Geradores multi-device control smoke: OK")
tmp.cleanup()
