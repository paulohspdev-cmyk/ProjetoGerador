import hashlib
import json
import os
import secrets
import time
import uuid

from . import db, traffic_store


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
    for key in ("metadata_json", "payload_json", "result_json"):
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
                manufacturer TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                serial TEXT NOT NULL DEFAULT '',
                imei TEXT NOT NULL DEFAULT '',
                sim_phone TEXT NOT NULL DEFAULT '',
                sim_iccid TEXT NOT NULL DEFAULT '',
                carrier TEXT NOT NULL DEFAULT '',
                apn TEXT NOT NULL DEFAULT '',
                host TEXT NOT NULL DEFAULT '',
                listen_port INTEGER,
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

            CREATE TABLE IF NOT EXISTS field_device_links (
                field_device_id TEXT NOT NULL,
                generator_id TEXT NOT NULL,
                relation TEXT NOT NULL DEFAULT 'transport',
                created_at INTEGER NOT NULL,
                PRIMARY KEY(field_device_id,generator_id,relation),
                FOREIGN KEY(field_device_id) REFERENCES field_devices(id) ON DELETE CASCADE,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_field_device_links_generator
                ON field_device_links(generator_id);

            CREATE TABLE IF NOT EXISTS modem_admission_decisions (
                remote_port INTEGER PRIMARY KEY,
                state TEXT NOT NULL CHECK(state IN ('approved','rejected')),
                field_device_id TEXT,
                actor TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(field_device_id) REFERENCES field_devices(id) ON DELETE SET NULL
            );

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
                claim_token TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notification_due ON notification_queue(status,next_attempt_at);
            CREATE INDEX IF NOT EXISTS idx_notification_retention ON notification_queue(status,created_at);

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
            CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at
                ON notification_deliveries(created_at);

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
                claim_token TEXT NOT NULL DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS password_reset_requests (
                request_key TEXT PRIMARY KEY,
                window_started INTEGER NOT NULL,
                requests INTEGER NOT NULL DEFAULT 0,
                last_request INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS api_tokens (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                token_prefix TEXT NOT NULL,
                scopes TEXT NOT NULL,
                allowed_generators TEXT NOT NULL DEFAULT '',
                allowed_cidrs TEXT NOT NULL DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS lifecycle_operations (
                id TEXT PRIMARY KEY,
                generator_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT 'system',
                actor_role TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                result_json TEXT NOT NULL DEFAULT '{}',
                error TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_lifecycle_operations_queue
                ON lifecycle_operations(status,created_at);
            CREATE INDEX IF NOT EXISTS idx_lifecycle_operations_generator
                ON lifecycle_operations(generator_id,created_at DESC);

            CREATE TABLE IF NOT EXISTS worker_heartbeats (
                name TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'starting',
                pid INTEGER NOT NULL DEFAULT 0,
                detail TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            """
        )
        # API + múltiplos workers inicializam este store no boot. Serializamos
        # as migrações aditivas para que dois processos não executem o mesmo
        # ALTER TABLE após observarem simultaneamente uma coluna ausente.
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")

        field_device_columns = {
            str(row["name"]) for row in conn.execute("PRAGMA table_info(field_devices)").fetchall()
        }
        for column, ddl in (
            ("manufacturer", "TEXT NOT NULL DEFAULT ''"),
            ("sim_phone", "TEXT NOT NULL DEFAULT ''"),
            ("apn", "TEXT NOT NULL DEFAULT ''"),
            ("listen_port", "INTEGER"),
        ):
            if column not in field_device_columns:
                conn.execute(f"ALTER TABLE field_devices ADD COLUMN {column} {ddl}")
        conn.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS idx_field_devices_modem_port
               ON field_devices(listen_port)
               WHERE kind='modem' AND listen_port IS NOT NULL AND active=1"""
        )

        api_token_columns = {
            str(row["name"]) for row in conn.execute("PRAGMA table_info(api_tokens)").fetchall()
        }
        if "allowed_generators" not in api_token_columns:
            conn.execute("ALTER TABLE api_tokens ADD COLUMN allowed_generators TEXT NOT NULL DEFAULT ''")
        if "allowed_cidrs" not in api_token_columns:
            conn.execute("ALTER TABLE api_tokens ADD COLUMN allowed_cidrs TEXT NOT NULL DEFAULT ''")

        notification_columns = {
            str(row["name"])
            for row in conn.execute("PRAGMA table_info(notification_queue)").fetchall()
        }
        if "claim_token" not in notification_columns:
            conn.execute(
                "ALTER TABLE notification_queue ADD COLUMN claim_token TEXT NOT NULL DEFAULT ''"
            )

        scheduler_columns = {
            str(row["name"])
            for row in conn.execute("PRAGMA table_info(scheduler_jobs)").fetchall()
        }
        if "claim_token" not in scheduler_columns:
            conn.execute(
                "ALTER TABLE scheduler_jobs ADD COLUMN claim_token TEXT NOT NULL DEFAULT ''"
            )

        conn.execute("DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL", (_now() - 86400,))
        conn.execute("DELETE FROM api_rate WHERE minute_bucket < ?", ((_now() // 60) - 120,))


EXPECTED_WORKERS = ("operational", "heavy", "notification", "lifecycle")
WORKER_STALE_AFTER = {"operational": 45, "notification": 45, "heavy": 180, "lifecycle": 180}


def touch_worker_heartbeat(name: str, status: str = "ok", detail: str = "") -> None:
    """Persist a bounded liveness signal for one supervised worker process."""
    now = _now()
    safe_name = str(name).strip().lower()[:64]
    safe_status = str(status or "ok").strip().lower()[:32]
    safe_detail = str(detail or "")[:500]
    if not safe_name:
        return
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO worker_heartbeats(name,status,pid,detail,updated_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(name) DO UPDATE SET
                 status=excluded.status,
                 pid=excluded.pid,
                 detail=excluded.detail,
                 updated_at=excluded.updated_at""",
            (safe_name, safe_status, int(os.getpid()), safe_detail, now),
        )


def worker_health(stale_after: int | None = None) -> list[dict]:
    now = _now()
    override = max(10, min(int(stale_after), 3600)) if stale_after is not None else None
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM worker_heartbeats").fetchall()
    indexed = {str(row["name"]): dict(row) for row in rows}
    result = []
    for name in EXPECTED_WORKERS:
        row = indexed.get(name)
        if row is None:
            result.append(
                {
                    "name": name,
                    "status": "missing",
                    "pid": 0,
                    "detail": "heartbeat ainda não registrado",
                    "updatedAt": None,
                    "ageSeconds": None,
                    "staleAfterSeconds": override if override is not None else WORKER_STALE_AFTER.get(name, 60),
                    "healthy": False,
                }
            )
            continue
        age = max(0, now - int(row.get("updated_at") or 0))
        status = str(row.get("status") or "unknown")
        threshold = override if override is not None else WORKER_STALE_AFTER.get(name, 60)
        result.append(
            {
                "name": name,
                "status": status,
                "pid": int(row.get("pid") or 0),
                "detail": str(row.get("detail") or ""),
                "updatedAt": int(row.get("updated_at") or 0),
                "ageSeconds": age,
                "healthy": status == "ok" and age <= threshold,
                "staleAfterSeconds": threshold,
            }
        )
    return result


def queue_health() -> dict:
    now = _now()
    with db.connect() as conn:
        notification = {
            str(row["status"]): int(row["count"])
            for row in conn.execute(
                "SELECT status, COUNT(*) AS count FROM notification_queue GROUP BY status"
            ).fetchall()
        }
        lifecycle = {
            str(row["status"]): int(row["count"])
            for row in conn.execute(
                "SELECT status, COUNT(*) AS count FROM lifecycle_operations GROUP BY status"
            ).fetchall()
        }
        stale_sending = int(
            conn.execute(
                "SELECT COUNT(*) FROM notification_queue WHERE status='sending' AND updated_at<=?",
                (now - 180,),
            ).fetchone()[0]
        )
        stale_lifecycle = int(
            conn.execute(
                "SELECT COUNT(*) FROM lifecycle_operations WHERE status='running' AND updated_at<=?",
                (now - 300,),
            ).fetchone()[0]
        )
        due_scheduler = int(
            conn.execute(
                "SELECT COUNT(*) FROM scheduler_jobs WHERE enabled=1 AND next_run<=?",
                (now,),
            ).fetchone()[0]
        )
    return {
        "notifications": notification,
        "lifecycle": lifecycle,
        "staleNotificationClaims": stale_sending,
        "staleLifecycleOperations": stale_lifecycle,
        "dueSchedulerJobs": due_scheduler,
        "healthy": stale_sending == 0 and stale_lifecycle == 0,
        "generatedAt": now,
    }


# ----------------------------- inventory ----------------------------------

def _field_device_port(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        port = int(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Porta do modem inválida") from exc
    if not 1 <= port <= 65535:
        raise ValueError("Porta do modem deve ficar entre 1 e 65535")
    return port


def list_field_devices(kind: str | None = None):
    init_platform_db()
    with db.connect() as conn:
        if kind:
            rows = conn.execute(
                "SELECT * FROM field_devices WHERE kind=? ORDER BY name",
                (kind,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM field_devices ORDER BY kind,name").fetchall()
        links = conn.execute(
            "SELECT field_device_id,generator_id FROM field_device_links ORDER BY created_at"
        ).fetchall()
    by_device: dict[str, list[str]] = {}
    for link in links:
        by_device.setdefault(str(link["field_device_id"]), []).append(str(link["generator_id"]))
    result = []
    for row in rows:
        item = _row(row)
        item["linked_generator_ids"] = by_device.get(str(item["id"]), [])
        result.append(item)
    return result


def _validate_field_device_refs(*, site_id=None, generator_id=None) -> None:
    if generator_id and not db.get_generator(str(generator_id)):
        raise ValueError("Gerador vinculado ao equipamento não existe")
    if site_id:
        with db.connect() as conn:
            exists = conn.execute("SELECT 1 FROM sites WHERE id=?", (str(site_id),)).fetchone()
        if not exists:
            raise ValueError("Unidade/site vinculada ao equipamento não existe")


def _validate_modem_port(item_id: str | None, port: int | None, active: bool = True) -> None:
    if port is None or not active:
        return
    with db.connect() as conn:
        params: list = [port]
        suffix = ""
        if item_id:
            suffix = " AND id<>?"
            params.append(item_id)
        conflict = conn.execute(
            "SELECT id FROM field_devices "
            "WHERE kind='modem' AND active=1 AND listen_port=?" + suffix,
            tuple(params),
        ).fetchone()
    if conflict:
        raise ValueError(f"Porta {port} já pertence a outro modem ativo")


def create_field_device(data: dict, actor: str):
    init_platform_db()
    kind = str(data.get("kind") or "").strip().lower()
    if kind not in {"modem", "gateway"}:
        raise ValueError("Tipo de equipamento inválido")
    now = _now()
    listen_port = _field_device_port(data.get("listen_port")) if kind == "modem" else None
    item = {
        "id": _id("dev"),
        "kind": kind,
        "name": str(data.get("name") or "").strip(),
        "site_id": data.get("site_id") or None,
        "generator_id": data.get("generator_id") or None,
        "manufacturer": str(data.get("manufacturer") or "").strip(),
        "model": str(data.get("model") or "").strip(),
        "serial": str(data.get("serial") or "").strip(),
        "imei": str(data.get("imei") or "").strip(),
        "sim_phone": str(data.get("sim_phone") or "").strip(),
        "sim_iccid": str(data.get("sim_iccid") or "").strip(),
        "carrier": str(data.get("carrier") or "").strip(),
        "apn": str(data.get("apn") or "").strip(),
        "host": str(data.get("host") or "").strip(),
        "listen_port": listen_port,
        "rssi": data.get("rssi"),
        "status": str(data.get("status") or "unknown").strip().lower(),
        "last_seen": data.get("last_seen"),
        "metadata_json": json.dumps(data.get("metadata") or {}, ensure_ascii=False),
        "active": 1 if data.get("active", True) else 0,
        "created_at": now,
        "updated_at": now,
    }
    if not item["name"]:
        raise ValueError("Nome obrigatório")
    _validate_field_device_refs(
        site_id=item.get("site_id"),
        generator_id=item.get("generator_id"),
    )
    _validate_modem_port(None, listen_port, bool(item["active"]))
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO field_devices(
                   id,kind,name,site_id,generator_id,manufacturer,model,serial,imei,
                   sim_phone,sim_iccid,carrier,apn,host,listen_port,rssi,status,last_seen,
                   metadata_json,active,created_at,updated_at
               ) VALUES (
                   :id,:kind,:name,:site_id,:generator_id,:manufacturer,:model,:serial,:imei,
                   :sim_phone,:sim_iccid,:carrier,:apn,:host,:listen_port,:rssi,:status,:last_seen,
                   :metadata_json,:active,:created_at,:updated_at
               )""",
            item,
        )
    db.add_audit(actor, "create", kind, item["id"], item["name"])
    return next(x for x in list_field_devices() if x["id"] == item["id"])


def update_field_device(item_id: str, patch: dict, actor: str):
    init_platform_db()
    allowed = {
        "name",
        "site_id",
        "generator_id",
        "manufacturer",
        "model",
        "serial",
        "imei",
        "sim_phone",
        "sim_iccid",
        "carrier",
        "apn",
        "host",
        "listen_port",
        "rssi",
        "status",
        "last_seen",
        "metadata",
        "active",
    }
    current = next((x for x in list_field_devices() if x["id"] == item_id), None)
    if not current:
        return None
    prospective_site = patch.get("site_id", current.get("site_id"))
    prospective_generator = patch.get("generator_id", current.get("generator_id"))
    prospective_active = bool(patch.get("active", current.get("active")))
    prospective_port = current.get("listen_port")
    if "listen_port" in patch:
        prospective_port = _field_device_port(patch.get("listen_port"))
    _validate_field_device_refs(
        site_id=prospective_site,
        generator_id=prospective_generator,
    )
    if current.get("kind") == "modem":
        _validate_modem_port(item_id, prospective_port, prospective_active)
    fields, values = [], []
    for key, value in patch.items():
        if key not in allowed:
            continue
        db_key = "metadata_json" if key == "metadata" else key
        if key == "metadata":
            value = json.dumps(value or {}, ensure_ascii=False)
        elif key == "active":
            value = 1 if bool(value) else 0
        elif key == "listen_port":
            value = _field_device_port(value)
        fields.append(f"{db_key}=?")
        values.append(value)
    if not fields:
        return current
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE field_devices SET {', '.join(fields)} WHERE id=?", values)
        if cur.rowcount == 0:
            return None
    db.add_audit(actor, "update", "field_device", item_id, ",".join(patch.keys()))
    return next(x for x in list_field_devices() if x["id"] == item_id)


def delete_field_device(item_id: str, actor: str) -> bool:
    init_platform_db()
    with db.connect() as conn:
        linked = conn.execute(
            "SELECT COUNT(*) FROM field_device_links WHERE field_device_id=?",
            (item_id,),
        ).fetchone()[0]
        if int(linked):
            raise ValueError("Modem/gateway vinculado a gerador não pode ser excluído")
        cur = conn.execute("DELETE FROM field_devices WHERE id=?", (item_id,))
    if cur.rowcount:
        db.add_audit(actor, "delete", "field_device", item_id, "")
        return True
    return False


def list_modem_admissions() -> list[dict]:
    init_platform_db()
    traffic_store.init_traffic_db()
    with db.connect() as conn:
        observations = conn.execute(
            """SELECT remote_port,
                      MIN(first_seen_at) AS first_seen_at,
                      MAX(last_seen_at) AS last_seen_at,
                      SUM(accepted_count) AS accepted_count,
                      SUM(rejected_count) AS rejected_count,
                      COUNT(*) AS peer_count
               FROM bridge_peer_observations
               GROUP BY remote_port
               ORDER BY last_seen_at DESC"""
        ).fetchall()
        latest = {
            int(row["remote_port"]): row["remote_ip"]
            for row in conn.execute(
                """SELECT p.remote_port,p.remote_ip
                   FROM bridge_peer_observations p
                   WHERE p.last_seen_at=(
                       SELECT MAX(p2.last_seen_at)
                       FROM bridge_peer_observations p2
                       WHERE p2.remote_port=p.remote_port
                   )"""
            ).fetchall()
        }
        decisions = {
            int(row["remote_port"]): dict(row)
            for row in conn.execute("SELECT * FROM modem_admission_decisions").fetchall()
        }
        devices = {
            int(row["listen_port"]): dict(row)
            for row in conn.execute(
                """SELECT id,name,listen_port,status,active
                   FROM field_devices
                   WHERE kind='modem' AND listen_port IS NOT NULL"""
            ).fetchall()
        }
    result = []
    seen: set[int] = set()
    for row in observations:
        port = int(row["remote_port"])
        seen.add(port)
        decision = decisions.get(port)
        device = devices.get(port)
        result.append(
            {
                "remotePort": port,
                "remoteIp": latest.get(port, ""),
                "firstSeenAt": int(row["first_seen_at"] or 0),
                "lastSeenAt": int(row["last_seen_at"] or 0),
                "acceptedCount": int(row["accepted_count"] or 0),
                "rejectedCount": int(row["rejected_count"] or 0),
                "peerCount": int(row["peer_count"] or 0),
                "state": str((decision or {}).get("state") or "pending"),
                "fieldDeviceId": (decision or {}).get("field_device_id"),
                "fieldDeviceName": str((device or {}).get("name") or ""),
                "reason": str((decision or {}).get("reason") or ""),
            }
        )
    for port, decision in sorted(decisions.items()):
        if port in seen:
            continue
        device = devices.get(port)
        result.append(
            {
                "remotePort": port,
                "remoteIp": "",
                "firstSeenAt": 0,
                "lastSeenAt": 0,
                "acceptedCount": 0,
                "rejectedCount": 0,
                "peerCount": 0,
                "state": str(decision.get("state") or "pending"),
                "fieldDeviceId": decision.get("field_device_id"),
                "fieldDeviceName": str((device or {}).get("name") or ""),
                "reason": str(decision.get("reason") or ""),
            }
        )
    return sorted(result, key=lambda item: (-int(item["lastSeenAt"]), int(item["remotePort"])))


def _admission_by_port(remote_port: int) -> dict | None:
    port = _field_device_port(remote_port)
    return next((item for item in list_modem_admissions() if item["remotePort"] == port), None)


def approve_modem_admission(remote_port: int, data: dict, actor: str) -> dict:
    admission = _admission_by_port(remote_port)
    if not admission or not admission.get("lastSeenAt"):
        raise ValueError("Nenhuma chegada de modem foi observada nesta porta")
    port = int(admission["remotePort"])
    payload = {
        **data,
        "kind": "modem",
        "listen_port": port,
        "host": admission.get("remoteIp") or "",
        "status": "approved",
        "last_seen": admission.get("lastSeenAt"),
        "active": True,
    }
    metadata = dict(data.get("metadata") or {})
    metadata["admission"] = {
        "remotePort": port,
        "firstSeenAt": admission.get("firstSeenAt"),
        "lastSeenAt": admission.get("lastSeenAt"),
    }
    payload["metadata"] = metadata

    existing = next(
        (
            item
            for item in list_field_devices("modem")
            if int(item.get("listen_port") or 0) == port
        ),
        None,
    )
    if existing:
        device = update_field_device(existing["id"], payload, actor)
    else:
        device = create_field_device(payload, actor)

    now = _now()
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO modem_admission_decisions(
                   remote_port,state,field_device_id,actor,reason,created_at,updated_at
               ) VALUES (?,'approved',?,?,?, ?,?)
               ON CONFLICT(remote_port) DO UPDATE SET
                   state='approved',
                   field_device_id=excluded.field_device_id,
                   actor=excluded.actor,
                   reason='',
                   updated_at=excluded.updated_at""",
            (port, device["id"], actor, "", now, now),
        )
    db.add_audit(actor, "approve", "modem_admission", str(port), device["id"])
    return _admission_by_port(port)


def reject_modem_admission(remote_port: int, reason: str, actor: str) -> dict:
    admission = _admission_by_port(remote_port)
    if not admission:
        raise ValueError("Porta de admissão não observada")
    if admission.get("fieldDeviceId"):
        raise ValueError("Modem já aprovado; desative o cadastro antes de rejeitar a porta")
    port = int(admission["remotePort"])
    now = _now()
    clean_reason = str(reason or "").strip()[:500]
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO modem_admission_decisions(
                   remote_port,state,field_device_id,actor,reason,created_at,updated_at
               ) VALUES (?,'rejected',NULL,?,?,?,?)
               ON CONFLICT(remote_port) DO UPDATE SET
                   state='rejected',
                   field_device_id=NULL,
                   actor=excluded.actor,
                   reason=excluded.reason,
                   updated_at=excluded.updated_at""",
            (port, actor, clean_reason, now, now),
        )
    db.add_audit(actor, "reject", "modem_admission", str(port), clean_reason)
    return _admission_by_port(port)


def reopen_modem_admission(remote_port: int, actor: str) -> dict | None:
    port = _field_device_port(remote_port)
    with db.connect() as conn:
        row = conn.execute(
            "SELECT state,field_device_id FROM modem_admission_decisions WHERE remote_port=?",
            (port,),
        ).fetchone()
        if row and row["field_device_id"]:
            raise ValueError("Modem aprovado não pode voltar para pendente")
        conn.execute("DELETE FROM modem_admission_decisions WHERE remote_port=?", (port,))
    db.add_audit(actor, "reopen", "modem_admission", str(port), "")
    return _admission_by_port(port)


def require_approved_modem(modem_id: str | None, remote_port: int) -> dict:
    init_platform_db()
    port = _field_device_port(remote_port)
    if not modem_id:
        raise ValueError("Selecione um modem aprovado antes de cadastrar o gerador")
    with db.connect() as conn:
        row = conn.execute(
            """SELECT fd.*
               FROM field_devices fd
               JOIN modem_admission_decisions d
                 ON d.field_device_id=fd.id
                AND d.remote_port=fd.listen_port
                AND d.state='approved'
               WHERE fd.id=? AND fd.kind='modem' AND fd.active=1 AND fd.listen_port=?""",
            (str(modem_id), port),
        ).fetchone()
    if not row:
        raise ValueError("Modem não aprovado para a porta reverse TCP informada")
    return _row(row)


def approved_modem_for_port(remote_port: int) -> dict | None:
    port = _field_device_port(remote_port)
    with db.connect() as conn:
        row = conn.execute(
            """SELECT fd.*
               FROM field_devices fd
               JOIN modem_admission_decisions d
                 ON d.field_device_id=fd.id
                AND d.remote_port=fd.listen_port
                AND d.state='approved'
               WHERE fd.kind='modem' AND fd.active=1 AND fd.listen_port=?""",
            (port,),
        ).fetchone()
    return _row(row)


def require_approved_inventory_modem(modem_id: str | None) -> dict:
    init_platform_db()
    if not modem_id:
        raise ValueError("Selecione um modem aprovado antes de cadastrar o gerador")
    with db.connect() as conn:
        row = conn.execute(
            """SELECT *
               FROM field_devices
               WHERE id=? AND kind='modem' AND active=1
                 AND lower(status) IN ('approved_unlinked','approved_linked')""",
            (str(modem_id),),
        ).fetchone()
    if not row:
        raise ValueError("Modem não encontrado, desativado ou ainda não aprovado")
    return _row(row)


def link_modem_to_generator(modem_id: str, generator_id: str, actor: str) -> None:
    generator = db.get_generator(generator_id)
    if not generator:
        raise ValueError("Gerador não encontrado para vínculo do modem")

    transport = str(generator.get("transport") or "")
    if transport == "reverse_tcp":
        port = int(generator.get("listen_port") or 0)
        try:
            modem = require_approved_modem(modem_id, port)
        except ValueError:
            modem = require_approved_inventory_modem(modem_id)
            metadata = dict(modem.get("metadata") or {})
            admission_port = int(metadata.get("admissionPort") or modem.get("listen_port") or 0)
            if admission_port != port:
                raise ValueError("Modem aprovado não pertence à porta reverse TCP do gerador")
    elif transport in {"modbus_tcp_direct", "rtu_over_tcp"}:
        modem = require_approved_inventory_modem(modem_id)
    else:
        raise ValueError("Este transporte não utiliza modem de campo")

    now = _now()
    with db.connect() as conn:
        conn.execute(
            "DELETE FROM field_device_links WHERE generator_id=? AND relation='transport'",
            (generator["id"],),
        )
        conn.execute(
            """INSERT INTO field_device_links(
                   field_device_id,generator_id,relation,created_at
               ) VALUES (?,?,'transport',?)""",
            (modem["id"], generator["id"], now),
        )

    metadata = dict(modem.get("metadata") or {})
    linked_ids = [
        str(item)
        for item in metadata.get("linkedGeneratorIds", [])
        if str(item).strip() and str(item) != generator["id"]
    ]
    linked_ids.append(generator["id"])
    update_field_device(
        modem["id"],
        {
            "status": "approved_linked",
            "metadata": {**metadata, "linkedGeneratorIds": linked_ids},
        },
        actor,
    )
    db.add_audit(
        actor,
        "link",
        "field_device",
        modem["id"],
        f"generator={generator['id']};relation=transport;transport={transport}",
    )


# ---------------------------- notifications -------------------------------

def enqueue_notification_in_connection(
    conn,
    event_type: str,
    channel: str,
    destination: str = "",
    subject: str = "",
    body: str = "",
    payload=None,
    max_attempts: int = 5,
):
    now = _now()
    cur = conn.execute(
        """INSERT INTO notification_queue(
               event_type,channel,destination,subject,body,payload_json,
               status,attempts,max_attempts,next_attempt_at,last_error,created_at,updated_at
           ) VALUES (?,?,?,?,?,?,'queued',0,?,?, '',?,?)""",
        (
            event_type,
            channel,
            destination,
            subject,
            body,
            json.dumps(payload or {}, ensure_ascii=False),
            max(1, min(int(max_attempts), 10)),
            now,
            now,
            now,
        ),
    )
    return cur.lastrowid


def enqueue_notification(
    event_type: str,
    channel: str,
    destination: str = "",
    subject: str = "",
    body: str = "",
    payload=None,
    max_attempts: int = 5,
):
    with db.connect() as conn:
        return enqueue_notification_in_connection(
            conn,
            event_type,
            channel,
            destination,
            subject,
            body,
            payload,
            max_attempts,
        )


_SENSITIVE_NOTIFICATION_TYPES = {"auth.password_reset"}


def _public_notification(row) -> dict:
    item = _row(row)
    item.pop("claim_token", None)
    if item.get("event_type") in _SENSITIVE_NOTIFICATION_TYPES:
        # Security delivery payloads may contain one-time credentials. They are
        # intentionally never exposed through operational notification APIs.
        item["destination"] = ""
        item["subject"] = "Recuperação de conta"
        item["body"] = "Mensagem de segurança protegida"
        item["payload"] = {}
    return item


def list_notifications(limit: int = 200):
    limit = max(1, min(int(limit), 2000))
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM notification_queue ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_public_notification(r) for r in rows]


def list_deliveries(limit: int = 200):
    limit = max(1, min(int(limit), 2000))
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM notification_deliveries ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def claim_due_notifications(limit: int = 20, lease_seconds: int = 120):
    now = _now()
    lease_seconds = max(30, min(int(lease_seconds), 3600))
    claimed = []
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        # At-least-once delivery: recover claims abandoned by a crashed worker.
        # Each lease gets a fresh token so a late worker cannot overwrite the
        # result of a newer retry after its original lease expired.
        conn.execute(
            """UPDATE notification_queue
               SET status='retry', claim_token='', next_attempt_at=?,
                   last_error='claim expirado; reentrega segura', updated_at=?
               WHERE status='sending' AND updated_at<=?""",
            (now, now, now - lease_seconds),
        )
        rows = conn.execute(
            "SELECT id FROM notification_queue "
            "WHERE status IN ('queued','retry') AND next_attempt_at<=? "
            "ORDER BY id LIMIT ?",
            (now, max(1, min(int(limit), 200))),
        ).fetchall()
        for row in rows:
            claim_token = secrets.token_hex(16)
            updated = conn.execute(
                """UPDATE notification_queue
                   SET status='sending',claim_token=?,updated_at=?
                   WHERE id=? AND status IN ('queued','retry') AND next_attempt_at<=?""",
                (claim_token, now, row["id"], now),
            )
            if updated.rowcount != 1:
                continue
            claimed_row = conn.execute(
                "SELECT * FROM notification_queue WHERE id=? AND claim_token=?",
                (row["id"], claim_token),
            ).fetchone()
            if claimed_row is not None:
                claimed.append(claimed_row)
    return [_row(row) for row in claimed]


def finish_notification(
    item_id: int,
    channel: str,
    destination: str,
    ok: bool,
    detail: str = "",
    claim_token: str = "",
) -> bool:
    now = _now()
    claim_token = str(claim_token or "")
    if not claim_token:
        return False

    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """SELECT attempts,max_attempts FROM notification_queue
               WHERE id=? AND status='sending' AND claim_token=?""",
            (item_id, claim_token),
        ).fetchone()
        if not row:
            # A lease can expire while a provider call is still in flight. A
            # late worker must never overwrite a newer retry/claim.
            return False

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

        updated = conn.execute(
            """UPDATE notification_queue
               SET status=?,attempts=?,next_attempt_at=?,claim_token='',
                   last_error=?,updated_at=?
               WHERE id=? AND status='sending' AND claim_token=?""",
            (status, attempts, next_at, error, now, item_id, claim_token),
        )
        if updated.rowcount != 1:
            return False
        conn.execute(
            """INSERT INTO notification_deliveries(
                   queue_id,channel,destination,status,detail,created_at
               ) VALUES (?,?,?,?,?,?)""",
            (
                item_id,
                channel,
                destination,
                "sent" if ok else "failed",
                detail[:2000],
                now,
            ),
        )
    return True


# ----------------------- lifecycle operation queue ------------------------

def _operation_public(row) -> dict | None:
    if row is None:
        return None
    item = _row(row)
    return {
        "operationId": item["id"],
        "generatorId": item["generator_id"],
        "kind": item["kind"],
        "status": item["status"],
        "result": item.get("result") or {},
        "error": item.get("error") or "",
        "createdAt": int(item["created_at"]),
        "updatedAt": int(item["updated_at"]),
    }


def enqueue_lifecycle_operation(
    operation_id: str,
    generator_id: str,
    kind: str,
    payload: dict,
    actor: str,
    actor_role: str,
) -> dict:
    operation_id = str(operation_id or "").strip()
    if not operation_id or len(operation_id) > 120:
        raise ValueError("operationId inválido")
    if kind not in {"provision", "deprovision", "reconfigure", "retire"}:
        raise ValueError("Operação de ciclo de vida inválida")
    now = _now()
    payload_json = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)
    with db.connect() as conn:
        # Serializa a checagem "uma operação ativa por gerador" com o INSERT.
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT * FROM lifecycle_operations WHERE id=?", (operation_id,)
        ).fetchone()
        if existing:
            if (
                existing["generator_id"] != generator_id
                or existing["kind"] != kind
                or existing["payload_json"] != payload_json
            ):
                raise ValueError("operationId já foi usado para outra solicitação")
            return _operation_public(existing)
        active = conn.execute(
            """SELECT * FROM lifecycle_operations
               WHERE generator_id=? AND status IN ('queued','running')
               ORDER BY created_at LIMIT 1""",
            (generator_id,),
        ).fetchone()
        if active:
            raise ValueError(
                f"Já existe operação {active['id']} em andamento para este gerador"
            )
        conn.execute(
            """INSERT INTO lifecycle_operations(
                   id,generator_id,kind,actor,actor_role,payload_json,status,result_json,error,created_at,updated_at
               ) VALUES (?,?,?,?,?,?,'queued','{}','',?,?)""",
            (operation_id, generator_id, kind, actor, actor_role, payload_json, now, now),
        )
        row = conn.execute("SELECT * FROM lifecycle_operations WHERE id=?", (operation_id,)).fetchone()
    return _operation_public(row)


def get_lifecycle_operation(operation_id: str, generator_id: str | None = None) -> dict | None:
    with db.connect() as conn:
        if generator_id:
            row = conn.execute(
                "SELECT * FROM lifecycle_operations WHERE id=? AND generator_id=?",
                (operation_id, generator_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM lifecycle_operations WHERE id=?", (operation_id,)
            ).fetchone()
    return _operation_public(row)


def claim_lifecycle_operation(lease_seconds: int = 900) -> dict | None:
    now = _now()
    lease_seconds = max(120, min(int(lease_seconds), 3600))
    with db.connect() as conn:
        # Um lifecycle industrial só pode ter um executor, mesmo com dois workers.
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            """UPDATE lifecycle_operations
               SET status='failed',
                   error='worker interrompido durante execução; estado industrial deve ser reconciliado antes de repetir',
                   updated_at=?
               WHERE status='running' AND updated_at<=?""",
            (now, now - lease_seconds),
        )
        row = conn.execute(
            "SELECT * FROM lifecycle_operations WHERE status='queued' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if not row:
            return None
        claimed_update = conn.execute(
            "UPDATE lifecycle_operations SET status='running',updated_at=? WHERE id=? AND status='queued'",
            (now, row["id"]),
        )
        if claimed_update.rowcount != 1:
            return None
        claimed = conn.execute(
            "SELECT * FROM lifecycle_operations WHERE id=?", (row["id"],)
        ).fetchone()
    item = _row(claimed)
    return {
        **_operation_public(claimed),
        "actor": item.get("actor") or "system",
        "actorRole": item.get("actor_role") or "",
        "payload": item.get("payload") or {},
    }


def finish_lifecycle_operation(operation_id: str, result: dict | None = None, error: str = "") -> bool:
    now = _now()
    status = "failed" if error else "succeeded"
    with db.connect() as conn:
        updated = conn.execute(
            """UPDATE lifecycle_operations
               SET status=?,result_json=?,error=?,updated_at=?
               WHERE id=? AND status='running'""",
            (
                status,
                json.dumps(result or {}, ensure_ascii=False),
                str(error or "")[:2000],
                now,
                operation_id,
            ),
        )
        return updated.rowcount == 1


# ------------------------------- scheduler --------------------------------

def _public_scheduler_job(row) -> dict:
    item = _row(row)
    item.pop("claim_token", None)
    return item


def list_scheduler_jobs():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM scheduler_jobs ORDER BY name").fetchall()
    return [_public_scheduler_job(r) for r in rows]


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
        rows = conn.execute(
            "SELECT * FROM scheduler_jobs WHERE enabled=1 AND next_run<=? ORDER BY next_run LIMIT ?",
            (now, limit),
        ).fetchall()
    return [_public_scheduler_job(r) for r in rows]


def claim_scheduler_jobs(
    allowed_kinds: set[str],
    limit: int = 20,
    lease_seconds: int = 1800,
):
    kinds = sorted({str(kind).strip() for kind in allowed_kinds if str(kind).strip()})
    if not kinds:
        return []
    now = _now()
    lease_seconds = max(60, min(int(lease_seconds), 21600))
    placeholders = ",".join("?" for _ in kinds)
    claimed = []
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            f"SELECT id FROM scheduler_jobs "
            f"WHERE enabled=1 AND next_run<=? AND kind IN ({placeholders}) "
            "ORDER BY next_run LIMIT ?",
            (now, *kinds, max(1, min(int(limit), 200))),
        ).fetchall()
        for row in rows:
            claim_token = secrets.token_hex(16)
            updated = conn.execute(
                """UPDATE scheduler_jobs
                   SET next_run=?,last_result='RUNNING',claim_token=?,updated_at=?
                   WHERE id=? AND enabled=1 AND next_run<=?""",
                (now + lease_seconds, claim_token, now, row["id"], now),
            )
            if updated.rowcount != 1:
                continue
            claimed_row = conn.execute(
                "SELECT * FROM scheduler_jobs WHERE id=? AND claim_token=?",
                (row["id"], claim_token),
            ).fetchone()
            if claimed_row is not None:
                claimed.append(claimed_row)
    return [_row(row) for row in claimed]


def complete_scheduler_job(item_id: str, result: str, claim_token: str = "") -> bool:
    now = _now()
    claim_token = str(claim_token or "")
    if not claim_token:
        return False
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """SELECT interval_seconds FROM scheduler_jobs
               WHERE id=? AND last_result='RUNNING' AND claim_token=?""",
            (item_id, claim_token),
        ).fetchone()
        if not row:
            return False
        updated = conn.execute(
            """UPDATE scheduler_jobs
               SET last_run=?,last_result=?,next_run=?,claim_token='',updated_at=?
               WHERE id=? AND last_result='RUNNING' AND claim_token=?""",
            (
                now,
                result[:1000],
                now + int(row["interval_seconds"]),
                now,
                item_id,
                claim_token,
            ),
        )
        return updated.rowcount == 1


# ------------------------------- security ---------------------------------

def login_key(email: str, remote_ip: str) -> str:
    return hashlib.sha256(f"{email.strip().lower()}|{remote_ip}".encode()).hexdigest()


def login_allowed(key: str, max_failures: int = 5, window_seconds: int = 900, lock_seconds: int = 900):
    now = _now()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM login_attempts WHERE attempt_key=?", (key,)).fetchone()
        if row and int(row["locked_until"]) > now:
            return False, int(row["locked_until"]) - now
        if row and now - int(row["window_started"]) > window_seconds:
            conn.execute("DELETE FROM login_attempts WHERE attempt_key=?", (key,))
    return True, 0


def record_login_failure(key: str, max_failures: int = 5, lock_seconds: int = 900):
    now = _now()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
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


def password_reset_allowed(
    email: str,
    remote_ip: str,
    *,
    max_per_window: int = 3,
    account_max_per_window: int = 5,
    window_seconds: int = 900,
    cooldown_seconds: int = 60,
) -> bool:
    """Rate-limit reset by both account and origin without revealing account state."""
    now = _now()
    normalized = str(email or "").strip().lower()
    keys = [
        ("pair:" + hashlib.sha256(f"{normalized}|{remote_ip}".encode()).hexdigest(), max_per_window),
        ("acct:" + hashlib.sha256(normalized.encode()).hexdigest(), account_max_per_window),
    ]
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        decisions = []
        for key, limit in keys:
            row = conn.execute(
                "SELECT * FROM password_reset_requests WHERE request_key=?", (key,)
            ).fetchone()
            if not row or now - int(row["window_started"]) >= window_seconds:
                conn.execute(
                    """INSERT INTO password_reset_requests(request_key,window_started,requests,last_request)
                       VALUES (?,?,1,?)
                       ON CONFLICT(request_key) DO UPDATE SET window_started=excluded.window_started,requests=1,last_request=excluded.last_request""",
                    (key, now, now),
                )
                decisions.append(True)
                continue
            allowed = (
                int(row["requests"]) < int(limit)
                and now - int(row["last_request"]) >= cooldown_seconds
            )
            conn.execute(
                "UPDATE password_reset_requests SET requests=requests+1,last_request=? WHERE request_key=?",
                (now, key),
            )
            decisions.append(allowed)
    return all(decisions)


def create_password_reset(user_id: str, ttl: int = 1800):
    token = secrets.token_urlsafe(40)
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        conn.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (user_id,))
        conn.execute("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,used_at,created_at) VALUES (?,?,?,NULL,?)", (digest, user_id, now + ttl, now))
    return token


