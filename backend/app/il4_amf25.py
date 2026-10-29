from __future__ import annotations

import os

MODEL = "InteliLite 4 AMF 25"
EXECUTOR = "il4_amf25_privileged"
ACTIONS = frozenset({"start", "stop"})


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_IL4_AMF25_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    return {
        item.strip()
        for item in os.environ.get("RC_IL4_AMF25_CONTROL_ALLOWLIST", "").split(",")
        if item.strip()
    }


def is_target(generator: dict) -> bool:
    return bool(
        enabled()
        and str(generator.get("id") or "") in allowlist()
        and str(generator.get("controller_model") or "").strip().casefold() == MODEL.casefold()
        and str(generator.get("transport") or "").strip() == "modbus_tcp_direct"
        and int(generator.get("listen_port") or 0) == 502
        and int(generator.get("modbus_unit") or 0) == 1
    )


def command_contract(pack: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in ACTIONS:
        raise ValueError(f"ação InteliLite 4 não suportada: {action or '-'}")
    contract = ((pack or {}).get("commands") or {}).get(action)
    if not isinstance(contract, dict) or contract.get("executor") != EXECUTOR:
        raise ValueError(f"contrato {action.upper()} InteliLite 4 ausente")
    return contract


def documented_command_ready(pack: dict, action: str) -> bool:
    try:
        contract = command_contract(pack, action)
    except ValueError:
        return False
    validation = (pack or {}).get("validation") or {}
    candidates = (pack or {}).get("homologationCandidates") or {}
    candidate = candidates.get(action) or {}
    mapping = (pack or {}).get("mapping") or {}
    rpm = (mapping.get("registers") or {}).get("rpm") or {}
    return bool(
        contract
        and candidate.get("documented") is True
        and str(candidate.get("fieldState") or "") == "authorized_first_field_validation_pending"
        and validation.get("lab") is True
        and validation.get("field") is not True
        and "start/stop" in str(validation.get("commandSafety") or "").casefold()
        and int(rpm.get("address") or -1) == 1004
    )
