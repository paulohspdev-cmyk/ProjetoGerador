import signal
import time

from . import db, ops_store, platform_store
from .scheduler_jobs import HEAVY_JOB_KINDS, process_scheduler_jobs

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
    platform_store.touch_worker_heartbeat("heavy", "ok", "iniciado")
    last_heartbeat = time.monotonic()
    print("[heavy-worker] RC Geradores jobs pesados iniciado", flush=True)
    while running:
        now = time.monotonic()
        if now - last_heartbeat >= 15:
            platform_store.touch_worker_heartbeat("heavy", "ok")
            last_heartbeat = now
        try:
            process_scheduler_jobs(HEAVY_JOB_KINDS)
        except Exception as exc:
            platform_store.touch_worker_heartbeat("heavy", "degraded", str(exc))
            print(f"[heavy-worker] erro: {exc}", flush=True)
        time.sleep(2)
    platform_store.touch_worker_heartbeat("heavy", "stopped", "encerrado")
    print("[heavy-worker] RC Geradores jobs pesados finalizado", flush=True)


if __name__ == "__main__":
    main()
