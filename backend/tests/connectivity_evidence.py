import os
import tempfile
from pathlib import Path

tmp = tempfile.TemporaryDirectory(prefix="rc-connectivity-evidence-")
data_dir = Path(tmp.name)
os.environ["RC_DATA_DIR"] = str(data_dir)
os.environ["RC_DB_FILE"] = str(data_dir / "test.db")

from app import db, traffic_store  # noqa: E402
from app.diagnostics import _connection_diagnosis  # noqa: E402

db.init_db()


def session(connected: bool):
    return {
        "remotePort": 15001,
        "localPort": 25001,
        "connected": connected,
        "bytesRx": 10,
        "bytesTx": 20,
    }


# O worker deve transformar mudanças observadas em uma linha do tempo persistente.
first = traffic_store.record_bridge_traffic([session(True)], 1_000)
assert first["outages"] == []

down = traffic_store.record_bridge_traffic([session(False)], 1_100)
assert len(down["outages"]) == 1
assert down["outages"][0]["started_at"] == 1_100
assert down["outages"][0]["ended_at"] is None

up = traffic_store.record_bridge_traffic([session(True)], 1_160)
assert up["outages"][0]["ended_at"] == 1_160

# A origem provável deve diferenciar infraestrutura, campo e controladora.
listeners = {15001: {"remoteListening": True, "localListening": True}}
assert _connection_diagnosis(session(False), listeners, True)["origin"] == "field"
assert _connection_diagnosis(session(True), {}, True)["origin"] == "system"

controller_timeout = {
    **session(True),
    "unitHealth": {"3": {"consecutiveTimeouts": 2}},
}
diagnosis = _connection_diagnosis(controller_timeout, listeners, True)
assert diagnosis["origin"] == "controller"
assert diagnosis["units"] == ["3"]

print("RC Geradores evidência de conectividade: OK")
