from __future__ import annotations

import os

MODEL = "InteliGen NT BaseBox"
EXECUTOR = "ignt_basebox_privileged"
ACTIONS = frozenset({"start", "stop"})


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_IGNT_BASEBOX_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    return {
        item.strip()
        for item in os.environ.get("RC_IGNT_BASEBOX_CONTROL_ALLOWLIST", "").split(",")
        if item.strip()
    }


def is_target(generator: dict) -> bool:
    return bool(
        enabled()
        and str(generator.get("id") or "") in allowlist()
        and str(generator.get("controller_model") or "").strip().casefold() == MODEL.casefold()
        and str(generator.get("transport") or "") == "modbus_tcp_direct"
    )


def command_contract(pack: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in ACTIONS:
        raise ValueError(f"ação BaseBox não suportada: {action or '-'}")
    contract = ((pack or {}).get("commands") or {}).get(action)
    if not isinstance(contract, dict) or contract.get("executor") != EXECUTOR:
        raise ValueError(f"contrato {action.upper()} BaseBox ausente")
    return contract


def documented_command_ready(pack: dict, action: str) -> bool:
    try:
        contract = command_contract(pack, action)
    except ValueError:
        return False
    validation = (pack or {}).get("validation") or {}
    candidates = (pack or {}).get("homologationCandidates") or {}
    candidate = candidates.get(action) or {}
    return bool(
        contract
        and candidate.get("documented") is True
        and str(candidate.get("fieldState") or "") == "authorized_first_field_validation_pending"
        and "document" in str(validation.get("commandSafety") or "").casefold()
    )
