"""Characterize registration behavior in a disposable database; no field I/O."""
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

tmp = tempfile.TemporaryDirectory(prefix="rc-registration-audit-")
root = Path(tmp.name)
for key, value in {
    "RC_ENVIRONMENT": "development", "RC_DATA_DIR": str(root),
    "RC_DB_FILE": str(root / "audit.db"), "RC_RAPID_BINDINGS": str(root / "bindings.json"),
    "RC_RAPID_SCADA_ROOT": str(root / "scada"), "RC_RAPID_READER": str(root / "missing.dll"),
    "RC_BRIDGE_STATUS_FILE": str(root / "bridge.json"), "RC_PROVISION_SOCKET": str(root / "provision.sock"),
    "RC_RAPID_CONTROL_SOCKET": str(root / "control.sock"), "RC_2FA_ENFORCED": "0",
    "RC_SMTP_HOST": "", "RC_WHATSAPP_API_URL": "", "RC_ADMIN_PASSWORD": "",
}.items():
    os.environ[key] = value
(root / "bindings.json").write_text("[]")

from fastapi.testclient import TestClient
from app import db, domain_store, platform_store
from app.main import app
from app.auth import require_create, require_edit, require_view, require_admin

for dep in [require_create, require_edit, require_view, require_admin]:
    app.dependency_overrides[dep] = lambda: {"id": "audit", "email": "audit@example.invalid", "role": "administrador"}
evidence = []
def note(case, **values):
    evidence.append({"case": case, **values})
def payload(tag, **extra):
    return {"tag": tag, "name": "Gerador São José – revisão 1", "site": "Unidade São João",
            "controller": "InteliGen 200", "transport": "modbus_rtu_serial", "ip": "/dev/ttyAUDIT", **extra}

