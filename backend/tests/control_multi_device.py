import asyncio
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch


tmp = tempfile.TemporaryDirectory(prefix="rc-control-device-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "test.db")
os.environ["RC_RAPID_BINDINGS"] = str(Path(tmp.name) / "bindings.json")

from app import bridge_runtime, control, db  # noqa: E402


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


asyncio.run(validate_payload())
print("RC Geradores multi-device control smoke: OK")
tmp.cleanup()
