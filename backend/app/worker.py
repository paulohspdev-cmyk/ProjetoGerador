import signal
import time
from concurrent.futures import Future, ThreadPoolExecutor

from . import db, industrial_store, ops_store, platform_store, traffic_store
from .automation_engine import process_rules
from .backup_manager import create_full_backup
from .config import BRIDGE_STATUS_FILE
from .data_maintenance import apply_data_retention
from .notifications import process_due_notifications
from .rapid import overlay_generators
from .reporting import generate_report

running = True
_heavy_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rc-heavy-job")
_heavy_inflight: dict[str, Future] = {}


def stop(*_args):
    global running
    running = False


def _run_job(job: dict):
    kind = str(job.get("kind") or "")
    payload = job.get("payload") or {}
    if kind == "backup":
        result = create_full_backup("scheduler")
        if result.get("result") != "OK":
            raise RuntimeError(result.get("detail") or "backup agendado falhou")
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
    raise ValueError("tipo de agendamento não permitido")


def _complete_heavy_jobs():
    completed = 0
    for job_id, future in list(_heavy_inflight.items()):
        if not future.done():
            continue
        try:
            result = future.result()
        except Exception as exc:
            result = f"ERROR {exc}"
        platform_store.complete_scheduler_job(job_id, result)
        _heavy_inflight.pop(job_id, None)
        completed += 1
    return completed


def process_scheduler():
    count = _complete_heavy_jobs()
    for job in platform_store.due_scheduler_jobs():
        job_id = str(job["id"])
        kind = str(job.get("kind") or "")
        if kind in {"backup", "report"}:
            if job_id not in _heavy_inflight:
                _heavy_inflight[job_id] = _heavy_executor.submit(_run_job, dict(job))
                count += 1
            continue
        try:
            result = _run_job(job)
        except Exception as exc:
            result = f"ERROR {exc}"
        platform_store.complete_scheduler_job(job_id, result)
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
    last_retention = 0.0
    try:
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
                if now - last_retention >= 3600:
                    removed = apply_data_retention()
                    if any(removed.values()):
                        print(f"[worker] retenção aplicada: {removed}", flush=True)
                    last_retention = now
            except Exception as exc:
                print(f"[worker] erro: {exc}", flush=True)
            time.sleep(2)
    finally:
        _heavy_executor.shutdown(wait=True, cancel_futures=False)
        _complete_heavy_jobs()
    print("[worker] RC Geradores finalizado", flush=True)


if __name__ == "__main__":
    main()
