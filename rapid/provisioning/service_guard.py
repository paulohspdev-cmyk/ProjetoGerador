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


def stop_for_mutation() -> dict[str, bool]:
    """Para apenas serviços ativos e nunca deixa parada parcial silenciosa.

    Se qualquer stop falhar, tenta restaurar imediatamente o estado anterior antes
    de propagar a falha. Assim o chamador só recebe um state quando a janela de
    mutação foi realmente estabelecida com ambos os serviços parados.
    """
    state = {service: _is_active(service) for service in SERVICES}
    try:
        for service in SERVICES:
            if state[service]:
                _run("stop", service, check=True)
        ensure_stopped_for_mutation()
        return state
    except Exception as stop_exc:
        try:
            restore_after_mutation(state)
        except Exception as restore_exc:
            raise RuntimeError(
                "Falha ao estabelecer janela segura de mutação do Rapid e também ao "
                f"restaurar o estado anterior: {restore_exc}"
            ) from stop_exc
        raise
