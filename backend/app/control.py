import asyncio
import json
from pathlib import Path

from .config import CONTROL_SOCKET
from .controller_library import pack_for_model, pack_is_production_ready
from .rapid import load_bindings


def _validated_binding(generator: dict) -> dict:
    generator_id = str(generator.get("id") or "")
    rapid_device = int(generator.get("rapid_device_num") or 0)
    if not generator_id or rapid_device <= 0:
        raise ValueError("Gerador sem identidade Rapid válida para controle")

    binding = next(
        (
            item
            for item in load_bindings()
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


async def send_homologated_command(generator: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in {"start", "stop"}:
        raise ValueError("Somente START e STOP estão homologados")
    if not generator.get("enabled"):
        raise ValueError("Controle bloqueado: gerador desabilitado")

    controller_type = str(generator.get("controller_type") or "").upper()
    controller_model = str(generator.get("controller_model") or "").strip().lower()
    rapid_device = int(generator.get("rapid_device_num") or 0)
    transport = str(generator.get("transport") or "")

    if controller_type != "COMAP" or controller_model != "inteligen 200" or rapid_device <= 0:
        raise ValueError("Controle remoto disponível somente para o ComAp InteliGen 200 provisionado no Rapid SCADA")
    if transport != "reverse_tcp":
        raise ValueError("Controle remoto IG200 homologado somente no transporte reverse_tcp")

    pack = pack_for_model(generator.get("controller_model") or "")
    if not pack_is_production_ready(pack):
        raise ValueError("Controle bloqueado: Controller Pack não está field_validated em production")
    capabilities = dict((pack or {}).get("capabilities") or {})
    if not bool(capabilities.get(action)):
        raise ValueError(f"Controle bloqueado: comando {action.upper()} não está homologado neste Controller Pack")

    _validated_binding(generator)

    socket_path = Path(CONTROL_SOCKET)
    if not socket_path.exists():
        raise ConnectionError(f"Socket de controle indisponível: {socket_path}")

    reader = writer = None
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(str(socket_path)),
            timeout=3,
        )
        payload = {
            "device": rapid_device,
            "action": action,
            "confirm": "REMOTE_CONTROL_CONFIRMED",
        }
        writer.write((json.dumps(payload) + "\n").encode("utf-8"))
        await writer.drain()
        raw = await asyncio.wait_for(reader.readline(), timeout=15)
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
