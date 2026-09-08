from __future__ import annotations

import subprocess
import time

COMM_SERVICE = "scadacomm6.service"
SERVER_SERVICE = "scadaserver6.service"
SERVICES = (COMM_SERVICE, SERVER_SERVICE)


def _run(action: str, service: str, *, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["systemctl", action, service],
        check=check,
        capture_output=True,
        text=True,
    )


def _is_active(service: str) -> bool:
    result = _run("is-active", service, check=False)
    return result.returncode == 0 and result.stdout.strip() == "active"


def ensure_stopped_for_mutation() -> None:
    active = [service for service in SERVICES if _is_active(service)]
    if active:
        raise RuntimeError(
            "Mutação Rapid com --no-restart recusada porque há serviço ativo: "
            + ", ".join(active)
        )


def stop_for_mutation() -> dict[str, bool]:
    """Para apenas serviços que estavam ativos e confirma a parada.

    Qualquer falha bloqueia a mutação do BaseDAT/XML. O estado retornado deve ser
    usado por restore_after_mutation() no finally.
    """
    state = {service: _is_active(service) for service in SERVICES}
    for service in SERVICES:
        if state[service]:
            _run("stop", service, check=True)
    ensure_stopped_for_mutation()
    return state


def restore_after_mutation(state: dict[str, bool]) -> None:
    """Restaura somente os serviços que estavam ativos antes da mutação."""
    errors: list[str] = []
    if state.get(SERVER_SERVICE):
        try:
            _run("start", SERVER_SERVICE, check=True)
            time.sleep(2)
        except subprocess.CalledProcessError as exc:
            errors.append(f"{SERVER_SERVICE}: {exc.stderr.strip() or exc}")
    if state.get(COMM_SERVICE):
        try:
            # restart também cobre o raro caso em que uma dependência o reativou.
            _run("restart", COMM_SERVICE, check=True)
        except subprocess.CalledProcessError as exc:
            errors.append(f"{COMM_SERVICE}: {exc.stderr.strip() or exc}")
    if errors:
        raise RuntimeError("Falha ao restaurar serviços Rapid SCADA: " + "; ".join(errors))
