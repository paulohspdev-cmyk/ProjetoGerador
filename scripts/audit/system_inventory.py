"""Inventory + exhaustive authorization boundaries in a disposable RC installation."""
import inspect
import json
import os
import re
import sys
import tempfile
import time
import subprocess
import importlib.metadata
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUTPUT = BASE / "docs/audit/system-2026-10-14"
OUTPUT.mkdir(parents=True, exist_ok=True)
tmp = tempfile.TemporaryDirectory(prefix="rc-system-matrix-")
root = Path(tmp.name)
for key, value in {
    "RC_ENVIRONMENT": "development", "RC_DATA_DIR": str(root),
    "RC_DB_FILE": str(root / "audit.db"), "RC_RAPID_BINDINGS": str(root / "bindings.json"),
    "RC_RAPID_SCADA_ROOT": str(root / "scada"), "RC_RAPID_READER": str(root / "reader-missing.dll"),
    "RC_BRIDGE_STATUS_FILE": str(root / "bridge.json"), "RC_PROVISION_SOCKET": str(root / "provision.sock"),
    "RC_RAPID_CONTROL_SOCKET": str(root / "control.sock"), "RC_2FA_ENFORCED": "0",
    "RC_SMTP_HOST": "", "RC_WHATSAPP_API_URL": "", "RC_ADMIN_PASSWORD": "",
    "RC_AUTH_COOKIE_SECURE": "0",
}.items():
    os.environ[key] = value
(root / "bindings.json").write_text("[]")
sys.path.insert(0, str(BASE / "backend"))
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from app import auth, db, industrial_store, traffic_store, automation_engine, migrations
from app.main import app
from app.extra_routes import external_token

permissions = {getattr(auth, "require_" + p): p for p in ["view", "operate", "create", "edit", "remove", "manage_users", "audit", "admin"]}
def deps(d):
    out = []
    for child in d.dependencies:
        out.append(child.call)
        out.extend(deps(child))
    return out
def source(fn):
    try:
        return str(Path(inspect.getsourcefile(fn)).relative_to(BASE)), inspect.getsourcelines(fn)[1]
    except (TypeError, ValueError):
        return "unknown", 0
