import signal
import time

from . import db, industrial_store, ops_store, platform_store, traffic_store
from .automation_engine import process_rules
from .backup_manager import create_full_backup
from .config import BRIDGE_STATUS_FILE
from .notifications import process_due_notifications
from .rapid import overlay_generators
from .reporting import generate_report

running = True


def stop(*_args):
    global running
    running = False


def _run_job(job: dict):
    kind = str(job.get("kind") or "")
    payload = job.get("payload") or {}
    if kind == "backup":
        result = create_full_backup("scheduler")
        return result.get("result") or "OK"
    if kind == "report":
        report = ops_store.create_report(
            {
                "name": payload.get("name") or job.get("name") or "Relatório agendado",
                "period": payload.get("period") or "Agendado",
                "format": payload.get("format") or "PDF",
            },
            "scheduler",
        )
        artifact = generate_report(report, overlay_generators(db.list_generators()))
        return f"OK {artifact['filename']}"
    if kind == "notification":
        platform_store.enqueue_notification(
            payload.get("event_type") or "scheduler",
            payload.get("channel") or "panel",
            destination=payload.get("destination") or "",
            subject=payload.get("subject") or job.get("name") or "RC Geradores",
            body=payload.get("body") or "Agendamento executado",
            payload=payload,
        )
        return "OK enfileirado"
    return "IGNORADO tipo não permitido"


def process_scheduler():
    count = 0
    for job in platform_store.due_scheduler_jobs():
        try:
            result = _run_job(job)
        except Exception as exc:
            result = f"ERROR {exc}"
        platform_store.complete_scheduler_job(job["id"], result)
        count += 1
    return count


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    industrial_store.init_industrial_db()
    traffic_store.init_traffic_db()
    print("[worker] RC Geradores iniciado", flush=True)
    last_automation = 0.0
    last_industrial = 0.0
    last_traffic = 0.0
    while running:
        try:
            process_due_notifications()
            process_scheduler()
            now = time.monotonic()
            if now - last_traffic >= 30:
                traffic_store.sample_status_file(BRIDGE_STATUS_FILE)
                last_traffic = now
            if now - last_industrial >= 10:
                generators = overlay_generators(db.list_generators())
                industrial_store.process_escalations(generators)
                last_industrial = now
            if now - last_automation >= 10:
                process_rules()
                last_automation = now
        except Exception as exc:
            print(f"[worker] erro: {exc}", flush=True)
        time.sleep(2)
    print("[worker] RC Geradores finalizado", flush=True)


if __name__ == "__main__":
    main()
