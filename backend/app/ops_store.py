import json
import time
import uuid
from pathlib import Path

from . import db
from .config import DATA_DIR, DB_FILE


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _now() -> int:
    return int(time.time())


def _row(row):
    if row is None:
        return None
    item = dict(row)
    for key in ("active", "enabled"):
        if key in item:
            item[key] = bool(item[key])
    return item


def init_ops_db() -> None:
    with db.connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                units INTEGER NOT NULL DEFAULT 0,
                gens INTEGER NOT NULL DEFAULT 0,
                sla TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                client_id TEXT,
                city TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                latitude REAL,
                longitude REAL,
                timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
                active INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS work_orders (
                id TEXT PRIMARY KEY,
                generator_id TEXT,
                gen TEXT NOT NULL DEFAULT '',
                site TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL,
                due REAL NOT NULL DEFAULT 0,
                tech TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Planejada',
                description TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS agenda (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                when_text TEXT NOT NULL,
                site TEXT NOT NULL DEFAULT '',
                generator_id TEXT,
                kind TEXT NOT NULL DEFAULT 'manual',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS automation_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trigger_text TEXT NOT NULL,
                action_text TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 0,
                safety_state TEXT NOT NULL DEFAULT 'draft',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                period TEXT NOT NULL,
                format TEXT NOT NULL DEFAULT 'CSV',
                status TEXT NOT NULL DEFAULT 'Pronto',
                created_by TEXT NOT NULL DEFAULT 'system',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS webhooks (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                event TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pausado',
                failures INTEGER NOT NULL DEFAULT 0,
                last_delivery_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT 'system',
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS backup_records (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                type TEXT NOT NULL DEFAULT 'Manual',
                result TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS alarm_ack (
                alarm_key TEXT PRIMARY KEY,
                acked_by TEXT NOT NULL,
                acked_at INTEGER NOT NULL
            );
            """
        )


def _audit(actor: str, action: str, entity_type: str, entity_id: str, detail: str = "") -> None:
    db.add_audit(actor, action, entity_type, entity_id, detail)


def list_clients():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM clients ORDER BY name COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def create_client(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("cli"),
        "name": str(data["name"]).strip(),
        "units": max(0, int(data.get("units") or 0)),
        "gens": max(0, int(data.get("gens") or 0)),
        "sla": str(data.get("sla") or "").strip(),
        "active": 1,
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO clients(id,name,units,gens,sla,active,created_at,updated_at) VALUES (:id,:name,:units,:gens,:sla,:active,:created_at,:updated_at)",
            item,
        )
    _audit(actor, "create", "client", item["id"], item["name"])
    return next(x for x in list_clients() if x["id"] == item["id"])


def list_sites():
    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT s.*, c.name AS client_name
            FROM sites s LEFT JOIN clients c ON c.id=s.client_id
            ORDER BY s.name COLLATE NOCASE
            """
        ).fetchall()
    return [_row(row) for row in rows]


def create_site(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("site"),
        "name": str(data["name"]).strip(),
        "client_id": data.get("client_id") or None,
        "city": str(data.get("city") or "").strip(),
        "state": str(data.get("state") or "").strip(),
        "address": str(data.get("address") or "").strip(),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "timezone": str(data.get("timezone") or "America/Sao_Paulo").strip(),
        "active": 1,
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO sites(id,name,client_id,city,state,address,latitude,longitude,timezone,active,created_at,updated_at)
            VALUES (:id,:name,:client_id,:city,:state,:address,:latitude,:longitude,:timezone,:active,:created_at,:updated_at)
            """,
            item,
        )
    _audit(actor, "create", "site", item["id"], item["name"])
    return next(x for x in list_sites() if x["id"] == item["id"])


def list_work_orders():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM work_orders ORDER BY created_at DESC, id DESC").fetchall()
    return [_row(row) for row in rows]


def create_work_order(data: dict, actor: str):
    now = _now()
    generator_id = data.get("generator_id") or None
    gen = str(data.get("gen") or "").strip()
    site = str(data.get("site") or "").strip()
    if generator_id:
        generator = db.get_generator(generator_id)
        if generator:
            gen = generator["tag"]
            site = generator["site"]
    item = {
        "id": _id("os"),
        "generator_id": generator_id,
        "gen": gen,
        "site": site,
        "type": str(data.get("type") or "Preventiva").strip(),
        "due": float(data.get("due") or 0),
        "tech": str(data.get("tech") or "Equipe campo").strip(),
        "status": str(data.get("status") or "Planejada").strip(),
        "description": str(data.get("description") or "").strip(),
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO work_orders(id,generator_id,gen,site,type,due,tech,status,description,created_at,updated_at)
            VALUES (:id,:generator_id,:gen,:site,:type,:due,:tech,:status,:description,:created_at,:updated_at)
            """,
            item,
        )
    _audit(actor, "create", "work_order", item["id"], f"{item['gen']} {item['type']}")
    return next(x for x in list_work_orders() if x["id"] == item["id"])


def update_work_order(item_id: str, patch: dict, actor: str):
    allowed = {"status", "tech", "due", "description", "type"}
    fields, values = [], []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        fields.append(f"{key}=?")
        values.append(float(value) if key == "due" else str(value))
    if not fields:
        return next((x for x in list_work_orders() if x["id"] == item_id), None)
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE work_orders SET {', '.join(fields)} WHERE id=?", values)
        if cur.rowcount == 0:
            return None
    _audit(actor, "update", "work_order", item_id, ",".join(patch.keys()))
    return next((x for x in list_work_orders() if x["id"] == item_id), None)


def list_agenda():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM agenda ORDER BY created_at DESC").fetchall()
    return [_row(row) for row in rows]


def create_agenda(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("ag"),
        "title": str(data["title"]).strip(),
        "when_text": str(data["when"]).strip(),
        "site": str(data.get("site") or "").strip(),
        "generator_id": data.get("generator_id") or None,
        "kind": str(data.get("kind") or "manual").strip(),
        "enabled": 1,
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO agenda(id,title,when_text,site,generator_id,kind,enabled,created_at,updated_at) VALUES (:id,:title,:when_text,:site,:generator_id,:kind,:enabled,:created_at,:updated_at)",
            item,
        )
    _audit(actor, "create", "agenda", item["id"], item["title"])
    return next(x for x in list_agenda() if x["id"] == item["id"])


def list_rules():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM automation_rules ORDER BY name COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def create_rule(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("rule"),
        "name": str(data["name"]).strip(),
        "trigger_text": str(data["trigger"]).strip(),
        "action_text": str(data["action"]).strip(),
        "enabled": 0,
        "safety_state": "draft",
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO automation_rules(id,name,trigger_text,action_text,enabled,safety_state,created_at,updated_at) VALUES (:id,:name,:trigger_text,:action_text,:enabled,:safety_state,:created_at,:updated_at)",
            item,
        )
    _audit(actor, "create", "automation_rule", item["id"], item["name"])
    return next(x for x in list_rules() if x["id"] == item["id"])


def update_rule(item_id: str, patch: dict, actor: str):
    allowed = {"name", "trigger_text", "action_text", "enabled"}
    fields, values = [], []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key == "enabled":
            value = 1 if bool(value) else 0
        fields.append(f"{key}=?")
        values.append(value)
    if not fields:
        return next((x for x in list_rules() if x["id"] == item_id), None)
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE automation_rules SET {', '.join(fields)} WHERE id=?", values)
        if cur.rowcount == 0:
            return None
    _audit(actor, "update", "automation_rule", item_id, ",".join(patch.keys()))
    return next((x for x in list_rules() if x["id"] == item_id), None)


def list_reports():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
    return [_row(row) for row in rows]


def create_report(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("rel"),
        "name": str(data["name"]).strip(),
        "period": str(data["period"]).strip(),
        "format": str(data.get("format") or "CSV").upper(),
        "status": "Pronto",
        "created_by": actor,
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO reports(id,name,period,format,status,created_by,created_at,updated_at) VALUES (:id,:name,:period,:format,:status,:created_by,:created_at,:updated_at)",
            item,
        )
    _audit(actor, "create", "report", item["id"], item["name"])
    return next(x for x in list_reports() if x["id"] == item["id"])


def list_webhooks():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM webhooks ORDER BY created_at DESC").fetchall()
    return [_row(row) for row in rows]


def create_webhook(data: dict, actor: str):
    now = _now()
    item = {
        "id": _id("wh"),
        "url": str(data["url"]).strip(),
        "event": str(data["event"]).strip(),
        "status": "Pausado",
        "failures": 0,
        "last_delivery_at": None,
        "created_at": now,
        "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO webhooks(id,url,event,status,failures,last_delivery_at,created_at,updated_at) VALUES (:id,:url,:event,:status,:failures,:last_delivery_at,:created_at,:updated_at)",
            item,
        )
    _audit(actor, "create", "webhook", item["id"], f"{item['event']} {item['url']}")
    return next(x for x in list_webhooks() if x["id"] == item["id"])


def update_webhook(item_id: str, patch: dict, actor: str):
    allowed = {"url", "event", "status"}
    fields, values = [], []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        fields.append(f"{key}=?")
        values.append(str(value))
    if not fields:
        return next((x for x in list_webhooks() if x["id"] == item_id), None)
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE webhooks SET {', '.join(fields)} WHERE id=?", values)
        if cur.rowcount == 0:
            return None
    _audit(actor, "update", "webhook", item_id, ",".join(patch.keys()))
    return next((x for x in list_webhooks() if x["id"] == item_id), None)


def list_settings():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM app_settings ORDER BY key").fetchall()
    result = {}
    for row in rows:
        try:
            result[row["key"]] = json.loads(row["value_json"])
        except Exception:
            result[row["key"]] = row["value_json"]
    return result


def set_setting(key: str, value, actor: str):
    now = _now()
    value_json = json.dumps(value, ensure_ascii=False)
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO app_settings(key,value_json,updated_by,updated_at) VALUES (?,?,?,?)
            ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at
            """,
            (key, value_json, actor, now),
        )
    _audit(actor, "update", "setting", key, "valor atualizado")
    return {"key": key, "value": value, "updated_at": now}


def list_backups():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM backup_records ORDER BY created_at DESC").fetchall()
    return [_row(row) for row in rows]


def create_product_backup(actor: str):
    backup_dir = DATA_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    now = _now()
    backup_id = _id("bk")
    target = backup_dir / f"rc-geradores-{time.strftime('%Y%m%d-%H%M%S')}.sqlite3"
    result = "OK"
    detail = ""
    try:
        source = db.connect()
        with source as src:
            dst = __import__("sqlite3").connect(target)
            try:
                src.backup(dst)
            finally:
                dst.close()
    except Exception as exc:
        result = "Falha"
        detail = str(exc)[:500]
    size = target.stat().st_size if target.exists() else 0
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO backup_records(id,created_at,path,size_bytes,type,result,detail) VALUES (?,?,?,?,?,?,?)",
            (backup_id, now, str(target), size, "Manual", result, detail),
        )
    _audit(actor, "backup", "system", backup_id, f"{result} {size} bytes")
    return next(x for x in list_backups() if x["id"] == backup_id)


def ack_alarm(alarm_key: str, actor: str):
    now = _now()
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO alarm_ack(alarm_key,acked_by,acked_at) VALUES (?,?,?)
            ON CONFLICT(alarm_key) DO UPDATE SET acked_by=excluded.acked_by, acked_at=excluded.acked_at
            """,
            (alarm_key, actor, now),
        )
    _audit(actor, "ack", "alarm", alarm_key, "alarme reconhecido")
    return {"alarmKey": alarm_key, "ackedBy": actor, "ackedAt": now}


def list_alarm_acks():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM alarm_ack ORDER BY acked_at DESC").fetchall()
    return [{"alarmKey": r["alarm_key"], "ackedBy": r["acked_by"], "ackedAt": r["acked_at"]} for r in rows]


def bootstrap_payload():
    return {
        "clients": list_clients(),
        "sites": list_sites(),
        "workOrders": list_work_orders(),
        "agenda": list_agenda(),
        "rules": list_rules(),
        "reports": list_reports(),
        "webhooks": list_webhooks(),
        "settings": list_settings(),
        "backups": list_backups(),
        "alarmAcks": list_alarm_acks(),
    }
