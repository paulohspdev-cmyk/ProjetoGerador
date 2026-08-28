import asyncio
import json
from pathlib import Path

from .config import CONTROL_SOCKET


async def send_homologated_command(generator: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in {"start", "stop"}:
        raise ValueError("Somente START e STOP estão homologados")

    controller_type = str(generator.get("controller_type") or "").upper()
    controller_model = str(generator.get("controller_model") or "").strip().lower()
    rapid_device = int(generator.get("rapid_device_num") or 0)

    if controller_type != "COMAP" or controller_model != "inteligen 200" or rapid_device != 200:
        raise ValueError("Controle remoto disponível somente para o ComAp InteliGen 200 homologado")

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
            "device": 200,
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
