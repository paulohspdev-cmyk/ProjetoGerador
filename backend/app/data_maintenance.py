import time

from . import db
from .config import (
    RETENTION_AUDIT_DAYS,
    RETENTION_EVENT_DAYS,
    RETENTION_NOTIFICATION_DAYS,
    RETENTION_PROCESS_DAYS,
)


def _days(value: int, maximum: int = 3650) -> int:
    return max(1, min(int(value), maximum))


def apply_data_retention(now: int | None = None) -> dict[str, int]:
    now = int(now or time.time())
    cutoffs = {
        "audit_log": now - _days(RETENTION_AUDIT_DAYS) * 86400,
        "events": now - _days(RETENTION_EVENT_DAYS) * 86400,
        "process_events": now - _days(RETENTION_PROCESS_DAYS) * 86400,
        "notification_deliveries": now - _days(RETENTION_NOTIFICATION_DAYS) * 86400,
    }
    removed: dict[str, int] = {}
    with db.connect() as conn:
        for table, cutoff in cutoffs.items():
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            if not exists:
                removed[table] = 0
                continue
            cur = conn.execute(f"DELETE FROM {table} WHERE created_at < ?", (cutoff,))
            removed[table] = max(0, int(cur.rowcount or 0))
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='notification_queue'"
        ).fetchone()
        if exists:
            cutoff = now - _days(RETENTION_NOTIFICATION_DAYS) * 86400
            cur = conn.execute(
                "DELETE FROM notification_queue WHERE created_at < ? AND status IN ('sent','failed')",
                (cutoff,),
            )
            removed["notification_queue"] = max(0, int(cur.rowcount or 0))
        conn.execute("PRAGMA optimize")
    return removed
