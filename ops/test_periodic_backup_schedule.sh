#!/usr/bin/env bash
set -euo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${RC_TEST_PYTHON:-${BASE}/backend/.venv/bin/python}"
[[ -x "${PYTHON}" ]] || PYTHON="${RC_TEST_PYTHON:-python3}"

TMP="$(mktemp -d /tmp/rc-periodic-backup-test-XXXXXX)"
trap 'rm -rf "${TMP}"' EXIT

export RC_DATA_DIR="${TMP}/data"
export RC_PERIODIC_BACKUP_SECONDS=3600
export PYTHONPATH="${BASE}/backend"

"${PYTHON}" "${BASE}/ops/ensure_periodic_backup.py"
"${PYTHON}" "${BASE}/ops/ensure_periodic_backup.py"

"${PYTHON}" - <<'PY'
from app import platform_store

jobs = platform_store.list_scheduler_jobs()
backups = [job for job in jobs if job.get("kind") == "backup"]
enabled = [job for job in backups if job.get("enabled")]

assert len(backups) == 1, backups
assert len(enabled) == 1, enabled
job = enabled[0]
assert job["id"] == "job-daily-full-backup", job
assert int(job["interval_seconds"]) == 3600, job
print("Periodic backup schedule: OK")
PY
