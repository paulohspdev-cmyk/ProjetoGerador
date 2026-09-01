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

from app import bridge, bridge_runtime, control, db, rapid  # noqa: E402


db.init_db()
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
                "rapid_device_num": 204,
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


async def validate_payload():
    writer = FakeWriter()

    async def fake_open_unix_connection(_path):
        return FakeReader(), writer

    with patch.object(control.Path, "exists", return_value=True), patch.object(
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


async def validate_ig4_lab_gate_and_payload():
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
            "rapid_device_num": 206,
        }
    )
    bindings_path.write_text(json.dumps(bindings), encoding="utf-8")

    assert rapid._effective_capabilities(ig4, "online", True)["start"] is False

    os.environ["RC_ENABLE_IG4_LAB_CONTROL"] = "1"
    os.environ["RC_IG4_LAB_ALLOWLIST"] = "GEN204"
    try:
        caps = rapid._effective_capabilities(ig4, "online", True)
        assert caps["start"] is True
        assert caps["stop"] is False

        resolved, port, unit = bridge_runtime.resolve_ig4_lab_bound_device(ig4["id"], 206)
        assert resolved["tag"] == "GEN204"
        assert port == 15003
        assert unit == 4
        assert bridge_runtime._remote_framing_for_generator(resolved) == bridge_runtime.FRAMING_MODBUS_RTU

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
        assert payload["generator_id"] == ig4["id"]
        assert payload["device"] == 206
        assert payload["action"] == "start"
        assert payload["confirm"] == "IG4_LAB_START_CONFIRMED"

        try:
            await control.send_homologated_command(ig4, "stop")
        except ValueError:
            pass
        else:
            raise AssertionError("STOP não pode ser promovido pelo gate START do IG4 LAB")
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
asyncio.run(validate_ig4_lab_gate_and_payload())
asyncio.run(validate_ig4_lab_start_interlock())
print("RC Geradores multi-device control smoke: OK")
tmp.cleanup()
