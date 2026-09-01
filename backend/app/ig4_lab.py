"""Gate explícito para homologação de START do ComAp IG4 200.

Este módulo não promove capacidades do Controller Pack de produção. O START só
fica elegível quando a VM habilita o modo LAB e o gerador está nominalmente na
allowlist local. AUTO/TEST/MCB/GCB e demais comandos permanecem fora de escopo.
"""

import os
from pathlib import Path


CONFIRMATION = "IG4_LAB_START_CONFIRMED"
DEFAULT_SOCKET = "/run/rc-geradores/ig4-lab-control.sock"


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_IG4_LAB_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    raw = os.environ.get("RC_IG4_LAB_ALLOWLIST", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def control_socket_path() -> Path:
    return Path(os.environ.get("RC_IG4_LAB_CONTROL_SOCKET", DEFAULT_SOCKET))


def is_target(generator: dict) -> bool:
    if not enabled() or not generator.get("enabled"):
        return False
    allowed = allowlist()
    if not allowed:
        return False

    controller_type = str(generator.get("controller_type") or "").strip().upper()
    controller_model = str(generator.get("controller_model") or "").strip().lower()
    transport = str(generator.get("transport") or "").strip().lower()
    tag = str(generator.get("tag") or "").strip().lower()
    generator_id = str(generator.get("id") or "").strip().lower()
    rapid_device = int(generator.get("rapid_device_num") or 0)
    unit = int(generator.get("modbus_unit") or 0)

    return bool(
        controller_type == "COMAP"
        and controller_model == "ig4 200"
        and transport == "reverse_tcp"
        and rapid_device > 0
        and 1 <= unit <= 247
        and ({tag, generator_id} & allowed)
    )
