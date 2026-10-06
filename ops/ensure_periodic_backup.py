#!/usr/bin/env python3
"""Ensure RC Geradores has at least one enabled periodic full-backup job."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app import db, platform_store  # noqa: E402

DEFAULT_JOB_ID = "job-daily-full-backup"
DEFAULT_JOB_NAME = "Backup diário automático"
DEFAULT_INTERVAL_SECONDS = 24 * 60 * 60


def _interval_seconds() -> int:
    raw = os.environ.get("RC_PERIODIC_BACKUP_SECONDS", "").strip()
    if not raw:
        return DEFAULT_INTERVAL_SECONDS
    try:
        value = int(raw)
    except ValueError as exc:
        raise SystemExit("RC_PERIODIC_BACKUP_SECONDS deve ser inteiro") from exc
    if value < 3600:
        raise SystemExit("RC_PERIODIC_BACKUP_SECONDS deve ser >= 3600")
    return value


def ensure_periodic_backup() -> dict:
    db.init_db()
    platform_store.init_platform_db()

    jobs = platform_store.list_scheduler_jobs()
    enabled_backups = [
        job
        for job in jobs
        if job.get("kind") == "backup" and bool(job.get("enabled"))
    ]
    if enabled_backups:
        chosen = sorted(enabled_backups, key=lambda job: str(job.get("id") or ""))[0]
        print(
            "Backup periódico já configurado:",
            chosen.get("id"),
            f"interval={chosen.get('interval_seconds')}s",
        )
        return chosen

    interval = _interval_seconds()
    now = int(time.time())
    existing = next(
        (job for job in jobs if str(job.get("id") or "") == DEFAULT_JOB_ID),
        None,
    )
    next_run = now + interval
    if existing:
        previous_next = int(existing.get("next_run") or 0)
        if previous_next > now:
            next_run = previous_next

    job = platform_store.upsert_scheduler_job(
        {
            "id": DEFAULT_JOB_ID,
            "name": DEFAULT_JOB_NAME,
            "kind": "backup",
            "interval_seconds": interval,
            "payload": {},
            "enabled": True,
            "next_run": next_run,
        },
        "ops.ensure_periodic_backup",
    )
    print(
        "Backup periódico garantido:",
        job.get("id"),
        f"interval={job.get('interval_seconds')}s",
        f"next_run={job.get('next_run')}",
    )
    return job


if __name__ == "__main__":
    ensure_periodic_backup()
