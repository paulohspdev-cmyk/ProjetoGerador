from __future__ import annotations

import os

MODEL = "InteliCompact NT"
EXECUTOR = "icnt_privileged"
ACTIONS = frozenset({"start", "stop"})


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_ICNT_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    return {
        item.strip()
        for item in os.environ.get("RC_ICNT_CONTROL_ALLOWLIST", "").split(",")
        if item.strip()
    }


def is_target(generator: dict) -> bool:
    return bool(
        enabled()
        and str(generator.get("id") or "") in allowlist()
        and str(generator.get("controller_model") or "").strip().casefold() == MODEL.casefold()
        and str(generator.get("transport") or "") == "reverse_tcp"
        and int(generator.get("listen_port") or 0) > 0
        and int(generator.get("modbus_unit") or 0) > 0
    )


def command_contract(pack: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in ACTIONS:
        raise ValueError(f"ação InteliCompact NT não suportada: {action or '-'}")
    contract = ((pack or {}).get("commands") or {}).get(action)
    if not isinstance(contract, dict) or contract.get("executor") != EXECUTOR:
        raise ValueError(f"contrato {action.upper()} InteliCompact NT ausente")
    return contract


def documented_command_ready(pack: dict, action: str) -> bool:
    try:
        contract = command_contract(pack, action)
    except ValueError:
        return False
    candidate = ((pack or {}).get("homologationCandidates") or {}).get(action) or {}
    validation = (pack or {}).get("validation") or {}
    return bool(
        contract
        and candidate.get("documented") is True
        and str(candidate.get("fieldState") or "") == "authorized_first_field_validation_pending"
        and "6358" in str(validation.get("commandSafety") or "")
        and "6360" in str(validation.get("commandSafety") or "")
    )
