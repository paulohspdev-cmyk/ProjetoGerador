from __future__ import annotations

import json
import time
import uuid
from typing import Any

from . import db, platform_store


def _now() -> int:
    return int(time.time())


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"))


def _from_json(value: str | None) -> dict:
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _row(row):
    if row is None:
        return None
    item = dict(row)
    for key in ("active", "enabled"):
        if key in item:
            item[key] = bool(item[key])
    if "metadata_json" in item:
        item["metadata"] = _from_json(item.pop("metadata_json", None))
    return item


def init_industrial_db() -> None:
    with db.connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS industrial_alarms(
                alarm_key TEXT PRIMARY KEY,
                generator_id TEXT,
                asset_id TEXT,
                source TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                cleared_at INTEGER,
                acked_by TEXT,
                acked_at INTEGER,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_industrial_alarm_active ON industrial_alarms(active,severity,last_seen);
            CREATE INDEX IF NOT EXISTS idx_industrial_alarm_generator ON industrial_alarms(generator_id,active);

            CREATE TABLE IF NOT EXISTS process_events(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                generator_id TEXT,
                asset_id TEXT,
                source TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                code TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                value_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_process_events_time ON process_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_process_events_generator ON process_events(generator_id,created_at DESC);

            CREATE TABLE IF NOT EXISTS maintenance_plans(
                id TEXT PRIMARY KEY,
                generator_id TEXT,
                asset_id TEXT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'preventiva',
                interval_hours REAL,
                interval_days INTEGER,
                warning_hours REAL NOT NULL DEFAULT 25,
                warning_days INTEGER NOT NULL DEFAULT 7,
                last_service_hours REAL,
                last_service_at INTEGER,
                notes TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_maintenance_generator ON maintenance_plans(generator_id,enabled);

            CREATE TABLE IF NOT EXISTS maintenance_history(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT NOT NULL,
                generator_id TEXT,
                asset_id TEXT,
                serviced_hours REAL,
                serviced_at INTEGER NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                actor TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_maintenance_history_plan ON maintenance_history(plan_id,serviced_at DESC);

            CREATE TABLE IF NOT EXISTS escalation_policies(
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'alarm',
                after_seconds INTEGER NOT NULL DEFAULT 300,
                channel TEXT NOT NULL DEFAULT 'panel',
                destination TEXT NOT NULL DEFAULT '',
                repeat_seconds INTEGER NOT NULL DEFAULT 0,
                max_repeats INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS escalation_runs(
                policy_id TEXT NOT NULL,
                alarm_key TEXT NOT NULL,
                sends INTEGER NOT NULL DEFAULT 0,
                last_sent INTEGER,
                PRIMARY KEY(policy_id,alarm_key),
                FOREIGN KEY(policy_id) REFERENCES escalation_policies(id) ON DELETE CASCADE
            );
            """
        )


def _insert_event(conn, generator_id: str | None, asset_id: str | None, source: str, event_type: str,
                  severity: str, code: str, message: str, value: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO process_events(created_at,generator_id,asset_id,source,event_type,severity,code,message,value_json) VALUES (?,?,?,?,?,?,?,?,?)",
        (_now(), generator_id, asset_id, source, event_type, severity, code, message, _json(value)),
    )


def _event(generator_id: str | None, asset_id: str | None, source: str, event_type: str,
           severity: str, code: str, message: str, value: dict | None = None) -> None:
    with db.connect() as conn:
        _insert_event(conn, generator_id, asset_id, source, event_type, severity, code, message, value)


def _desired_alarm(key: str, generator: dict, source: str, code: str, severity: str,
                   message: str, metadata: dict | None = None) -> tuple[str, dict]:
    return key, {
        "generator_id": generator.get("id"),
        "asset_id": f"asset-{generator.get('id')}" if generator.get("id") else None,
        "source": source,
        "code": code,
        "severity": severity,
        "message": message,
        "metadata": metadata or {},
    }


def refresh_observed_alarms(generators: list[dict]) -> int:
    """Persiste somente condições que a API/Rapid consegue comprovar.

    Alarmes nativos detalhados entram pela mesma estrutura somente quando um
    Controller Pack homologar seus códigos ou bitfields.
    """
    init_industrial_db()
    desired: dict[str, dict] = {}
    for generator in generators:
        gid = str(generator.get("id") or "")
        if not gid:
            continue
        status = str(generator.get("status") or "")
        if status == "offline":
            key, item = _desired_alarm(
                f"comm:{gid}", generator, "derived.communication", "COMM_LOSS", "fault",
                str(generator.get("lastError") or "Comunicação/telemetria indisponível"),
            )
            desired[key] = item
        elif status == "alerta":
            key, item = _desired_alarm(
                f"status:{gid}", generator, "derived.controller_status", "CONTROLLER_ALERT", "alarm",
                str(generator.get("lastError") or "Controlador reporta estado de alerta; causa nativa ainda não homologada"),
            )
            desired[key] = item

        available = set(generator.get("availableMetrics") or [])
        if "alarm_count" in available:
            count = int(generator.get("alarms") or 0)
            if count > 0:
                key, item = _desired_alarm(
                    f"alarm-count:{gid}", generator, "rapid.metric", "ALARM_COUNT", "alarm",
                    f"Controladora reporta {count} alarme(s) ativo(s); códigos individuais não disponíveis no pack atual",
                    {"count": count, "metric": "alarm_count"},
                )
                desired[key] = item

    now = _now()
    changed = 0
    # Alarme e seu evento de transição são gravados na MESMA transação. Isto
    # evita uma segunda conexão escritora concorrendo com o SQLite bloqueado.
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM industrial_alarms WHERE source LIKE 'derived.%' OR source='rapid.metric'"
        ).fetchall()
        existing = {row["alarm_key"]: dict(row) for row in rows}

        for key, item in desired.items():
            previous = existing.get(key)
            if previous is None:
                conn.execute(
                    """INSERT INTO industrial_alarms(alarm_key,generator_id,asset_id,source,code,severity,message,active,first_seen,last_seen,metadata_json)
                       VALUES (?,?,?,?,?,?,?,1,?,?,?)""",
                    (key, item["generator_id"], item["asset_id"], item["source"], item["code"], item["severity"], item["message"], now, now, _json(item["metadata"])),
                )
                _insert_event(conn, item["generator_id"], item["asset_id"], item["source"], "alarm_raised",
                              item["severity"], item["code"], item["message"], item["metadata"])
                changed += 1
            elif not bool(previous["active"]):
                conn.execute(
                    "UPDATE industrial_alarms SET active=1,first_seen=?,last_seen=?,cleared_at=NULL,acked_by=NULL,acked_at=NULL,message=?,severity=?,metadata_json=? WHERE alarm_key=?",
                    (now, now, item["message"], item["severity"], _json(item["metadata"]), key),
                )
                _insert_event(conn, item["generator_id"], item["asset_id"], item["source"], "alarm_raised",
                              item["severity"], item["code"], item["message"], item["metadata"])
                changed += 1
            else:
                conn.execute(
                    "UPDATE industrial_alarms SET last_seen=?,message=?,severity=?,metadata_json=? WHERE alarm_key=?",
                    (now, item["message"], item["severity"], _json(item["metadata"]), key),
                )

        for key, previous in existing.items():
            if key in desired or not bool(previous["active"]):
                continue
            conn.execute("UPDATE industrial_alarms SET active=0,cleared_at=?,last_seen=? WHERE alarm_key=?", (now, now, key))
            _insert_event(conn, previous.get("generator_id"), previous.get("asset_id"), previous["source"],
                          "alarm_cleared", "info", previous.get("code") or "", previous.get("message") or key)
            changed += 1
    return changed


def list_alarms(active_only: bool = False) -> list[dict]:
    init_industrial_db()
    with db.connect() as conn:
        if active_only:
            rows = conn.execute(
                "SELECT * FROM industrial_alarms WHERE active=1 ORDER BY CASE severity WHEN 'fault' THEN 0 WHEN 'alarm' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, first_seen"
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM industrial_alarms ORDER BY active DESC,last_seen DESC LIMIT 2000").fetchall()
    return [_row(row) for row in rows]


def acknowledge_alarm(alarm_key: str, actor: str) -> dict | None:
    init_industrial_db()
    now = _now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM industrial_alarms WHERE alarm_key=?", (alarm_key,)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE industrial_alarms SET acked_by=?,acked_at=? WHERE alarm_key=?", (actor, now, alarm_key))
        _insert_event(conn, row["generator_id"], row["asset_id"], "operator", "alarm_ack", "info",
                      row["code"] or "", f"Alarme reconhecido por {actor}", {"alarm_key": alarm_key})
    return next((x for x in list_alarms(False) if x["alarm_key"] == alarm_key), None)


def list_process_events(limit: int = 500, generator_id: str | None = None,
                        severity: str | None = None) -> list[dict]:
    init_industrial_db()
    limit = max(1, min(int(limit), 5000))
    clauses: list[str] = []
    values: list[Any] = []
    if generator_id:
        clauses.append("generator_id=?")
        values.append(generator_id)
    if severity:
        clauses.append("severity=?")
        values.append(severity)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    values.append(limit)
    with db.connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM process_events{where} ORDER BY created_at DESC,id DESC LIMIT ?", values
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["value"] = _from_json(item.pop("value_json", None))
        result.append(item)
    return result


def create_maintenance_plan(data: dict, actor: str) -> dict:
    init_industrial_db()
    generator_id = str(data.get("generator_id") or "").strip() or None
    asset_id = str(data.get("asset_id") or "").strip() or None
    if not generator_id and not asset_id:
        raise ValueError("Plano deve estar vinculado a um gerador ou asset")
    if generator_id and not db.get_generator(generator_id):
        raise ValueError("Gerador não encontrado")
    interval_hours = data.get("interval_hours")
    interval_days = data.get("interval_days")
    if interval_hours is None and interval_days is None:
        raise ValueError("Informe intervalo em horas e/ou dias")
    if interval_hours is not None and float(interval_hours) <= 0:
        raise ValueError("Intervalo de horas deve ser maior que zero")
    if interval_days is not None and int(interval_days) <= 0:
        raise ValueError("Intervalo de dias deve ser maior que zero")
    now = _now()
    item_id = _id("maint")
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO maintenance_plans(id,generator_id,asset_id,name,kind,interval_hours,interval_days,warning_hours,warning_days,last_service_hours,last_service_at,notes,enabled,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)""",
            (
                item_id, generator_id, asset_id, str(data.get("name") or "Preventiva").strip(),
                str(data.get("kind") or "preventiva").strip().lower(),
                float(interval_hours) if interval_hours is not None else None,
                int(interval_days) if interval_days is not None else None,
                float(data.get("warning_hours") or 25), int(data.get("warning_days") or 7),
                float(data["last_service_hours"]) if data.get("last_service_hours") is not None else None,
                int(data["last_service_at"]) if data.get("last_service_at") else None,
                str(data.get("notes") or "").strip(), now, now,
            ),
        )
    db.add_audit(actor, "create", "maintenance_plan", item_id, str(data.get("name") or "Preventiva"))
    return get_maintenance_plan(item_id)


def get_maintenance_plan(item_id: str) -> dict | None:
    init_industrial_db()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM maintenance_plans WHERE id=?", (item_id,)).fetchone()
    return _row(row)


def list_maintenance_plans() -> list[dict]:
    init_industrial_db()
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM maintenance_plans ORDER BY enabled DESC,name COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def update_maintenance_plan(item_id: str, patch: dict, actor: str) -> dict | None:
    current = get_maintenance_plan(item_id)
    if not current:
        return None
    allowed = {"name", "kind", "interval_hours", "interval_days", "warning_hours", "warning_days", "notes", "enabled"}
    fields: list[str] = []
    values: list[Any] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key == "enabled":
            value = 1 if bool(value) else 0
        fields.append(f"{key}=?")
        values.append(value)
    if not fields:
        return current
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        conn.execute(f"UPDATE maintenance_plans SET {', '.join(fields)} WHERE id=?", values)
    db.add_audit(actor, "update", "maintenance_plan", item_id, ",".join(patch.keys()))
    return get_maintenance_plan(item_id)


def complete_maintenance(item_id: str, actor: str, serviced_hours: float | None = None,
                         notes: str = "") -> dict | None:
    current = get_maintenance_plan(item_id)
    if not current:
        return None
    now = _now()
    with db.connect() as conn:
        conn.execute(
            "UPDATE maintenance_plans SET last_service_hours=?,last_service_at=?,updated_at=? WHERE id=?",
            (serviced_hours, now, now, item_id),
        )
        conn.execute(
            "INSERT INTO maintenance_history(plan_id,generator_id,asset_id,serviced_hours,serviced_at,notes,actor) VALUES (?,?,?,?,?,?,?)",
            (item_id, current.get("generator_id"), current.get("asset_id"), serviced_hours, now, notes[:2000], actor),
        )
        _insert_event(conn, current.get("generator_id"), current.get("asset_id"), "maintenance",
                      "maintenance_completed", "info", "MAINT_DONE",
                      current.get("name") or "Manutenção concluída", {"hours": serviced_hours})
    db.add_audit(actor, "complete", "maintenance_plan", item_id,
                 f"hours={serviced_hours if serviced_hours is not None else 'N/D'}")
    return get_maintenance_plan(item_id)


def list_maintenance_history(plan_id: str | None = None, limit: int = 500) -> list[dict]:
    init_industrial_db()
    limit = max(1, min(int(limit), 2000))
    with db.connect() as conn:
        if plan_id:
            rows = conn.execute(
                "SELECT * FROM maintenance_history WHERE plan_id=? ORDER BY serviced_at DESC LIMIT ?",
                (plan_id, limit),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM maintenance_history ORDER BY serviced_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def maintenance_status(generators: list[dict]) -> list[dict]:
    by_id = {str(g.get("id")): g for g in generators}
    now = _now()
    result = []
    for plan in list_maintenance_plans():
        generator = by_id.get(str(plan.get("generator_id") or ""))
        hours_known = bool(generator and "run_hours" in set(generator.get("availableMetrics") or []))
        current_hours = float(generator.get("runHours") or 0) if hours_known else None
        hour_remaining = None
        day_remaining = None
        states: list[str] = []
        if plan.get("interval_hours") is not None:
            if current_hours is None or plan.get("last_service_hours") is None:
                states.append("unknown")
            else:
                hour_remaining = float(plan["last_service_hours"]) + float(plan["interval_hours"]) - current_hours
                states.append("due" if hour_remaining <= 0 else "warning" if hour_remaining <= float(plan.get("warning_hours") or 0) else "ok")
        if plan.get("interval_days") is not None:
            base = int(plan.get("last_service_at") or plan.get("created_at") or now)
            day_remaining = (base + int(plan["interval_days"]) * 86400 - now) / 86400
            states.append("due" if day_remaining <= 0 else "warning" if day_remaining <= int(plan.get("warning_days") or 0) else "ok")
        state = "due" if "due" in states else "warning" if "warning" in states else "unknown" if states and all(x == "unknown" for x in states) else "ok"
        result.append({
            **plan,
            "current_hours": current_hours,
            "hour_remaining": hour_remaining,
            "day_remaining": day_remaining,
            "state": state,
            "generator_tag": generator.get("tag") if generator else None,
        })
    return result


def create_escalation_policy(data: dict, actor: str) -> dict:
    init_industrial_db()
    severity = str(data.get("severity") or "alarm").lower()
    if severity not in {"warning", "alarm", "fault", "any"}:
        raise ValueError("Severidade inválida")
    channel = str(data.get("channel") or "panel").lower()
    if channel not in {"panel", "email", "whatsapp", "webhook"}:
        raise ValueError("Canal inválido")
    after = max(0, int(data.get("after_seconds") or 0))
    repeat = max(0, int(data.get("repeat_seconds") or 0))
    max_repeats = max(1, min(int(data.get("max_repeats") or 1), 100))
    item_id = _id("esc")
    now = _now()
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO escalation_policies(id,name,severity,after_seconds,channel,destination,repeat_seconds,max_repeats,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)",
            (item_id, str(data.get("name") or "Escalonamento").strip(), severity, after, channel,
             str(data.get("destination") or "").strip(), repeat, max_repeats, now, now),
        )
    db.add_audit(actor, "create", "escalation_policy", item_id, channel)
    return next(x for x in list_escalation_policies() if x["id"] == item_id)


def list_escalation_policies() -> list[dict]:
    init_industrial_db()
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM escalation_policies ORDER BY enabled DESC,name COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def update_escalation_policy(item_id: str, patch: dict, actor: str) -> dict | None:
    allowed = {"name", "severity", "after_seconds", "channel", "destination", "repeat_seconds", "max_repeats", "enabled"}
    if patch.get("severity") is not None and str(patch["severity"]).lower() not in {"warning", "alarm", "fault", "any"}:
        raise ValueError("Severidade inválida")
    if patch.get("channel") is not None and str(patch["channel"]).lower() not in {"panel", "email", "whatsapp", "webhook"}:
        raise ValueError("Canal inválido")
    fields: list[str] = []
    values: list[Any] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key == "enabled":
            value = 1 if bool(value) else 0
        fields.append(f"{key}=?")
        values.append(value)
    if not fields:
        return next((x for x in list_escalation_policies() if x["id"] == item_id), None)
    fields.append("updated_at=?")
    values.extend([_now(), item_id])
    with db.connect() as conn:
        cur = conn.execute(f"UPDATE escalation_policies SET {', '.join(fields)} WHERE id=?", values)
    if not cur.rowcount:
        return None
    db.add_audit(actor, "update", "escalation_policy", item_id, ",".join(patch.keys()))
    return next((x for x in list_escalation_policies() if x["id"] == item_id), None)


def delete_escalation_policy(item_id: str, actor: str) -> bool:
    init_industrial_db()
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM escalation_policies WHERE id=?", (item_id,))
    if cur.rowcount:
        db.add_audit(actor, "delete", "escalation_policy", item_id, "")
        return True
    return False


def process_escalations(generators: list[dict]) -> int:
    init_industrial_db()
    refresh_observed_alarms(generators)
    alarms = [item for item in list_alarms(True) if not item.get("acked_at")]
    policies = [item for item in list_escalation_policies() if item.get("enabled")]
    now = _now()
    queued = 0

    for alarm in alarms:
        age = now - int(alarm.get("first_seen") or now)
        for policy in policies:
            if policy["severity"] != "any" and policy["severity"] != alarm["severity"]:
                continue
            if age < int(policy.get("after_seconds") or 0):
                continue
            with db.connect() as conn:
                run = conn.execute(
                    "SELECT sends,last_sent FROM escalation_runs WHERE policy_id=? AND alarm_key=?",
                    (policy["id"], alarm["alarm_key"]),
                ).fetchone()
            sends = int(run["sends"]) if run else 0
            last_sent = int(run["last_sent"] or 0) if run else 0
            if sends >= int(policy.get("max_repeats") or 1):
                continue
            repeat = int(policy.get("repeat_seconds") or 0)
            if sends > 0 and (repeat <= 0 or now - last_sent < repeat):
                continue

            platform_store.enqueue_notification(
                "industrial.alarm.escalation",
                policy["channel"],
                destination=policy.get("destination") or "",
                subject=f"[{alarm['severity'].upper()}] RC Geradores",
                body=alarm.get("message") or alarm["alarm_key"],
                payload={
                    "alarmKey": alarm["alarm_key"],
                    "generatorId": alarm.get("generator_id"),
                    "severity": alarm["severity"],
                    "policyId": policy["id"],
                },
            )
            with db.connect() as conn:
                conn.execute(
                    """INSERT INTO escalation_runs(policy_id,alarm_key,sends,last_sent) VALUES (?,?,1,?)
                       ON CONFLICT(policy_id,alarm_key) DO UPDATE SET sends=escalation_runs.sends+1,last_sent=excluded.last_sent""",
                    (policy["id"], alarm["alarm_key"], now),
                )
            queued += 1
    return queued
