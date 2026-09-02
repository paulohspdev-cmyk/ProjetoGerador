import json
import os
import tempfile
from pathlib import Path

# O teste precisa isolar DB e bindings antes de importar app.config.
tmp = tempfile.TemporaryDirectory(prefix="rc-session-inventory-")
data_dir = Path(tmp.name)
bindings = data_dir / "bindings.json"
bindings.write_text("[]", encoding="utf-8")
os.environ["RC_DATA_DIR"] = str(data_dir)
os.environ["RC_DB_FILE"] = str(data_dir / "test.db")
os.environ["RC_RAPID_BINDINGS"] = str(bindings)
os.environ["RC_ENABLE_IG200_CONTROL"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.main import app  # noqa: E402


def expect(response, code):
    if response.status_code != code:
        raise AssertionError(
            f"esperado HTTP {code}, recebido {response.status_code}: {response.text}"
        )
    return response


db.init_db()
admin, created = db.bootstrap_admin(
    "Administrador Teste",
    "admin@test.local",
    hash_password("Teste-Seguro-123"),
)
assert created and admin["role"] == "administrador"

expected_tags = []
for index in range(1, 6):
    tag = f"GEN{index:03d}"
    expected_tags.append(tag)
    db.create_generator(
        {
            "tag": tag,
            "name": f"Gerador {index}",
            "site": "Unidade Teste",
            "controller_type": "COMAP",
            "controller_model": "InteliGen 200",
            "transport": "reverse_tcp",
            "listen_port": 15000 + index,
            "modbus_unit": index,
            "rapid_device_num": 199 + index,
            "enabled": True,
        },
        actor="test",
    )

with TestClient(app) as client:
    # A aplicação deve exigir sessão antes de expor inventário.
    expect(client.get("/api/generators"), 401)

    expect(
        client.post(
            "/api/auth/login",
            json={"email": "admin@test.local", "password": "Teste-Seguro-123"},
        ),
        200,
    )
    expect(client.get("/api/auth/me"), 200)

    payload = expect(client.get("/api/generators"), 200).json()
    assert isinstance(payload, list), payload
    assert len(payload) == 5, json.dumps(payload, ensure_ascii=False, indent=2)
    assert [item["tag"] for item in payload] == expected_tags
    assert all(item["id"] for item in payload)
    assert all(item["site"] == "Unidade Teste" for item in payload)
    # Sem binding real, o inventário continua visível e apenas a telemetria degrada.
    assert all(item["status"] == "offline" for item in payload)
    assert all(item["lastError"] == "Sem binding Rapid SCADA" for item in payload)

    # Também cobre uma superfície global usada logo após o login.
    bootstrap = expect(client.get("/api/ops/bootstrap"), 200).json()
    for key in ("clients", "sites", "workOrders", "agenda", "rules", "reports", "webhooks"):
        assert key in bootstrap, key

print("RC Geradores sessão + inventário: OK")
tmp.cleanup()
