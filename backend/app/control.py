import asyncio
import json
from pathlib import Path

from . import domain_store
from .binding_store import load_runtime_bindings
from .config import CONTROL_SOCKET
from .controller_library import (
    command_firmware_approval,
    pack_for_model,
    pack_is_production_ready,
)

COMMAND_ACTIONS = frozenset({
    "start", "stop", "auto", "manual", "test",
    "mcb_open", "mcb_close", "gcb_open", "gcb_close", "paralleling",
})


def _validated_binding(generator: dict) -> dict:
    generator_id = str(generator.get("id") or "")
    rapid_device = int(generator.get("rapid_device_num") or 0)
    if not generator_id or rapid_device <= 0:
        raise ValueError("Gerador sem identidade Rapid válida para controle")

    binding = next(
        (
            item
            for item in load_runtime_bindings()
            if str(item.get("generator_id") or "") == generator_id
        ),
        None,
    )
    if not binding:
        raise ValueError("Controle bloqueado: binding Rapid ativo não pertence ao gerador")

    expected = {
        "controller_type": str(generator.get("controller_type") or "").upper(),
        "controller_model": str(generator.get("controller_model") or "").strip().lower(),
        "transport": str(generator.get("transport") or ""),
        "listen_port": int(generator.get("listen_port") or 0),
        "modbus_unit": int(generator.get("modbus_unit") or 0),
        "rapid_device_num": rapid_device,
    }
    actual = {
        "controller_type": str(binding.get("controller_type") or "").upper(),
        "controller_model": str(binding.get("controller_model") or "").strip().lower(),
        "transport": str(binding.get("transport") or ""),
        "listen_port": int(binding.get("listen_port") or 0),
        "modbus_unit": int(binding.get("modbus_unit") or 0),
        "rapid_device_num": int(binding.get("rapid_device_num") or 0),
    }
    if actual != expected:
        raise ValueError("Controle bloqueado: cadastro e binding Rapid divergem")
    return binding


def _validated_controller_firmware(generator: dict, pack: dict) -> str:
    generator_id = str(generator.get("id") or "")
    model = str(generator.get("controller_model") or "").strip().casefold()
    assets = [
        item
        for item in domain_store.list_assets()
        if str(item.get("legacy_generator_id") or "") == generator_id
    ]
    if len(assets) != 1:
        raise ValueError(
            "Controle bloqueado: inventário da controladora não está vinculado de forma única ao gerador"
        )

    controllers = [
        item
        for item in domain_store.list_controllers(str(assets[0].get("id") or ""))
        if item.get("enabled", True)
        and str(item.get("model") or "").strip().casefold() == model
    ]
    if len(controllers) != 1:
        raise ValueError(
            "Controle bloqueado: inventário possui zero ou múltiplas controladoras compatíveis"
        )

    firmware = str(controllers[0].get("firmware") or "").strip()
    approved, detail = command_firmware_approval(pack, firmware)
    if not approved:
        raise ValueError(f"Controle bloqueado: {detail}")
    return firmware


async def _send_socket_command(socket_path: Path, payload: dict, timeout: float = 20.0) -> dict:
    if not socket_path.exists():
        raise ConnectionError(f"Socket de controle indisponível: {socket_path}")

    reader = writer = None
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(str(socket_path)),
            timeout=3,
        )
        writer.write((json.dumps(payload) + "\n").encode("utf-8"))
        await writer.drain()
        raw = await asyncio.wait_for(reader.readline(), timeout=max(3.0, timeout))
        if not raw:
            raise ConnectionError("Bridge encerrou a conexão sem resposta")
        result = json.loads(raw.decode("utf-8"))
        if not isinstance(result, dict):
            raise ValueError("Resposta inválida da bridge")
        return result
    finally:
        if writer is not None:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass


def command_contract(generator: dict, action: str) -> tuple[dict, dict]:
    action = str(action or "").strip().lower()
    if action not in COMMAND_ACTIONS:
        raise ValueError(f"Comando industrial desconhecido: {action or '-'}")
    if not generator.get("enabled"):
        raise ValueError("Controle bloqueado: gerador desabilitado")

    pack = pack_for_model(generator.get("controller_model") or "")
    if not pack or not pack_is_production_ready(pack):
        raise ValueError("Controle bloqueado: Controller Pack não está pronto para produção")
    if pack.get("status") != "field_validated":
        raise ValueError("Controle bloqueado: comandos exigem Controller Pack validado fisicamente em campo")

    capabilities = dict(pack.get("capabilities") or {})
    if not bool(capabilities.get(action)):
        raise ValueError(
            f"Controle bloqueado: comando {action.upper()} não está homologado neste Controller Pack"
        )

    commands = dict(pack.get("commands") or {})
    contract = commands.get(action)
    if not isinstance(contract, dict):
        raise ValueError(
            f"Controle bloqueado: capability {action.upper()} sem contrato de comando no Controller Pack"
        )

    expected_transport = str(contract.get("transport") or "")
    actual_transport = str(generator.get("transport") or "")
    if expected_transport and actual_transport != expected_transport:
        raise ValueError(
            f"Controle bloqueado: {action.upper()} exige transporte {expected_transport}, "
            f"cadastro usa {actual_transport or 'N/D'}"
        )

    _validated_controller_firmware(generator, pack)
    _validated_binding(generator)
    return pack, contract


async def send_homologated_command(generator: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    _pack, contract = command_contract(generator, action)
    executor = str(contract.get("executor") or "")
    rapid_device = int(generator.get("rapid_device_num") or 0)

    if executor != "ig200_privileged":
        raise ValueError(
            f"Controle bloqueado: executor {executor or 'N/D'} ainda não possui implementação "
            "de produção homologada"
        )
    if action not in {"start", "stop"}:
        raise ValueError(
            f"Controle bloqueado: executor IG200 atual não implementa {action.upper()} em produção"
        )

    timeout = float(contract.get("timeoutSeconds") or 20)
    result = await _send_socket_command(
        Path(CONTROL_SOCKET),
        {
            "device": rapid_device,
            "action": action,
            "confirm": "REMOTE_CONTROL_CONFIRMED",
        },
        timeout=timeout,
    )
    return {
        **result,
        "contract": {
            "schema": 4,
            "executor": executor,
            "action": action,
            "timeoutSeconds": int(timeout),
            "feedback": contract.get("feedback") or {},
        },
        "state": "controller_accepted" if result.get("accepted") else "rejected",
    }