def consume_password_reset(token: str):
    """Compatibilidade: consome um token de forma atômica, sem alterar a senha."""
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT user_id FROM password_reset_tokens "
            "WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
            (digest, now),
        ).fetchone()
        if not row:
            return None
        updated = conn.execute(
            "UPDATE password_reset_tokens SET used_at=? "
            "WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
            (now, digest, now),
        )
        if updated.rowcount != 1:
            return None
        return row["user_id"]


def complete_password_reset(token: str, password_hash: str):
    """Troca senha, revoga sessões e consome o token em uma única transação."""
    digest = hashlib.sha256(token.encode()).hexdigest()
    now = _now()
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """SELECT t.user_id,u.email
               FROM password_reset_tokens t
               JOIN users u ON u.id=t.user_id
               WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>?""",
            (digest, now),
        ).fetchone()
        if not row:
            return None

        updated = conn.execute(
            """UPDATE password_reset_tokens
               SET used_at=?
               WHERE token_hash=? AND used_at IS NULL AND expires_at>?""",
            (now, digest, now),
        )
        if updated.rowcount != 1:
            return None

        user_id = str(row["user_id"])
        changed = conn.execute(
            "UPDATE users SET password_hash=?,updated_at=? WHERE id=?",
            (password_hash, now, user_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("Usuário do token de reset não existe")

        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        conn.execute(
            "INSERT INTO audit_log(created_at,actor,action,entity_type,entity_id,detail) "
            "VALUES (?,?,?,?,?,?)",
            (now, str(row["email"] or user_id), "password_reset", "user", user_id, "sessões revogadas"),
        )
        return {"id": user_id, "email": str(row["email"] or "")}


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


def create_api_token(
    name: str,
    scopes: list[str],
    rate_limit: int = 120,
    expires_at: int | None = None,
    allowed_generators: list[str] | None = None,
    allowed_cidrs: list[str] | None = None,
):
    raw = "rcg_" + secrets.token_urlsafe(40)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    now = _now()
    item_id = _id("tok")
    clean_scopes = sorted({str(s).strip() for s in scopes if str(s).strip()})
    clean_generators = sorted(
        {str(item).strip() for item in (allowed_generators or []) if str(item).strip()}
    )
    clean_cidrs = sorted({str(item).strip() for item in (allowed_cidrs or []) if str(item).strip()})
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO api_tokens(
                   id,name,token_hash,token_prefix,scopes,allowed_generators,allowed_cidrs,
                   rate_limit,active,expires_at,last_used,created_at
               ) VALUES (?,?,?,?,?,?,?,?,1,?,NULL,?)""",
            (
                item_id,
                name.strip(),
                digest,
                raw[:12],
                " ".join(clean_scopes),
                "\n".join(clean_generators),
                "\n".join(clean_cidrs),
                max(10, min(int(rate_limit), 5000)),
                expires_at,
                now,
            ),
        )
    return raw, get_api_token(item_id)


def get_api_token(item_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM api_tokens WHERE id=?", (item_id,)).fetchone()
    item = _row(row)
    if item:
        item.pop("token_hash", None)
        item["scopes"] = str(item.get("scopes") or "").split()
        item["allowed_generators"] = [x for x in str(item.get("allowed_generators") or "").splitlines() if x]
        item["allowed_cidrs"] = [x for x in str(item.get("allowed_cidrs") or "").splitlines() if x]
    return item


def list_api_tokens():
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM api_tokens ORDER BY created_at DESC").fetchall()
    result = []
    for row in rows:
        item = _row(row)
        item.pop("token_hash", None)
        item["scopes"] = str(item.get("scopes") or "").split()
        item["allowed_generators"] = [x for x in str(item.get("allowed_generators") or "").splitlines() if x]
        item["allowed_cidrs"] = [x for x in str(item.get("allowed_cidrs") or "").splitlines() if x]
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
        item["allowed_generators"] = [x for x in str(item.get("allowed_generators") or "").splitlines() if x]
        item["allowed_cidrs"] = [x for x in str(item.get("allowed_cidrs") or "").splitlines() if x]
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
