"""Entrada da bridge com override explícito de framing por porta reverse TCP.

Permite declarar, por configuração da VM, o framing físico real de uma porta
compartilhada sem falsificar o modelo da controladora. Exemplo:
RC_RAPID_PORT_FRAMING_OVERRIDES=15002=modbus_tcp,15003=modbus_rtu

O override é aplicado apenas a geradores reverse_tcp e não altera mapas Modbus,
capabilities ou permissões de comando dos Controller Packs.
"""

from __future__ import annotations

import asyncio
import os

from . import bridge_runtime as runtime


def _parse_port_overrides(raw: str) -> dict[int, str]:
    overrides: dict[int, str] = {}
    for item in str(raw or "").split(","):
        token = item.strip()
        if not token:
            continue
        if "=" not in token:
            raise RuntimeError(
                "RC_RAPID_PORT_FRAMING_OVERRIDES inválido; use PORTA=modbus_tcp|modbus_rtu"
            )
        port_raw, framing_raw = token.split("=", 1)
        try:
            port = int(port_raw.strip())
        except ValueError as exc:
            raise RuntimeError(f"porta inválida no override de framing: {port_raw!r}") from exc
        if not 1 <= port <= 65535:
            raise RuntimeError(f"porta fora da faixa no override de framing: {port}")
        framing = framing_raw.strip().lower()
        if framing not in runtime.SUPPORTED_REMOTE_FRAMINGS:
            raise RuntimeError(
                f"framing inválido para porta {port}: {framing!r}; "
                "use modbus_tcp ou modbus_rtu"
            )
        if port in overrides and overrides[port] != framing:
            raise RuntimeError(f"override de framing duplicado e conflitante para porta {port}")
        overrides[port] = framing
    return overrides


PORT_OVERRIDES = _parse_port_overrides(
    os.environ.get("RC_RAPID_PORT_FRAMING_OVERRIDES", "")
)
_BASE_RESOLVER = runtime._remote_framing_for_generator


def _configured_remote_framing(generator: dict) -> str:
    if str(generator.get("transport") or "") == "reverse_tcp":
        port = int(generator.get("listen_port") or 0)
        if port in PORT_OVERRIDES:
            return PORT_OVERRIDES[port]
    return _BASE_RESOLVER(generator)


runtime._remote_framing_for_generator = _configured_remote_framing


if __name__ == "__main__":
    asyncio.run(runtime.main())
