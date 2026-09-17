import asyncio
import signal
import time

from fastapi import HTTPException

from . import db, domain_store, platform_store
from .domain_routes import execute_lifecycle_operation

running = True


def stop(*_args):
    global running
    running = False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    db.init_db()
    platform_store.init_platform_db()
    domain_store.init_domain_db()
    print("[lifecycle-worker] fila industrial rastreável iniciada", flush=True)
    while running:
        item = platform_store.claim_lifecycle_operation()
        if not item:
            time.sleep(1)
            continue
        operation_id = item["operationId"]
        try:
            result = asyncio.run(execute_lifecycle_operation(item))
        except HTTPException as exc:
            platform_store.finish_lifecycle_operation(
                operation_id, error=str(exc.detail or f"HTTP {exc.status_code}")
            )
        except Exception as exc:
            platform_store.finish_lifecycle_operation(operation_id, error=str(exc))
        else:
            platform_store.finish_lifecycle_operation(operation_id, result=result)
    print("[lifecycle-worker] finalizado", flush=True)


if __name__ == "__main__":
    main()
