import asyncio
import json
from pathlib import Path

from . import domain_store, ibcom_web, ig4_prod, ignt_basebox, il4_amf25, icnt
from .binding_store import load_runtime_bindings
from .config import CONTROL_SOCKET
from .controller_library import (
    command_firmware_approval,
    pack_for_model,
    pack_is_production_ready,
)

COMMAND_ACTIONS = frozenset({
    "start", "stop", "off", "auto", "manual", "test",
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
    basebox_documented = bool(
        action in ignt_basebox.ACTIONS
        and ignt_basebox.is_target(generator)
        and ignt_basebox.documented_command_ready(pack, action)
    )
    il4_documented = bool(
        action in il4_amf25.ACTIONS
        and il4_amf25.is_target(generator)
        and il4_amf25.documented_command_ready(pack, action)
    )
    icnt_documented = bool(
        action in icnt.ACTIONS
        and icnt.is_target(generator)
        and icnt.documented_command_ready(pack, action)
    )
    if (
        str(generator.get("controller_model") or "").strip().casefold() == icnt.MODEL.casefold()
        and action in icnt.ACTIONS
        and not icnt_documented
    ):
        raise ValueError("Controle bloqueado: InteliCompact NT fora da allowlist/documentação de comando")
    if pack.get("status") != "field_validated" and not basebox_documented and not il4_documented and not icnt_documented:
        raise ValueError("Controle bloqueado: comandos exigem Controller Pack validado fisicamente em campo")

    capabilities = dict(pack.get("capabilities") or {})
    commands = dict(pack.get("commands") or {})

    if basebox_documented:
        contract = ignt_basebox.command_contract(pack, action)
    elif il4_documented:
        contract = il4_amf25.command_contract(pack, action)
    elif icnt_documented:
        contract = icnt.command_contract(pack, action)
    elif action in ig4_prod.ACTIONS and ig4_prod.is_target(generator):
        contract = ig4_prod.command_contract(pack, action)
    else:
        if not bool(capabilities.get(action)):
            raise ValueError(
                f"Controle bloqueado: comando {action.upper()} não está homologado neste Controller Pack"
            )
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

    if not il4_documented:
        _validated_controller_firmware(generator, pack)
    _validated_binding(generator)
    return pack, contract


async def send_homologated_command(generator: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    _pack, contract = command_contract(generator, action)
    executor = str(contract.get("executor") or "")
    rapid_device = int(generator.get("rapid_device_num") or 0)

    if executor not in {"ig200_privileged", "comap_privileged", "ignt_basebox_privileged", "il4_amf25_privileged", "icnt_privileged"}:
        raise ValueError(
            f"Controle bloqueado: executor {executor or 'N/D'} ainda não possui implementação "
            "de produção homologada"
        )
    if action not in {"start", "stop"}:
        raise ValueError(
            f"Controle bloqueado: executor atual não implementa {action.upper()} em produção"
        )
    if executor == "comap_privileged" and not ig4_prod.is_target(generator):
        raise ValueError("Controle bloqueado: IG4 fora da allowlist de produção")
    if executor == "ignt_basebox_privileged" and not ignt_basebox.is_target(generator):
        raise ValueError("Controle bloqueado: BaseBox fora da allowlist de produção")
    if executor == "il4_amf25_privileged" and not il4_amf25.is_target(generator):
        raise ValueError("Controle bloqueado: InteliLite 4 AMF25 fora da allowlist de produção")
    if executor == "icnt_privileged" and not icnt.is_target(generator):
        raise ValueError("Controle bloqueado: InteliCompact NT fora da allowlist de produção")

    if executor == "ignt_basebox_privileged":
        web_data, web_error = ibcom_web.telemetry(generator)
        if not web_data or web_error:
            raise ValueError(
                "Controle bloqueado: telemetria IB-COM fresca não disponível"
                + (f" ({web_error})" if web_error else "")
            )
        age = max(0, int(__import__("time").time()) - int(web_data.get("at") or 0))
        if age > 20:
            raise ValueError(f"Controle bloqueado: telemetria IB-COM com {age}s")
        values = dict(web_data.get("values") or {})
        mode = int(values.get("controller_mode_raw", -1))
        rpm = float(values.get("rpm", -1))
        engine = int(values.get("engine_state_raw", -1))
        breaker = int(values.get("breaker_state_raw", -1))
        if mode != 1:
            raise ValueError(f"Controle bloqueado: BaseBox não está em MAN (modo={mode})")
        if action == "start":
            if rpm != 0 or engine != 1 or breaker != 1:
                raise ValueError(
                    "START bloqueado: exige RPM=0, Engine state=Ready e Breaker state=BrksOff"
                )
        elif rpm <= 100:
            raise ValueError(f"STOP bloqueado: motor já está parado/abaixo de 100 rpm ({rpm:g})")

    timeout = float(contract.get("timeoutSeconds") or 20)
    payload = {
        "device": rapid_device,
        "action": action,
        "executor": executor,
        "confirm": "REMOTE_CONTROL_CONFIRMED",
    }
    if executor in {"comap_privileged", "ignt_basebox_privileged", "il4_amf25_privileged", "icnt_privileged"}:
        payload["generator_id"] = str(generator.get("id") or "")

    if executor == "ignt_basebox_privileged":
        ibcom_web.suspend_for_control(str(generator.get("id") or ""), seconds=50)
        try:
            await asyncio.sleep(0.75)
            result = await _send_socket_command(
                Path(CONTROL_SOCKET),
                payload,
                timeout=timeout,
            )
        finally:
            ibcom_web.resume_after_control(str(generator.get("id") or ""), delay_seconds=2)
    else:
        result = await _send_socket_command(
            Path(CONTROL_SOCKET),
            payload,
            timeout=timeout,
        )
    return {
        **result,
        "ok": bool(result.get("accepted") and result.get("feedback_confirmed")),
        "contract": {
            "schema": 4,
            "executor": executor,
            "action": action,
            "timeoutSeconds": int(timeout),
            "feedback": contract.get("feedback") or {},
        },
        "state": (
            "confirmed" if result.get("accepted") and result.get("feedback_confirmed")
            else "failed" if result.get("accepted")
            else "rejected"
        ),
    }
