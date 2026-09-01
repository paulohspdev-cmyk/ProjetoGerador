from . import db, ops_store, platform_store
from .backup_manager import create_full_backup
from .rapid import overlay_generators
from .reporting import generate_report

ALLOWED_JOB_KINDS = {"backup", "report", "notification"}
OPERATIONAL_JOB_KINDS = {"notification"}
HEAVY_JOB_KINDS = {"backup", "report"}


def run_scheduler_job(job: dict) -> str:
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


def process_scheduler_jobs(allowed_kinds: set[str], limit: int = 20) -> int:
    unexpected = set(allowed_kinds) - ALLOWED_JOB_KINDS
    if unexpected:
        raise ValueError("tipos de agendamento inválidos: " + ", ".join(sorted(unexpected)))

    count = 0
    for job in platform_store.due_scheduler_jobs(limit=limit):
        job_id = str(job["id"])
        kind = str(job.get("kind") or "")
        if kind not in allowed_kinds:
            continue
        try:
            result = run_scheduler_job(job)
        except Exception as exc:
            result = f"ERROR {exc}"
        platform_store.complete_scheduler_job(job_id, result)
        count += 1
    return count
