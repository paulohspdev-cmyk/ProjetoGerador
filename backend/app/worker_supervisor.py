import signal
import subprocess
import sys
import time

running = True
children: list[subprocess.Popen] = []


def stop(*_args):
    global running
    running = False


def _start(module: str) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-m", module])


def _stop_children() -> None:
    for child in children:
        if child.poll() is None:
            child.terminate()
    deadline = time.monotonic() + 15
    for child in children:
        if child.poll() is not None:
            continue
        remaining = max(0.0, deadline - time.monotonic())
        try:
            child.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            child.kill()
    for child in children:
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            child.kill()


def main() -> int:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    children.extend([_start("app.worker"), _start("app.heavy_worker")])
    print("[worker-supervisor] operacional + jobs pesados iniciados", flush=True)
    exit_code = 0
    try:
        while running:
            for child in children:
                code = child.poll()
                if code is not None:
                    exit_code = code if code != 0 else 1
                    running_state = "falhou" if code else "encerrou inesperadamente"
                    print(
                        f"[worker-supervisor] filho pid={child.pid} {running_state} rc={code}",
                        flush=True,
                    )
                    return exit_code
            time.sleep(1)
        return 0
    finally:
        _stop_children()
        print("[worker-supervisor] processos filhos finalizados", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
