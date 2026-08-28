import os
import tempfile
from pathlib import Path

# Precisa ser definido antes de importar app.config/db.
tmp = tempfile.TemporaryDirectory(prefix="rc-geradores-test-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "test.db")
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

with TestClient(app) as client:
    expect(client.get("/api/health"), 200)
    expect(client.get("/api/generators"), 401)

    login = expect(
        client.post(
            "/api/auth/login",
            json={"email": "admin@test.local", "password": "Teste-Seguro-123"},
        ),
        200,
    )
    assert login.json()["role"] == "administrador"
    assert "rc_session" in client.cookies

    me = expect(client.get("/api/auth/me"), 200).json()
    assert me["email"] == "admin@test.local"

    viewer = expect(
        client.post(
            "/api/users",
            json={
                "name": "Visualizador",
                "email": "viewer@test.local",
                "password": "Viewer-Seguro-123",
                "role": "visualizacao",
            },
        ),
        201,
    ).json()
    assert viewer["role"] == "visualizacao"

    generator = expect(
        client.post(
            "/api/generators",
            json={
                "tag": "GEN001",
                "name": "Gerador 01",
                "site": "Teste",
                "controller": "ComAp InteliGen 200",
                "transport": "reverse_tcp",
                "listenPort": 15001,
                "modbusUnit": 2,
                "rapidDeviceNum": 200,
            },
        ),
        201,
    ).json()
    assert generator["tag"] == "GEN001"
    assert generator["rapidDeviceNum"] == 200

    # Sem socket privilegiado, o endpoint deve falhar fechado.
    expect(
        client.post(
            f"/api/generators/{generator['id']}/commands/start",
            json={"confirmation": "START"},
        ),
        409,
    )

    expect(client.post("/api/auth/logout"), 204)
    expect(client.get("/api/auth/me"), 401)

with TestClient(app) as viewer_client:
    expect(
        viewer_client.post(
            "/api/auth/login",
            json={"email": "viewer@test.local", "password": "Viewer-Seguro-123"},
        ),
        200,
    )
    expect(viewer_client.get("/api/generators"), 200)
    expect(
        viewer_client.post(
            "/api/generators",
            json={
                "tag": "GEN002",
                "site": "Teste",
                "controller": "ComAp InteliGen 200",
                "listenPort": 15002,
                "modbusUnit": 2,
            },
        ),
        403,
    )
    expect(
        viewer_client.post(
            f"/api/generators/{generator['id']}/commands/stop",
            json={"confirmation": "STOP"},
        ),
        403,
    )

print("RC Geradores backend smoke: OK")
tmp.cleanup()