with TestClient(app, raise_server_exceptions=False) as client:
    created = client.post("/api/generators", json=payload("AUDIT01"))
    assert created.status_code == 201, created.text
    g = db.get_generator(created.json()["id"])
    assert g["name"] == "Gerador São José – revisão 1"
    with db.connect() as conn:
        mirrored = dict(conn.execute("SELECT * FROM assets WHERE legacy_generator_id=?", (g["id"],)).fetchone())
    assert mirrored["name"] == g["name"]
    note("unicode_roundtrip_and_domain_mirror", status=201, equal=True)

    dup = client.post("/api/generators", json=payload(" audit01 ", ip="/dev/ttyOTHER"))
    assert dup.status_code == 409
    note("normalized_duplicate_tag", status=dup.status_code)

    asset_guard = client.patch("/api/assets/asset-" + g["id"], json={"name": "Outro nome"})
    connection_guard = client.patch("/api/connections/conn-" + g["id"], json={"modbus_unit": 12})
    assert asset_guard.status_code == connection_guard.status_code == 409
    firmware = client.patch("/api/controllers/ctrl-" + g["id"], json={"firmware": "audit-only-1"})
    assert firmware.status_code == 200
    domain_store.sync_legacy_generators()
    with db.connect() as conn:
        saved_firmware = conn.execute("SELECT firmware FROM controller_instances WHERE id=?", ('ctrl-'+g['id'],)).fetchone()[0]
    assert saved_firmware == "audit-only-1"
    note("domain_mirror_guards_and_firmware_preservation", asset_status=409, connection_status=409, firmware_preserved=True)

    r = client.patch("/api/generators/" + g["id"], json={"name": "Nome salvo apesar do erro", "modemId": "nonexistent"})
    persisted = db.get_generator(g["id"])["name"]
    assert r.status_code == 422 and persisted == "Nome salvo apesar do erro"
    note("patch_invalid_modem_commits_name_before_error", status=r.status_code, persisted=persisted)

    with patch.object(domain_store, "sync_legacy_generators", side_effect=RuntimeError("audit mirror failure")):
        r = client.post("/api/generators", json=payload("AUDIT02", ip="/dev/ttyAUDIT02"))
    saved = db.get_generator("AUDIT02")
    assert r.status_code == 500 and saved is not None
    retry = client.post("/api/generators", json=payload("AUDIT02", ip="/dev/ttyAUDIT02"))
    assert retry.status_code == 409
    note("post_mirror_failure_after_commit", first_status=500, persisted=True, retry_status=409)

    blanks = client.post("/api/generators", json=payload("   ", name="   ", site="   ", controller="   ", ip="/dev/ttyBLANK"))
    assert blanks.status_code == 201, blanks.text
    empty = db.get_generator(blanks.json()["id"])
    note("whitespace_required_fields", status=201, stored={k: empty[k] for k in ["tag", "name", "site", "controller_model"]})
    assert all(empty[k] == "" for k in ["tag", "name", "site", "controller_model"])

    r = client.patch("/api/generators/" + g["id"], json={"imageUrl": "/photo.png", "diagramName": "Diagrama teste"})
    assert r.status_code == 200
    note("unsupported_image_diagram_fields_silently_ignored", status=200, ignored=True)

    r = client.patch("/api/generators/" + g["id"], json={"nominalPower": 450.5, "fuelCapacityLiters": 1200, "powerTopology": "genset_only"})
    assert r.status_code == 200
    r = client.patch("/api/generators/" + g["id"], json={"nominalPower": None, "fuelCapacityLiters": None})
    assert r.status_code == 200
    current = db.get_generator(g["id"])
    assert current["nominal_power_kw"] is None and current["fuel_capacity_l"] is None and current["power_topology"] == "genset_only"
    note("nominal_tank_clear_and_topology_persistence", ok=True)

    before=db.get_generator(g['id'])
    a=client.patch('/api/generators/'+g['id'],json={'name':'Nome operador A','site':before['site']})
    b=client.patch('/api/generators/'+g['id'],json={'name':before['name'],'site':'Unidade operador B'})
    assert a.status_code==b.status_code==200 and db.get_generator(g['id'])['name']==before['name']
    note('concurrent_stale_form_overwrites_name',first_status=200,second_status=200,first_name_lost=True)

    from app.power_topology import resolve_power_topology
    client.patch('/api/generators/'+g['id'],json={'powerTopology':'auto'})
    mains=domain_store.create_asset({'tag':'MAINAUDIT','name':'Rede isolada de teste','kind':'mains'},'audit')
    domain_store.create_asset_link('asset-'+g['id'],mains['id'],'measures',{},'audit')
    topology,source=resolve_power_topology(db.get_generator(g['id']),[],False)
    assert topology=='mains_genset' and source=='asset_graph'
    note('measurement_relation_treated_as_electrical_topology',relation='measures',topology=topology,source=source)

    provisioned = db.create_generator(payload("AUDIT03") | {"controller_type": "COMAP", "controller_model": "InteliGen 200", "host": "/dev/ttyAUDIT03", "rapid_device_num": 903})
    domain_store.sync_legacy_generators()
    identity = client.patch("/api/generators/" + provisioned["id"], json={"modbusUnit": 22})
    assert identity.status_code == 409
    r = client.patch("/api/generators/" + provisioned["id"], json={"enabled": False})
    assert r.status_code == 200 and db.get_generator(provisioned["id"])["enabled"] is False
    note("industrial_identity_guard_vs_enabled_patch", identity_status=409, enabled_status=200, rapid_device_still_assigned=903)

    modems = [platform_store.create_field_device({"kind": "modem", "name": "Audit modem " + str(i), "listen_port": 15110+i, "status": "approved_unlinked", "metadata": {}}, "audit") for i in [1,2]]
    direct = client.post("/api/generators", json=payload("AUDIT04", transport="modbus_tcp_direct", ip="192.0.2.10", modemId=modems[0]["id"]))
    assert direct.status_code == 201, direct.text
    gid = direct.json()["id"]
    relink = client.patch("/api/generators/" + gid, json={"modemId": modems[1]["id"]})
    assert relink.status_code == 200
    old = next(m for m in platform_store.list_field_devices() if m["id"] == modems[0]["id"])
    with db.connect() as conn:
        links = conn.execute("SELECT count(*) FROM field_device_links WHERE field_device_id=?", (old["id"],)).fetchone()[0]
    note("relink_old_modem_metadata", old_actual_links=links, old_status=old["status"], old_metadata_contains_generator=gid in old["metadata"].get("linkedGeneratorIds",[]))
    assert links == 0 and old["status"] == "approved_linked" and gid in old["metadata"].get("linkedGeneratorIds", [])

    with db.connect() as conn:
        check = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk = len(conn.execute("PRAGMA foreign_key_check").fetchall())
    assert check == "ok" and fk == 0
    note("isolated_database_integrity", integrity=check, foreign_key_violations=fk)

    from app import auth
    import time
    app.dependency_overrides.clear()
    for index,role in enumerate(["visualizacao", "operador", "cadastro"]):
        u=db.create_user({"name":"Audit "+role,"email":role+"@example.invalid","password_hash":auth.hash_password("Isolated-Audit-Only-123"),"role":role,"active":True},"audit")
        token="audit-"+role
        db.create_session(auth.token_hash(token),u['id'],int(time.time())+120)
        client.cookies.set("rc_session",token)
        p=payload("AUDITROLE"+str(index),ip="/dev/ttyROLE"+str(index))
        cr=client.post('/api/generators',json=p)
        if role=='cadastro':
            assert cr.status_code==201,cr.text
            config=client.put('/api/generators/'+cr.json()['id']+'/transport-config',json={'config':{'baudRate':9600,'parity':'None','stopBits':'One'}})
            assert config.status_code==403
            note('cadastro_role_serial_create_vs_transport_save',create_status=201,transport_status=403)
        else:
            assert cr.status_code==403
            note('create_permission_'+role,status=403)

print(json.dumps({"baseline": "afec24a", "production_writes": 0, "evidence": evidence}, ensure_ascii=False, indent=2))
