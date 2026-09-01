import asyncio
import os
import signal
import sys
import time

from app import provision_service


async def main() -> None:
    original_grace = provision_service.TERMINATE_GRACE
    provision_service.TERMINATE_GRACE = 0.2
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import time; time.sleep(60)",
        start_new_session=True,
    )
    started = time.monotonic()
    try:
        await provision_service._terminate_process(proc)
        elapsed = time.monotonic() - started
        assert proc.returncode is not None
        assert elapsed < 5, elapsed
        try:
            os.killpg(proc.pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError("grupo do processo privilegiado permaneceu vivo")
    finally:
        provision_service.TERMINATE_GRACE = original_grace
        if proc.returncode is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            await proc.wait()


asyncio.run(main())
print("RC Geradores provision timeout smoke: OK")
