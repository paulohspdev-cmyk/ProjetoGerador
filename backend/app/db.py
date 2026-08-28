import sqlite3
import time
import uuid
from contextlib import contextmanager

from .config import DATA_DIR, DB_FILE


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS generators (
                id TEXT PRIMARY KEY,
                tag TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                customer TEXT NOT NULL DEFAULT '',
                site TEXT NOT NULL,
                controller_type TEXT NOT NULL,
                controller_model TEXT NOT NULL,
                transport TEXT NOT NULL DEFAULT 'reverse_tcp',
                host TEXT NOT NULL DEFAULT '',
                listen_port INTEGER NOT NULL DEFAULT 0,
                modbus_unit INTEGER NOT NULL DEFAULT 1,
                rapid_device_num INTEGER,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                generator_id TEXT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                actor TEXT NOT NULL DEFAULT 'system',
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            );
            """
        )


def _row(row):
    if row is None:
        return None
    item = dict(row)
    if "enabled" in item:
        item["enabled"] = bool(item.get("enabled"))
    return item


def list_generators():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM generators ORDER BY tag COLLATE NOCASE"
        ).fetchall()
    return [_row(row) for row in rows]


def get_generator(generator_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM generators WHERE id = ? OR lower(tag) = lower(?)",
            (generator_id, generator_id),
        ).fetchone()
    return _row(row)


def create_generator(data):
    now = int(time.time())
    generator_id = data.get("id") or f"gen-{uuid.uuid4().hex[:12]}"
    record = {
        "id": generator_id,
        "tag": data["tag"].strip().upper(),
        "name": (data.get("name") or data["tag"]).strip(),
        "customer": (data.get("customer") or "").strip(),
        "site": data["site"].strip(),
        "controller_type": data["controller_type"].strip(),
        "controller_model": data["controller_model"].strip(),
        "transport": (data.get("transport") or "reverse_tcp").strip(),
        "host": (data.get("host") or "").strip(),
        "listen_port": int(data.get("listen_port") or 0),
        "modbus_unit": int(data.get("modbus_unit") or 1),
        "rapid_device_num": data.get("rapid_device_num"),
        "enabled": 1 if data.get("enabled", True) else 0,
        "created_at": now,
        "updated_at": now,
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO generators (
                id, tag, name, customer, site, controller_type, controller_model,
                transport, host, listen_port, modbus_unit, rapid_device_num,
                enabled, created_at, updated_at
            ) VALUES (
                :id, :tag, :name, :customer, :site, :controller_type, :controller_model,
                :transport, :host, :listen_port, :modbus_unit, :rapid_device_num,
                :enabled, :created_at, :updated_at
            )
            """,
            record,
        )
        conn.execute(
            "INSERT INTO audit_log(created_at, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
            (now, "create", "generator", generator_id, record["tag"]),
        )
        conn.execute(
            "INSERT INTO events(generator_id, level, message, created_at) VALUES (?, ?, ?, ?)",
            (generator_id, "INFO", f"Gerador {record['tag']} cadastrado", now),
        )
    return get_generator(generator_id)


def delete_generator(generator_id):
    current = get_generator(generator_id)
    if not current:
        return False
    now = int(time.time())
    with connect() as conn:
        conn.execute(
            "INSERT INTO audit_log(created_at, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
            (now, "delete", "generator", current["id"], current["tag"]),
        )
        conn.execute("DELETE FROM generators WHERE id = ?", (current["id"],))
    return True


def add_event(generator_id, level, message):
    now = int(time.time())
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO events(generator_id, level, message, created_at) VALUES (?, ?, ?, ?)",
            (generator_id, str(level).upper(), str(message), now),
        )
        return cur.lastrowid


def list_events(limit=200):
    limit = max(1, min(int(limit), 2000))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT e.id, e.generator_id, e.level, e.message, e.created_at,
                   g.tag, g.name, g.site
            FROM events e
            LEFT JOIN generators g ON g.id = e.generator_id
            ORDER BY e.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_row(row) for row in rows]


def add_audit(actor, action, entity_type, entity_id, detail=""):
    now = int(time.time())
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO audit_log(created_at, actor, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
            (now, actor, action, entity_type, entity_id, detail),
        )
        return cur.lastrowid


def list_audit(limit=200):
    limit = max(1, min(int(limit), 2000))
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_row(row) for row in rows]
