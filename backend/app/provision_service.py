import asyncio
import json
import os
import signal
from pathlib import Path

SOCKET = os.environ.get("RC_PROVISION_SOCKET", "/run/rc-geradores/provision.sock")
BASE = Path(os.environ.get("RC_PROJECT_ROOT", "/opt/rc-geradores"))
PYTHON = BASE / "backend/.venv/bin/python"
SCRIPTS = {
    "provision": (BASE / "rapid/provisioning/provision_generator.py", "PROVISION_CONFIRMED"),
    "deprovision": (BASE / "rapid/provisioning/deprovision_generator.py", "DEPROVISION_CONFIRMED"),
}
OPERATION_TIMEOUT = float(os.environ.get("RC_PROVISION_OPERATION_TIMEOUT", "90"))
TERMINATE_GRACE = float(os.environ.get("RC_PROVISION_TERMINATE_GRACE", "5"))
lock = asyncio.Lock()


def log(message):
    print(f"[provision] {message}", flush=True)


async def _terminate_process(proc: asyncio.subprocess.Process) -> None:
    """Encerra o grupo do provisionador antes de liberar o lock privilegiado.

    O processo é iniciado em uma sessão própria para impedir que um timeout da API
    deixe o script (ou um filho) alterando o Rapid SCADA em segundo plano.
    """
    if proc.returncode is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except Exception:
        try:
            proc.terminate()
        except ProcessLookupError:
            return

    try:
        await asyncio.wait_for(proc.wait(), timeout=TERMINATE_GRACE)
        return
    except asyncio.TimeoutError:
        pass

    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    except Exception:
        try:
            proc.kill()
        except ProcessLookupError:
            return
    await proc.wait()


async def handle(reader, writer):
    response = {"ok": False, "error": "requisição inválida"}
    proc: asyncio.subprocess.Process | None = None
    try:
        raw = await asyncio.wait_for(reader.readline(), timeout=5)
        if not raw or len(raw) > 4096:
            raise ValueError("requisição vazia ou grande demais")
        req = json.loads(raw.decode("utf-8"))
        operation = str(req.get("operation") or "provision").strip().lower()
        if operation not in SCRIPTS:
            raise ValueError("operação inválida")
        script, confirmation = SCRIPTS[operation]
        if req.get("confirm") != confirmation:
            raise PermissionError(f"confirmação de {operation} ausente")
        generator_id = str(req.get("generator_id") or "").strip()
        if not generator_id or len(generator_id) > 100:
            raise ValueError("generator_id inválido")
        if not script.is_file():
            raise FileNotFoundError(script)

        async with lock:
            proc = await asyncio.create_subprocess_exec(
                str(PYTHON),
                str(script),
                generator_id,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=OPERATION_TIMEOUT,
                )
            except asyncio.TimeoutError as exc:
                await _terminate_process(proc)
                raise RuntimeError(
                    f"{operation} excedeu {OPERATION_TIMEOUT:.0f}s e foi encerrado antes de liberar o lock"
                ) from exc

            if proc.returncode != 0:
                raise RuntimeError((stderr or stdout).decode("utf-8", errors="replace")[-2000:])
            response = json.loads(stdout.decode("utf-8"))
            if not isinstance(response, dict):
                raise ValueError("resposta do provisionador não é um objeto JSON")
            log(f"gerador {generator_id}: {operation} concluído")
    except Exception as exc:
        if proc is not None and proc.returncode is None:
            try:
                await _terminate_process(proc)
            except Exception as stop_exc:
                log(f"falha adicional ao encerrar processo privilegiado: {stop_exc}")
        response = {"ok": False, "error": str(exc)[:2000]}
        log(f"falha: {exc}")
    finally:
        try:
            writer.write((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
            await writer.drain()
        except Exception:
            pass
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


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
