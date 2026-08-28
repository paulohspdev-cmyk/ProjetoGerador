import asyncio
import json
import os
from pathlib import Path

SOCKET = os.environ.get("RC_PROVISION_SOCKET", "/run/rc-geradores/provision.sock")
BASE = Path("/opt/rc-geradores")
PYTHON = BASE / "backend/.venv/bin/python"
SCRIPT = BASE / "rapid/provisioning/provision_generator.py"
lock = asyncio.Lock()


def log(message):
    print(f"[provision] {message}", flush=True)


async def handle(reader, writer):
    response = {"ok": False, "error": "requisição inválida"}
    try:
        raw = await asyncio.wait_for(reader.readline(), timeout=5)
        if not raw or len(raw) > 4096:
            raise ValueError("requisição vazia ou grande demais")
        req = json.loads(raw.decode("utf-8"))
        if req.get("confirm") != "PROVISION_CONFIRMED":
            raise PermissionError("confirmação de provisionamento ausente")
        generator_id = str(req.get("generator_id") or "").strip()
        if not generator_id or len(generator_id) > 100:
            raise ValueError("generator_id inválido")
        async with lock:
            proc = await asyncio.create_subprocess_exec(
                str(PYTHON), str(SCRIPT), generator_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            if proc.returncode != 0:
                raise RuntimeError((stderr or stdout).decode("utf-8", errors="replace")[-2000:])
            response = json.loads(stdout.decode("utf-8"))
            log(f"gerador {generator_id}: provisionado")
    except Exception as exc:
        response = {"ok": False, "error": str(exc)[:2000]}
        log(f"falha: {exc}")
    finally:
        writer.write((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
        await writer.drain()
        writer.close()
        await writer.wait_closed()


async def main():
    path = Path(SOCKET)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    server = await asyncio.start_unix_server(handle, path=str(path))
    os.chmod(path, 0o660)
    log(f"socket {path}")
    try:
        async with server:
            await server.serve_forever()
    finally:
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    asyncio.run(main())
