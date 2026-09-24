import asyncio
import os
import sqlite3
import tempfile
from pathlib import Path

tmp = tempfile.TemporaryDirectory(prefix="rc-network-discovery-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "network-discovery.db")

from app import db, network_discovery  # noqa: E402


assert network_discovery.private_hosts("10.40.10.0/30") == ["10.40.10.1", "10.40.10.2"]
for invalid in ("127.0.0.0/30", "169.254.1.0/30", "8.8.8.0/24", "10.0.0.0/23"):
    try:
        network_discovery.private_hosts(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError(f"rede insegura aceita: {invalid}")


class Writer:
    def close(self):
        pass

    async def wait_closed(self):
        pass


async def fake_open_connection(host, port):
    if host == "10.40.10.2" and port == 502:
        return object(), Writer()
    raise OSError("closed")


original = asyncio.open_connection
asyncio.open_connection = fake_open_connection
try:
    scan = asyncio.run(network_discovery.scan_tcp("10.40.10.0/30", 502, 100))
finally:
    asyncio.open_connection = original

assert scan["readOnly"] is True
assert scan["method"] == "tcp_connect_only"
assert scan["found"][0]["host"] == "10.40.10.2"

# Identidade provisionada continua bloqueada no PATCH comum, mas o fluxo
# administrativo transacional possui uma autorização interna explícita.
db.init_db()
generator = db.create_generator(
    {
        "tag": "GEN900",
        "name": "Teste",
        "site": "Bancada",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "host": "",
        "listen_port": 15004,
        "modbus_unit": 4,
        "rapid_device_num": 900,
        "enabled": True,
    }
)
try:
    db.update_generator(generator["id"], {"listen_port": 15006})
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("PATCH comum alterou identidade industrial provisionada")

updated = db.update_generator(
    generator["id"],
    {"listen_port": 15006, "modbus_unit": 10},
    actor="test:transaction",
    allow_industrial_identity=True,
)
assert updated["listen_port"] == 15006
assert updated["modbus_unit"] == 10

print("RC Geradores descoberta e reconfiguração segura: OK")
