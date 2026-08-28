import hashlib
import json
import secrets
import time
import uuid

from . import db


def _now() -> int:
    return int(time.time())


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _row(row):
    if row is None:
        return None
    item = dict(row)
    for key in ("active", "enabled"):
        if key in item:
            item[key] = bool(item[key])
    for key in ("metadata_json", "payload_json"):
        if key in item:
            raw = item.pop(key)
            try:
                item[key.removesuffix("_json")] = json.loads(raw or "{}")
            except Exception:
                item[key.removesuffix("_json")] = {}
    return item


def init_platform_db() -> None:
    with db.connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS field_devices (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('modem','gateway')),
                name TEXT NOT NULL,
                site_id TEXT,
                generator_id TEXT,
                model TEXT NOT NULL DEFAULT '',
                serial TEXT NOT NULL DEFAULT '',
                imei TEXT NOT NULL DEFAULT '',
                sim_iccid TEXT NOT NULL DEFAULT '',
                carrier TEXT NOT NULL DEFAULT '',
                host TEXT NOT NULL DEFAULT '',
                rssi REAL,
                status TEXT NOT NULL DEFAULT 'unknown',
                last_seen INTEGER,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                active INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_field_devices_kind ON field_devices(kind);
            CREATE INDEX IF NOT EXISTS idx_field_devices_generator ON field_devices(generator_id);

            CREATE TABLE IF NOT EXISTS notification_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                destination TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                attempts INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 5,
                next_attempt_at INTEGER NOT NULL,
                last_error TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notification_due ON notification_queue(status,next_attempt_at);

            CREATE TABLE IF NOT EXISTS notification_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                queue_id INTEGER,
                channel TEXT NOT NULL,
                destination TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(queue_id) REFERENCES notification_queue(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS scheduler_jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                interval_seconds INTEGER NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                next_run INTEGER NOT NULL,
                last_run INTEGER,
                last_result TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_scheduler_due ON scheduler_jobs(enabled,next_run);

            CREATE TABLE IF NOT EXISTS automation_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id TEXT NOT NULL,
                result TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used_at INTEGER,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_totp (
                user_id TEXT PRIMARY KEY,
                secret_base32 TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS login_attempts (
                attempt_key TEXT PRIMARY KEY,
                window_started INTEGER NOT NULL,
                failures INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS api_tokens (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                token_prefix TEXT NOT NULL,
                scopes TEXT NOT NULL,
                rate_limit INTEGER NOT NULL DEFAULT 120,
                active INTEGER NOT NULL DEFAULT 1,
                expires_at INTEGER,
                last_used INTEGER,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_rate (
                token_id TEXT NOT NULL,
                minute_bucket INTEGER NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(token_id, minute_bucket),
                FOREIGN KEY(token_id) REFERENCES api_tokens(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS report_artifacts (
                report_id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                media_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            """
        )
        conn.execute("DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL", (_now() - 86400,))
        conn.execute("DELETE FROM api_rate WHERE minute_bucket < ?", ((_now() // 60) - 120,))


# ----------------------------- inventory ----------------------------------

def list_field_devices(kind: str | None = None):
    with db.connect() as conn:
        if kind:
            rows = conn.execute("SELECT * FROM field_devices WHERE kind=? ORDER BY name", (kind,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM field_devices ORDER BY kind,name").fetchall()
    return [_row(r) for r in rows]


def create_field_device(data: dict, actor: str):
    kind = str(data.get("kind") or "").strip().lower()
    if kind not in {"modem", "gateway"}:
        raise ValueError("Tipo de equipamento inválido")
    now = _now()
    item = {
        "id": _id("dev"),
        "kind": kind,
        "name": str(data.get("name") or "").strip(),
        "site_id": data.get("site_id") or None,
        "generator_id": data.get("generator_id") or None,
        "model": str(data.get("model") or "").strip(),
        "serial": str(data.get("serial") or "").strip(),
        "imei": str(data.get("imei") or "").strip(),
        "sim_iccid": str(data.get("sim_iccid") or "").strip(),
        "carrier": str(data.get("carrier") or "").strip(),
        "host": str(data.get("host") or "").strip(),
        "rssi": data.get("rssi"),
        "status": str(data.get("status") or "unknown").strip().lower(),
        "last_seen": data.get("last_seen"),
        "metadata_json": json.dumps(data.get("metadata") or {}, ensure_ascii=False),
        "active": 1,
        "created_at": now,
        "updated_at": now,
    }
    if not item["name"]:
        raise ValueError("Nome obrigatório")
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO field_devices(id,kind,name,site_id,generator_id,model,serial,imei,sim_iccid,carrier,host,rssi,status,last_seen,metadata_json,active,created_at,updated_at)
               VALUES (:id,:kind,:name,:site_id,:generator_id,:model,:serial,:imei,:sim_iccid,:carrier,:host,:rssi,:status,:last_seen,:metadata_json,:active,:created_at,:updated_at)""",
            item,
        )
    db.add_audit(actor, "create", kind, item["id"], item["name"])
    return next(x for x in list_field_devices() if x["id"] == item["id"])


def update_field_device(item_id: str, patch: dict, actor: str):
    allowed = {"name", "site_id", "generator_id", "model", "serial", "imei", "sim_iccid", "carrier", "host", "rssi", "status", "last_seen", "metadata", "active"}
    fields, values = [], []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        db_key = "metadata_json" if key == "metadata" else key
        if key == "metadata":
            value = json.dumps(value or {}, ensure_ascii=False)
        if key == "active":
            value = 1 if bool(value) else 0
        fields.append(f"{db_key}=?")
        values.append(value)
    if not fields:
        return next((x for x in list_field_devices() if x["id"] == item_id), None)
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE field_devices SET {', '.join(fields)} WHERE id=?", values)
        if cur.rowcount == 0:
            return None
    db.add_audit(actor, "update", "field_device", item_id, ",".join(patch.keys()))
    return next((x for x in list_field_devices() if x["id"] == item_id), None)


def delete_field_device(item_id: str, actor: str) -> bool:
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM field_devices WHERE id=?", (item_id,))
    if cur.rowcount:
        db.add_audit(actor, "delete", "field_device", item_id, "")
        return True
    return False


# ---------------------------- notifications -------------------------------

def enqueue_notification(event_type: str, channel: str, destination: str = "", subject: str = "", body: str = "", payload=None, max_attempts: int = 5):
    now = _now()
    with db.connect() as conn:
        cur = conn.execute(
            """INSERT INTO notification_queue(event_type,channel,destination,subject,body,payload_json,status,attempts,max_attempts,next_attempt_at,last_error,created_at,updated_at)
               VALUES (?,?,?,?,?,?,'queued',0,?,?, '',?,?)""",
            (event_type, channel, destination, subject, body, json.dumps(payload or {}, ensure_ascii=False), max(1, min(int(max_attempts), 10)), now, now, now),
        )
        return cur.lastrowid


def list_notifications(limit: int = 200):
    limit = max(1, min(int(limit), 2000))
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM notification_queue ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def list_deliveries(limit: int = 200):
    limit = max(1, min(int(limit), 2000))
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM notification_deliveries ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def claim_due_notifications(limit: int = 20):
    now = _now()
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM notification_queue WHERE status IN ('queued','retry') AND next_attempt_at<=? ORDER BY id LIMIT ?",
            (now, limit),
        ).fetchall()
        ids = [r["id"] for r in rows]
        for item_id in ids:
            conn.execute("UPDATE notification_queue SET status='sending',updated_at=? WHERE id=?", (now, item_id))
    return [_row(r) for r in rows]


def finish_notification(item_id: int, channel: str, destination: str, ok: bool, detail: str = ""):
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT attempts,max_attempts FROM notification_queue WHERE id=?", (item_id,)).fetchone()
        if not row:
            return
        attempts = int(row["attempts"]) + 1
        if ok:
            status = "sent"
            next_at = now
            error = ""
        elif attempts >= int(row["max_attempts"]):
            status = "failed"
            next_at = now
            error = detail[:1000]
        else:
            status = "retry"
            next_at = now + min(3600, 30 * (2 ** (attempts - 1)))
            error = detail[:1000]
        conn.execute(
            "UPDATE notification_queue SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?",
            (status, attempts, next_at, error, now, item_id),
        )
        conn.execute(
            "INSERT INTO notification_deliveries(queue_id,channel,destination,status,detail,created_at) VALUES (?,?,?,?,?,?)",
            (item_id, channel, destination, "sent" if ok else "failed", detail[:2000], now),
        )


# ------------------------------- scheduler --------------------------------

def list_scheduler_jobs():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM scheduler_jobs ORDER BY name").fetchall()
    return [_row(r) for r in rows]


def upsert_scheduler_job(data: dict, actor: str):
    interval = max(60, int(data.get("interval_seconds") or 0))
    now = _now()
    item_id = str(data.get("id") or _id("job"))
    payload_json = json.dumps(data.get("payload") or {}, ensure_ascii=False)
    enabled = 1 if data.get("enabled", True) else 0
    next_run = int(data.get("next_run") or now + interval)
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO scheduler_jobs(id,name,kind,interval_seconds,payload_json,enabled,next_run,last_run,last_result,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,NULL,'',?,?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,interval_seconds=excluded.interval_seconds,payload_json=excluded.payload_json,enabled=excluded.enabled,next_run=excluded.next_run,updated_at=excluded.updated_at""",
            (item_id, str(data.get("name") or item_id), str(data.get("kind") or "notification"), interval, payload_json, enabled, next_run, now, now),
        )
    db.add_audit(actor, "upsert", "scheduler_job", item_id, str(data.get("kind") or ""))
    return next(x for x in list_scheduler_jobs() if x["id"] == item_id)


def due_scheduler_jobs(limit: int = 20):
    now = _now()
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM scheduler_jobs WHERE enabled=1 AND next_run<=? ORDER BY next_run LIMIT ?", (now, limit)).fetchall()
    return [_row(r) for r in rows]


def complete_scheduler_job(item_id: str, result: str):
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT interval_seconds FROM scheduler_jobs WHERE id=?", (item_id,)).fetchone()
        if not row:
            return
        conn.execute(
            "UPDATE scheduler_jobs SET last_run=?,last_result=?,next_run=?,updated_at=? WHERE id=?",
            (now, result[:1000], now + int(row["interval_seconds"]), now, item_id),
        )


# ------------------------------- security ---------------------------------

def login_key(email: str, remote_ip: str) -> str:
    return hashlib.sha256(f"{email.strip().lower()}|{remote_ip}".encode()).hexdigest()


def login_allowed(key: str, max_failures: int = 5, window_seconds: int = 900, lock_seconds: int = 900):
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM login_attempts WHERE attempt_key=?", (key,)).fetchone()
        if row and int(row["locked_until"]) > now:
            return False, int(row["locked_until"]) - now
        if row and now - int(row["window_started"]) > window_seconds:
            conn.execute("DELETE FROM login_attempts WHERE attempt_key=?", (key,))
    return True, 0


def record_login_failure(key: str, max_failures: int = 5, lock_seconds: int = 900):
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM login_attempts WHERE attempt_key=?", (key,)).fetchone()
        if not row:
            conn.execute("INSERT INTO login_attempts(attempt_key,window_started,failures,locked_until) VALUES (?,?,1,0)", (key, now))
            return
        failures = int(row["failures"]) + 1
        locked_until = now + lock_seconds if failures >= max_failures else int(row["locked_until"])
        conn.execute("UPDATE login_attempts SET failures=?,locked_until=? WHERE attempt_key=?", (failures, locked_until, key))


def clear_login_failures(key: str):
    with db.connect() as conn:
        conn.execute("DELETE FROM login_attempts WHERE attempt_key=?", (key,))


def create_password_reset(user_id: str, ttl: int = 1800):
    token = secrets.token_urlsafe(40)
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (user_id,))
        conn.execute("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,used_at,created_at) VALUES (?,?,?,NULL,?)", (digest, user_id, now + ttl, now))
    return token


def consume_password_reset(token: str):
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?", (digest, now)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?", (now, digest))
        return row["user_id"]


def set_totp(user_id: str, secret_base32: str, enabled: bool):
    now = _now()
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO user_totp(user_id,secret_base32,enabled,created_at,updated_at) VALUES (?,?,?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET secret_base32=excluded.secret_base32,enabled=excluded.enabled,updated_at=excluded.updated_at""",
            (user_id, secret_base32, 1 if enabled else 0, now, now),
        )


def get_totp(user_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM user_totp WHERE user_id=?", (user_id,)).fetchone()
    return _row(row)


def create_api_token(name: str, scopes: list[str], rate_limit: int = 120, expires_at: int | None = None):
    raw = "rcg_" + secrets.token_urlsafe(40)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    now = _now()
    item_id = _id("tok")
    clean_scopes = sorted({str(s).strip() for s in scopes if str(s).strip()})
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO api_tokens(id,name,token_hash,token_prefix,scopes,rate_limit,active,expires_at,last_used,created_at) VALUES (?,?,?,?,?,?,1,?,NULL,?)",
            (item_id, name.strip(), digest, raw[:12], " ".join(clean_scopes), max(10, min(int(rate_limit), 5000)), expires_at, now),
        )
    return raw, get_api_token(item_id)


def get_api_token(item_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM api_tokens WHERE id=?", (item_id,)).fetchone()
    item = _row(row)
    if item:
        item.pop("token_hash", None)
        item["scopes"] = str(item.get("scopes") or "").split()
    return item


def list_api_tokens():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM api_tokens ORDER BY created_at DESC").fetchall()
    result = []
    for row in rows:
        item = _row(row)
        item.pop("token_hash", None)
        item["scopes"] = str(item.get("scopes") or "").split()
        result.append(item)
    return result


def revoke_api_token(item_id: str):
    with db.connect() as conn:
        cur = conn.execute("UPDATE api_tokens SET active=0 WHERE id=?", (item_id,))
    return bool(cur.rowcount)


def authenticate_api_token(raw: str):
    digest = hashlib.sha256(raw.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM api_tokens WHERE token_hash=? AND active=1", (digest,)).fetchone()
        if not row:
            return None
        if row["expires_at"] and int(row["expires_at"]) <= now:
            return None
        conn.execute("UPDATE api_tokens SET last_used=? WHERE id=?", (now, row["id"]))
        item = dict(row)
        item["scopes"] = str(item.get("scopes") or "").split()
        return item


def consume_api_rate(token_id: str, limit: int) -> bool:
    bucket = _now() // 60
    with db.connect() as conn:
        conn.execute("INSERT INTO api_rate(token_id,minute_bucket,request_count) VALUES (?,?,1) ON CONFLICT(token_id,minute_bucket) DO UPDATE SET request_count=request_count+1", (token_id, bucket))
        count = conn.execute("SELECT request_count FROM api_rate WHERE token_id=? AND minute_bucket=?", (token_id, bucket)).fetchone()[0]
    return int(count) <= int(limit)


def set_report_artifact(report_id: str, path: str, media_type: str, size_bytes: int):
    now = _now()
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO report_artifacts(report_id,path,media_type,size_bytes,created_at) VALUES (?,?,?,?,?)
               ON CONFLICT(report_id) DO UPDATE SET path=excluded.path,media_type=excluded.media_type,size_bytes=excluded.size_bytes,created_at=excluded.created_at""",
            (report_id, path, media_type, int(size_bytes), now),
        )


def get_report_artifact(report_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM report_artifacts WHERE report_id=?", (report_id,)).fetchone()
    return _row(row)
