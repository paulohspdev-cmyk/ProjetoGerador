import sqlite3
import time
import uuid
from contextlib import contextmanager

from .config import DATA_DIR, DB_FILE


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode=WAL;

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

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('administrador','cadastro','visualizacao')),
                active INTEGER NOT NULL DEFAULT 1,
                last_access INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                remote_ip TEXT NOT NULL DEFAULT '',
                user_agent TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

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
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))


def _row(row):
    if row is None:
        return None
    item = dict(row)
    if "enabled" in item:
        item["enabled"] = bool(item.get("enabled"))
    if "active" in item:
        item["active"] = bool(item.get("active"))
    return item


def _user_public(row):
    item = _row(row)
    if item:
        item.pop("password_hash", None)
    return item


def add_audit(actor, action, entity_type, entity_id, detail=""):
    now = int(time.time())
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO audit_log(created_at, actor, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
            (now, str(actor or "system"), str(action), str(entity_type), str(entity_id), str(detail or "")),
        )
        return cur.lastrowid


def list_audit(limit=200):
    limit = max(1, min(int(limit), 2000))
    with connect() as conn:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_row(row) for row in rows]


# ---------------------------------------------------------------------------
# Usuários e sessões
# ---------------------------------------------------------------------------


def count_users():
    with connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])


def count_active_admins():
    with connect() as conn:
        return int(
            conn.execute(
                "SELECT COUNT(*) FROM users WHERE role='administrador' AND active=1"
            ).fetchone()[0]
        )


def bootstrap_admin(name, email, password_hash):
    email = str(email).strip().lower()
    now = int(time.time())
    with connect() as conn:
        existing = conn.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (email,)).fetchone()
        if existing:
            return _user_public(existing), False
        any_admin = conn.execute(
            "SELECT 1 FROM users WHERE role='administrador' AND active=1 LIMIT 1"
        ).fetchone()
        if any_admin:
            return None, False
        user_id = f"usr-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """
            INSERT INTO users(id,name,email,password_hash,role,active,last_access,created_at,updated_at)
            VALUES (?,?,?,?,?,1,NULL,?,?)
            """,
            (user_id, str(name).strip() or "Administrador", email, password_hash, "administrador", now, now),
        )
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now, "system", "bootstrap", "user", user_id, email),
        )
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return _user_public(row), True


def list_users():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY name COLLATE NOCASE, email").fetchall()
    return [_user_public(row) for row in rows]


def get_user(user_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return _user_public(row)


def get_user_auth(email):
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (str(email).strip(),)).fetchone()
    return _row(row)


def create_user(data, actor="system"):
    now = int(time.time())
    user_id = data.get("id") or f"usr-{uuid.uuid4().hex[:12]}"
    role = str(data.get("role") or "visualizacao")
    if role not in {"administrador", "cadastro", "visualizacao"}:
        raise ValueError("Perfil inválido")
    record = {
        "id": user_id,
        "name": str(data["name"]).strip(),
        "email": str(data["email"]).strip().lower(),
        "password_hash": data["password_hash"],
        "role": role,
        "active": 1 if data.get("active", True) else 0,
        "created_at": now,
        "updated_at": now,
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO users(id,name,email,password_hash,role,active,last_access,created_at,updated_at)
            VALUES (:id,:name,:email,:password_hash,:role,:active,NULL,:created_at,:updated_at)
            """,
            record,
        )
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now, actor, "create", "user", user_id, f"{record['email']} role={role}"),
        )
    return get_user(user_id)


def update_user(user_id, patch, actor="system"):
    current = get_user(user_id)
    if not current:
        return None

    fields = []
    values = []
    detail = []
    for key in ("name", "role", "active", "password_hash"):
        if key not in patch or patch[key] is None:
            continue
        value = patch[key]
        if key == "role":
            value = str(value)
            if value not in {"administrador", "cadastro", "visualizacao"}:
                raise ValueError("Perfil inválido")
        if key == "active":
            value = 1 if bool(value) else 0
        fields.append(f"{key}=?")
        values.append(value)
        detail.append(f"{key}=alterado" if key == "password_hash" else f"{key}={value}")

    if not fields:
        return current
    fields.append("updated_at=?")
    values.append(int(time.time()))
    values.append(user_id)

    with connect() as conn:
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", values)
        if patch.get("active") is False:
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (int(time.time()), actor, "update", "user", user_id, "; ".join(detail)),
        )
    return get_user(user_id)


def delete_user(user_id, actor="system"):
    current = get_user(user_id)
    if not current:
        return False
    now = int(time.time())
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now, actor, "delete", "user", user_id, current["email"]),
        )
    return True


def touch_user_login(user_id, at=None):
    at = int(at or time.time())
    with connect() as conn:
        conn.execute("UPDATE users SET last_access=?, updated_at=? WHERE id=?", (at, at, user_id))


def create_session(token_hash, user_id, expires_at, remote_ip="", user_agent=""):
    now = int(time.time())
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        conn.execute(
            """
            INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen,remote_ip,user_agent)
            VALUES (?,?,?,?,?,?,?)
            """,
            (token_hash, user_id, int(expires_at), now, now, remote_ip, user_agent),
        )


def delete_session(token_hash):
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))


def get_session_user(token_hash, now=None):
    now = int(now or time.time())
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at>? AND u.active=1
            """,
            (token_hash, now),
        ).fetchone()
        if row:
            conn.execute("UPDATE sessions SET last_seen=? WHERE token_hash=?", (now, token_hash))
    return _row(row)


# ---------------------------------------------------------------------------
# Cadastro do produto
# ---------------------------------------------------------------------------


def list_generators():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM generators ORDER BY tag COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def get_generator(generator_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM generators WHERE id = ? OR lower(tag) = lower(?)",
            (generator_id, generator_id),
        ).fetchone()
    return _row(row)


def create_generator(data, actor="system"):
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
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now, actor, "create", "generator", generator_id, record["tag"]),
        )
        conn.execute(
            "INSERT INTO events(generator_id,level,message,created_at) VALUES (?,?,?,?)",
            (generator_id, "INFO", f"Gerador {record['tag']} cadastrado", now),
        )
    return get_generator(generator_id)


def update_generator(generator_id, patch, actor="system"):
    current = get_generator(generator_id)
    if not current:
        return None
    allowed = {
        "tag", "name", "customer", "site", "controller_type", "controller_model",
        "transport", "host", "listen_port", "modbus_unit", "rapid_device_num", "enabled",
    }
    fields, values, detail = [], [], []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key == "enabled":
            value = 1 if bool(value) else 0
        if key in {"listen_port", "modbus_unit"}:
            value = int(value)
        fields.append(f"{key}=?")
        values.append(value)
        detail.append(f"{key}={value}")
    if not fields:
        return current
    fields.append("updated_at=?")
    values.append(int(time.time()))
    values.append(current["id"])
    with connect() as conn:
        conn.execute(f"UPDATE generators SET {', '.join(fields)} WHERE id=?", values)
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (int(time.time()), actor, "update", "generator", current["id"], "; ".join(detail)),
        )
    return get_generator(current["id"])


def delete_generator(generator_id, actor="system"):
    current = get_generator(generator_id)
    if not current:
        return False
    now = int(time.time())
    with connect() as conn:
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?)",
            (now, actor, "delete", "generator", current["id"], current["tag"]),
        )
        conn.execute("DELETE FROM generators WHERE id = ?", (current["id"],))
    return True


def add_event(generator_id, level, message):
    now = int(time.time())
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO events(generator_id,level,message,created_at) VALUES (?,?,?,?)",
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
