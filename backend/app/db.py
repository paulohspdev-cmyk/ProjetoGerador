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
    return get_generator(generator_id)


def delete_generator(generator_id):
    current = get_generator(generator_id)
    if not current:
        return False
    now = int(time.time())
    with connect() as conn:
        conn.execute("DELETE FROM generators WHERE id = ?", (current["id"],))
        conn.execute(
            "INSERT INTO audit_log(created_at, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
            (now, "delete", "generator", current["id"], current["tag"]),
        )
    return True
