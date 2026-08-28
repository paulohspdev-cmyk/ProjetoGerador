import json
import time

from . import db, ops_store, platform_store
from .notifications import enqueue_event
from .rapid import overlay_generators

ALLOWED_ACTIONS = {"notify", "work_order"}
ALLOWED_TRIGGERS = {"generator_offline", "generator_online", "generator_alert"}


def _init_state():
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS automation_state(
                rule_id TEXT PRIMARY KEY,
                last_value TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            )"""
        )


def _parse(text: str) -> dict:
    text = str(text or "").strip()
    if not text:
        return {}
    if text.startswith("{"):
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    # Mini sintaxe legível: generator_offline:GEN001 / notify:webhook
    parts = text.split(":", 2)
    if len(parts) >= 2:
        return {"type": parts[0].strip(), "value": parts[1].strip(), "extra": parts[2].strip() if len(parts) > 2 else ""}
    return {"type": text}


def validate_rule(trigger_text: str, action_text: str):
    trigger = _parse(trigger_text)
    action = _parse(action_text)
    if trigger.get("type") not in ALLOWED_TRIGGERS:
        raise ValueError(f"Gatilho não permitido. Use: {', '.join(sorted(ALLOWED_TRIGGERS))}")
    if action.get("type") not in ALLOWED_ACTIONS:
        raise ValueError("Ação não permitida. Automação industrial START/STOP/MCB/GCB não é aceita neste motor.")
    return trigger, action


def approve_rule(rule_id: str, actor: str):
    rule = next((r for r in ops_store.list_rules() if r["id"] == rule_id), None)
    if not rule:
        return None
    validate_rule(rule.get("trigger_text") or "", rule.get("action_text") or "")
    with db.connect() as conn:
        conn.execute("UPDATE automation_rules SET safety_state='approved_nonindustrial',enabled=0,updated_at=? WHERE id=?", (int(time.time()), rule_id))
    db.add_audit(actor, "approve", "automation_rule", rule_id, "approved_nonindustrial")
    return next((r for r in ops_store.list_rules() if r["id"] == rule_id), None)


def set_rule_enabled(rule_id: str, enabled: bool, actor: str):
    rule = next((r for r in ops_store.list_rules() if r["id"] == rule_id), None)
    if not rule:
        return None
    if enabled:
        if rule.get("safety_state") != "approved_nonindustrial":
            raise ValueError("Regra precisa ser aprovada antes de ser ativada")
        validate_rule(rule.get("trigger_text") or "", rule.get("action_text") or "")
    with db.connect() as conn:
        conn.execute("UPDATE automation_rules SET enabled=?,updated_at=? WHERE id=?", (1 if enabled else 0, int(time.time()), rule_id))
    db.add_audit(actor, "enable" if enabled else "disable", "automation_rule", rule_id, "")
    return next((r for r in ops_store.list_rules() if r["id"] == rule_id), None)


def _condition(trigger: dict, generators: list[dict]):
    tag = str(trigger.get("tag") or trigger.get("value") or "").strip().lower()
    generator = next((g for g in generators if g.get("tag", "").lower() == tag or g.get("id", "").lower() == tag), None)
    if not generator:
        return False, None
    trigger_type = trigger.get("type")
    if trigger_type == "generator_offline":
        return generator.get("status") == "offline", generator
    if trigger_type == "generator_online":
        return generator.get("status") == "online", generator
    if trigger_type == "generator_alert":
        return generator.get("status") == "alerta", generator
    return False, generator


def _execute(action: dict, rule: dict, generator: dict | None):
    action_type = action.get("type")
    if action_type == "notify":
        channel = str(action.get("channel") or action.get("value") or "panel")
        destination = str(action.get("destination") or action.get("extra") or "")
        subject = f"RC Geradores — {rule.get('name')}"
        body = f"Regra acionada: {rule.get('name')}" + (f" · {generator.get('tag')}" if generator else "")
        platform_store.enqueue_notification("automation.rule", channel, destination=destination, subject=subject, body=body, payload={"ruleId": rule["id"], "generator": generator or {}})
        return f"notify:{channel}"
    if action_type == "work_order":
        if not generator:
            raise ValueError("Ação de OS exige gerador")
        work_type = str(action.get("workType") or action.get("value") or "Inspeção")
        item = ops_store.create_work_order({"generator_id": generator["id"], "type": work_type, "description": f"Criada automaticamente pela regra {rule.get('name')}"}, "automation")
        return f"work_order:{item['id']}"
    raise ValueError("Ação não suportada")


def process_rules():
    _init_state()
    rules = [r for r in ops_store.list_rules() if r.get("enabled") and r.get("safety_state") == "approved_nonindustrial"]
    if not rules:
        return 0
    generators = overlay_generators(db.list_generators())
    processed = 0
    now = int(time.time())
    for rule in rules:
        try:
            trigger, action = validate_rule(rule.get("trigger_text") or "", rule.get("action_text") or "")
            active, generator = _condition(trigger, generators)
            current = "1" if active else "0"
            with db.connect() as conn:
                row = conn.execute("SELECT last_value FROM automation_state WHERE rule_id=?", (rule["id"],)).fetchone()
                previous = row["last_value"] if row else ""
                conn.execute(
                    "INSERT INTO automation_state(rule_id,last_value,updated_at) VALUES (?,?,?) ON CONFLICT(rule_id) DO UPDATE SET last_value=excluded.last_value,updated_at=excluded.updated_at",
                    (rule["id"], current, now),
                )
            if active and previous != "1":
                detail = _execute(action, rule, generator)
                with db.connect() as conn:
                    conn.execute("INSERT INTO automation_runs(rule_id,result,detail,created_at) VALUES (?,?,?,?)", (rule["id"], "OK", detail, now))
                processed += 1
        except Exception as exc:
            with db.connect() as conn:
                conn.execute("INSERT INTO automation_runs(rule_id,result,detail,created_at) VALUES (?,?,?,?)", (rule["id"], "ERROR", str(exc)[:1000], now))
    return processed
