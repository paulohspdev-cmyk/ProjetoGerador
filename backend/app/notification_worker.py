import signal
import time

from . import db, platform_store
from .notifications import process_due_notifications

running = True


def stop(*_args):
    global running
    running = False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    db.init_db()
    platform_store.init_platform_db()
    print("[notification-worker] entrega externa iniciada", flush=True)
    while running:
        try:
            processed = process_due_notifications(limit=20)
            if processed == 0:
                time.sleep(1)
        except Exception as exc:
            print(f"[notification-worker] erro: {exc}", flush=True)
            time.sleep(2)
    print("[notification-worker] finalizado", flush=True)


if __name__ == "__main__":
    main()
