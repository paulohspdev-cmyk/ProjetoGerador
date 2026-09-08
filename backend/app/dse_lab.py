"""Gate explícito para START/STOP DSE em ensaio local controlado.

Não promove o Controller Pack de produção. AUTO, TEST, MCB, GCB e paralelismo
permanecem bloqueados. Só o gerador da allowlist entra neste caminho.
"""

import os


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_DSE_LAB_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    raw = os.environ.get("RC_DSE_LAB_ALLOWLIST", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def is_target(generator: dict) -> bool:
    if not enabled() or not generator.get("enabled"):
        return False
    allowed = allowlist()
    if not allowed:
        return False

    controller_type = str(generator.get("controller_type") or "").strip().upper()
    controller_model = " ".join(str(generator.get("controller_model") or "").strip().lower().split())
    transport = str(generator.get("transport") or "").strip().lower()
    tag = str(generator.get("tag") or "").strip().lower()
    generator_id = str(generator.get("id") or "").strip().lower()
    host = str(generator.get("host") or "").strip()
    port = int(generator.get("listen_port") or 0)
    unit = int(generator.get("modbus_unit") or 0)
    rapid_device = int(generator.get("rapid_device_num") or 0)

    allowed_models = {
        "dse4520",
        "dse4520 mkii",
        "dse 4520",
        "dse 4520 mkii",
        "dse gencomm genset",
    }
    return bool(
        controller_type == "DSE"
        and controller_model in allowed_models
        and transport == "modbus_tcp_direct"
        and host
        and 1 <= port <= 65535
        and 1 <= unit <= 247
        and rapid_device > 0
        and ({tag, generator_id} & allowed)
    )
