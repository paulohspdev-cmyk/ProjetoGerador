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


async def validate_ig4_production_gate():
    ig4 = db.create_generator(
        {
            "tag": "GEN204",
            "name": "Gerador 204",
            "site": "Campo",
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
    ig4_asset = next(
        item
        for item in domain_store.list_assets()
        if item.get("legacy_generator_id") == ig4["id"]
    )
    ig4_controller = domain_store.list_controllers(ig4_asset["id"])[0]
    domain_store.update_controller(
        ig4_controller["id"], {"firmware": "2.1.0.15"}, actor="test"
    )

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

    # Default continua fail-closed.
    caps = rapid._effective_capabilities(ig4, "online", True)
    assert caps["start"] is False
    assert caps["stop"] is False

    os.environ["RC_ENABLE_IG4_PROD_CONTROL"] = "1"
    os.environ["RC_IG4_PROD_ALLOWLIST"] = "GEN204"
    try:
        caps = rapid._effective_capabilities(ig4, "online", True)
        assert caps["start"] is True
        assert caps["stop"] is True

        _, start_contract = control.command_contract(ig4, "start")
        _, stop_contract = control.command_contract(ig4, "stop")
        assert start_contract["executor"] == "comap_privileged"
        assert stop_contract["executor"] == "comap_privileged"

        writer = FakeWriter()

        async def fake_open_unix_connection(_path):
            return FakeReader(), writer

        with patch.object(control.Path, "exists", return_value=True), patch.object(
            control.asyncio,
            "open_unix_connection",
            side_effect=fake_open_unix_connection,
        ):
            result = await control.send_homologated_command(ig4, "start")

        assert result["accepted"] is True
        payload = json.loads(writer.payload.decode("utf-8").strip())
        assert payload["device"] == 206
        assert payload["generator_id"] == ig4["id"]
        assert payload["action"] == "start"
        assert payload["executor"] == "comap_privileged"
        assert payload["confirm"] == "REMOTE_CONTROL_CONFIRMED"

        # Mesmo pack/modelo, mas fora da allowlist, permanece bloqueado.
        os.environ["RC_IG4_PROD_ALLOWLIST"] = "OUTRO-GERADOR"
        caps = rapid._effective_capabilities(ig4, "online", True)
        assert caps["start"] is False
        assert caps["stop"] is False
        try:
            control.command_contract(ig4, "start")
        except ValueError as exc:
            assert "homologado" in str(exc).lower() or "bloqueado" in str(exc).lower()
        else:
            raise AssertionError("IG4 fora da allowlist aceitou contrato START")
    finally:
        os.environ.pop("RC_ENABLE_IG4_PROD_CONTROL", None)
        os.environ.pop("RC_IG4_PROD_ALLOWLIST", None)

    # Variáveis LAB continuam sem promover capability em produção.
    os.environ["RC_ENABLE_IG4_LAB_CONTROL"] = "1"
    os.environ["RC_IG4_LAB_ALLOWLIST"] = "GEN204"
    try:
        caps = rapid._effective_capabilities(ig4, "online", True)
        assert caps["start"] is False
        assert caps["stop"] is False
    finally:
        os.environ.pop("RC_ENABLE_IG4_LAB_CONTROL", None)
        os.environ.pop("RC_IG4_LAB_ALLOWLIST", None)


async def validate_ig4_prod_executor_interlock():
    port = bridge.BridgePort(15996)
    writes = []
    ready = {
        "mode": 1,
        "engine": 1,
        "breaker": 1,
        "rpm": 0,
        "log_bout_1": 0,
    }
    running = {**ready, "engine": 7, "rpm": 1500}
    states = [dict(ready), dict(ready), running]

    async def fake_snapshot(_unit):
        return states.pop(0) if states else running

    async def fake_request(_unit, pdu):
        if pdu[0] in {6, 16}:
            writes.append(bytes(pdu))
        if pdu[0] == 16:
            return struct.pack(">BHH", 16, bridge.IG4_COMMAND_ARGUMENT_ADDRESS, 2)
        if pdu[0] == 6:
            return struct.pack(">BHH", 6, bridge.IG4_COMMAND_CODE_ADDRESS, 1)
        if pdu[0] == 3:
            address = struct.unpack(">H", pdu[1:3])[0]
            count = struct.unpack(">H", pdu[3:5])[0]
            if address == bridge.IG4_COMMAND_ARGUMENT_ADDRESS and count == 2:
                return bytes([3, 4, 0, 0, 1, 255])
        raise AssertionError(f"PDU inesperado {pdu.hex()}")

    port._ig4_snapshot_locked = fake_snapshot
    port.request_locked = fake_request
    result = await port.ig4_command(4, "start")
    assert result["accepted"] is True
    assert result["feedback_confirmed"] is True
    assert result["return_value"] == "0x000001FF"
    assert [pdu[0] for pdu in writes] == [16, 6]

    unsafe = bridge.BridgePort(15995)
    attempted = []

    async def unsafe_snapshot(_unit):
        return {**ready, "breaker": 2}

    async def must_not_write(_unit, pdu):
        if pdu[0] in {6, 16}:
            attempted.append(bytes(pdu))
        raise AssertionError("intertravamento falhou: houve escrita")

    unsafe._ig4_snapshot_locked = unsafe_snapshot
    unsafe.request_locked = must_not_write
    try:
        await unsafe.ig4_command(4, "start")
    except PermissionError:
        pass
    else:
        raise AssertionError("START deveria ser recusado com breaker fora de BrksOff")
    assert attempted == []



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
asyncio.run(validate_ig4_production_gate())
asyncio.run(validate_ig4_prod_executor_interlock())
asyncio.run(validate_ig4_lab_start_interlock())
print("RC Geradores multi-device control smoke: OK")
tmp.cleanup()