def dump(name, value):
    (OUTPUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
def all_routes(items):
    for route in items:
        if isinstance(route, APIRoute):
            yield route
        elif hasattr(route, "original_router"):
            yield from all_routes(route.original_router.routes)
routes = list(all_routes(app.routes))
assert len(routes) == 132, "Route discovery changed: review registered routers, never silently omit them"
inventory, checks, reads, tables = [], [], [], []
with TestClient(app, raise_server_exceptions=False) as client:
    industrial_store.init_industrial_db()
    traffic_store.init_traffic_db()
    automation_engine._init_state()
    migrations.run_migrations()
    gen = db.create_generator({"tag": "MATRIXGEN", "name": "Audit isolated", "site": "Isolated", "controller_type": "COMAP", "controller_model": "InteliGen 200", "transport": "modbus_rtu_serial", "host": "/dev/ttyMATRIX", "modbus_unit": 1})
    users = {}
    for role in auth.ROLE_PERMISSIONS:
        user = db.create_user({"name": "Audit " + role, "email": role + "@example.invalid", "password_hash": auth.hash_password("Isolated-Matrix-123"), "role": role, "active": True}, "audit")
        token = "audit-token-" + role
        db.create_session(auth.token_hash(token), user["id"], int(time.time()) + 3600)
        users[role] = token
    for index, route in enumerate(routes, 1):
        calls = deps(route.dependant)
        required = [permissions[c] for c in calls if c in permissions]
        authenticated = auth.current_user in calls
        bearer = external_token in calls
        filename, line = source(route.endpoint)
        path = re.sub(r"\{([^}:]+)(?::[^}]+)?\}", lambda m: gen["id"] if m[1] == "generator_id" else ("start" if m[1] == "action" else ("1" if any(x in m[1] for x in ["port", "hours", "bit"]) else "audit-missing")), route.path)
        params = {p.name: (1 if getattr(p, "type_", p.field_info.annotation) is int else "audit") for p in route.dependant.query_params if p.field_info.is_required()}
        item = {"id": f"API-{index:03d}", "path": route.path, "methods": sorted(route.methods), "endpoint": route.endpoint.__name__, "source": filename, "line": line, "permissions": required, "authenticated": authenticated, "response_model": str(route.response_model), "body_required": bool(route.body_field and route.body_field.field_info.is_required()), "status": "inventariado; contrato funcional exige cenários específicos"}
        inventory.append(item)
        item["authentication_kind"] = "bearer" if bearer else ("session" if authenticated else "public")
        for method in sorted(route.methods):
            if authenticated or bearer:
                client.cookies.clear()
                r = client.request(method, path, params=params, json={} if method != "GET" else None)
                checks.append({"id": item["id"], "role": "anonymous", "method": method, "expected": 401, "actual": r.status_code, "ok": r.status_code == 401})
                for role, token in users.items():
                    if bearer:
                        client.cookies.set("rc_session", token)
                        r=client.request(method,path,params=params,json={} if method!="GET" else None)
                        checks.append({"id":item['id'],"role":role,"method":method,"expected":401,"actual":r.status_code,"ok":r.status_code==401,"note":"session cookie is not a Bearer credential"})
                        continue
                    if not required or all(auth.can({"role": role}, p) for p in required):
                        continue
                    client.cookies.set("rc_session", token)
                    r = client.request(method, path, params=params, json={} if method != "GET" else None)
                    checks.append({"id": item["id"], "role": role, "method": method, "expected": 403, "actual": r.status_code, "ok": r.status_code == 403})
            if method == "GET":
                client.cookies.clear()
                if authenticated:
                    client.cookies.set("rc_session", users["administrador"])
                r = client.get(path, params=params)
                reads.append({"id": item["id"], "status": r.status_code, "server_error": r.status_code >= 500, "content_type": r.headers.get("content-type", ""), "note": "IDs inexistentes e recursos externos ausentes são fixtures; status não certifica contrato completo"})
    from app import platform_store
    read_token,read_item=platform_store.create_api_token('read-only isolated',['ops.read'],120,None,[gen['id']],[])
    token_cases=[('read-list','GET','/api/v1/generators',read_token,200),('read-detail','GET','/api/v1/generators/'+gen['id'],read_token,200),('read-token-command-denied','POST','/api/v1/generators/'+gen['id']+'/commands/start',read_token,403),('unknown-token','GET','/api/v1/generators','invalid-audit-token',401)]
    expired,_=platform_store.create_api_token('expired',['ops.read'],120,int(time.time())-1,[],[])
    token_cases.append(('expired-token','GET','/api/v1/generators',expired,401))
    limited,_=platform_store.create_api_token('wrong-origin',['ops.read'],120,None,[],['192.0.2.0/24'])
    token_cases.append(('origin-allowlist','GET','/api/v1/generators',limited,403))
    outside,_=platform_store.create_api_token('other-generator',['ops.read'],120,None,['not-the-fixture'],[])
    token_cases.append(('generator-allowlist','GET','/api/v1/generators/'+gen['id'],outside,404))
    for label,method,path,raw,expected in token_cases:
        r=client.request(method,path,headers={'Authorization':'Bearer '+raw})
        checks.append({'id':'TOKEN-'+label,'role':'bearer','method':method,'expected':expected,'actual':r.status_code,'ok':r.status_code==expected})
    platform_store.revoke_api_token(read_item['id'])
    r=client.get('/api/v1/generators',headers={'Authorization':'Bearer '+read_token})
    checks.append({'id':'TOKEN-revoked','role':'bearer','method':'GET','expected':401,'actual':r.status_code,'ok':r.status_code==401})
    for header in ['Bearer','Bearer ','Bearer   ','Basic audit-invalid','Bearer     audit-invalid']:
        r=client.get('/api/v1/generators',headers={'Authorization':header})
        checks.append({'id':'TOKEN-malformed-'+repr(header),'role':'malformed-header','method':'GET','expected':401,'actual':r.status_code,'ok':r.status_code==401})
    with db.connect() as conn:
        for row in conn.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            name = row["name"]
            tables.append({"id": f"DB-{len(tables)+1:03d}", "name": name, "columns": [dict(x) for x in conn.execute('PRAGMA table_info("'+name+'")')], "foreign_keys": [dict(x) for x in conn.execute('PRAGMA foreign_key_list("'+name+'")')], "indexes": [dict(x) for x in conn.execute('PRAGMA index_list("'+name+'")')], "sql": row["sql"], "status": "schema inventariado; sem aprovação automática de semântica"})
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk = len(conn.execute("PRAGMA foreign_key_check").fetchall())

nav = sorted(set(re.findall(r'slug:\s*"([^"]*)"', (BASE / "frontend/src/data/nav.ts").read_text())))
packs = []
for p in sorted((BASE / "controllers").rglob("manifest.json")):
    data = json.loads(p.read_text())
    packs.append({"id": f"PACK-{len(packs)+1:03d}", "source": str(p.relative_to(BASE)), "pack_id": data.get("packId"), "lifecycle": data.get("lifecycle"), "model": data.get("model", data.get("controller",{})), "status": "inventariado; testes simulados não homologam hardware"})
files = []
blob_meta={}
for line in subprocess.check_output(["git","ls-tree","-r","-l","afec24a685e23707d7d2c230f6a3e373a8cd8ff6"],cwd=BASE,text=True).splitlines():
    meta,name=line.split("\t",1);fields=meta.split();blob_meta[name]=(fields[2],int(fields[3]))
folders=["backend/app", "frontend/src", "frontend/public", "ops", "infrastructure", "rapid", "controllers", "scripts/validation", "tests", "backend/tests", ".github/workflows", "docs"]
for filename in subprocess.check_output(['git','ls-tree','-r','--name-only','afec24a685e23707d7d2c230f6a3e373a8cd8ff6'],cwd=BASE,text=True).splitlines():
    p=BASE/filename
    area=next((f for f in folders if filename.startswith(f+'/')),'root/configuração')
    files.append({'source':filename,'area':area,'bytes':blob_meta[filename][1],'git_blob':blob_meta[filename][0],'status':'inventariado; arquivo da baseline, não aprovação funcional'})
results = {"baseline": "afec24a685e23707d7d2c230f6a3e373a8cd8ff6", "routes": len(inventory), "authorization_cases": len(checks), "authorization_failures": [c for c in checks if not c["ok"]], "get_probes": len(reads), "get_server_errors": [r for r in reads if r["server_error"]], "tables": len(tables), "integrity": integrity, "foreign_key_violations": fk, "nav_slugs": len(nav), "packs": len(packs), "files": len(files), "production_writes": 0}
results['dependencies']={p:importlib.metadata.version(p) for p in ['fastapi','starlette','pydantic','uvicorn','cryptography']}
for name, value in [("api_inventory.json", inventory), ("authorization_results.json", checks), ("read_results.json", reads), ("database_inventory.json", tables), ("navigation_inventory.json", nav), ("pack_inventory.json", packs), ("file_inventory.json", files), ("summary.json", results)]:
    dump(name, value)
print(json.dumps(results, ensure_ascii=False, indent=2))
if results["authorization_failures"] or integrity != "ok" or fk:
    raise SystemExit(1)
