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

    # Módulos de produto não podem depender de localStorage.
    client_row = expect(
        client.post("/api/clients", json={"name": "Cliente Teste", "units": 1, "gens": 1, "sla": "99,9%"}),
        201,
    ).json()
    site = expect(
        client.post(
            "/api/sites",
            json={
                "name": "Unidade Teste",
                "clientId": client_row["id"],
                "city": "São Paulo",
                "state": "SP",
                "latitude": -23.55,
                "longitude": -46.63,
            },
        ),
        201,
    ).json()
    assert site["clientId"] == client_row["id"]

    work_order = expect(
        client.post(
            "/api/work-orders",
            json={"generatorId": generator["id"], "type": "Preventiva", "due": 50, "tech": "Equipe campo"},
        ),
        201,
    ).json()
    assert work_order["gen"] == "GEN001"
    work_order = expect(
        client.patch(f"/api/work-orders/{work_order['id']}", json={"status": "Em andamento"}),
        200,
    ).json()
    assert work_order["status"] == "Em andamento"

    agenda = expect(
        client.post("/api/agenda", json={"title": "Inspeção", "when": "30/08 09:00", "site": "Unidade Teste"}),
        201,
    ).json()
    assert agenda["when"] == "30/08 09:00"

    # Regra nasce em rascunho, não pode ser ativada sem aprovação explícita.
    rule = expect(
        client.post(
            "/api/automation/rules",
            json={"name": "Regra teste", "trigger": "rpm > 0", "action": "somente notificar"},
        ),
        201,
    ).json()
    assert rule["enabled"] is False
    expect(
        client.put(f"/api/automation/rules/{rule['id']}/enabled", json={"enabled": True}),
        409,
    )
    approved = expect(client.post(f"/api/automation/rules/{rule['id']}/approve"), 200).json()
    assert approved["safety_state"] == "approved"
    rule = expect(
        client.put(f"/api/automation/rules/{rule['id']}/enabled", json={"enabled": True}),
        200,
    ).json()
    assert rule["enabled"] is True

    # Biblioteca e diagnóstico são APIs reais e autenticadas.
    expect(client.get("/api/library"), 200)
    expect(client.get("/api/system/diagnostics"), 200)
    expect(client.get("/api/system/version"), 200)

    report = expect(
        client.post("/api/reports", json={"name": "Parque", "period": "Hoje", "format": "CSV"}),
        201,
    ).json()
    download = expect(client.get(f"/api/reports/{report['id']}/download"), 200)
    assert "Gerador;Site" in download.text

    webhook = expect(
        client.post("/api/webhooks", json={"url": "https://example.test/hook", "event": "alarme.criado"}),
        201,
    ).json()
    webhook = expect(
        client.patch(f"/api/webhooks/{webhook['id']}", json={"status": "Ativo"}),
        200,
    ).json()
    assert webhook["status"] == "Ativo"

    expect(client.put("/api/settings/cfg.test", json={"value": True}), 200)
    backup = expect(client.post("/api/backups"), 201).json()
    assert backup["result"] == "OK"
    assert Path(backup["path"]).exists()

    bootstrap = expect(client.get("/api/ops/bootstrap"), 200).json()
    assert len(bootstrap["clients"]) == 1
    assert len(bootstrap["workOrders"]) == 1
    assert len(bootstrap["agenda"]) == 1
    assert len(bootstrap["rules"]) == 1

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
    expect(viewer_client.get("/api/ops/bootstrap"), 200)
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
    expect(viewer_client.post("/api/clients", json={"name": "Bloqueado"}), 403)
    expect(viewer_client.post("/api/backups"), 403)
    expect(viewer_client.post("/api/alarms/ack", json={"alarmKey": "X"}), 403)
    expect(
        viewer_client.post(
            f"/api/generators/{generator['id']}/commands/stop",
            json={"confirmation": "STOP"},
        ),
        403,
    )

print("RC Geradores backend smoke: OK")
tmp.cleanup()
