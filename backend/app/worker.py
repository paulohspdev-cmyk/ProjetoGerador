import signal
import time

from . import db, industrial_store, ops_store, platform_store, traffic_store
from .automation_engine import process_rules
from .config import BRIDGE_STATUS_FILE
from .data_maintenance import apply_data_retention
from .notifications import process_due_notifications
from .rapid import overlay_generators
from .scheduler_jobs import OPERATIONAL_JOB_KINDS, process_scheduler_jobs

running = True


def stop(*_args):
    global running
    running = False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    industrial_store.init_industrial_db()
    traffic_store.init_traffic_db()
    print("[worker] RC Geradores operacional iniciado", flush=True)
    last_automation = 0.0
    last_industrial = 0.0
    last_traffic = 0.0
    last_retention = 0.0
    while running:
        try:
            process_due_notifications()
            process_scheduler_jobs(OPERATIONAL_JOB_KINDS)
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
    print("[worker] RC Geradores operacional finalizado", flush=True)


if __name__ == "__main__":
    main()
