"""Controle de produção IG4 explicitamente allowlisted.

Este módulo não envia comandos. Ele apenas define quais instâncias IG4 podem
receber START/STOP pelo executor privilegiado de produção. O default é
fail-closed: gate desligado ou allowlist vazia bloqueiam tudo.
"""

from __future__ import annotations

import os

ACTIONS = frozenset({"start", "stop"})


def enabled() -> bool:
    return os.environ.get("RC_ENABLE_IG4_PROD_CONTROL", "0").strip() == "1"


def allowlist() -> set[str]:
    raw = os.environ.get("RC_IG4_PROD_ALLOWLIST", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def is_target(generator: dict) -> bool:
    if not enabled() or not generator.get("enabled"):
        return False
    allowed = allowlist()
    if not allowed:
        return False
    tag = str(generator.get("tag") or "").strip().lower()
    generator_id = str(generator.get("id") or "").strip().lower()
    model = str(generator.get("controller_model") or "").strip().lower()
    return bool(
        str(generator.get("controller_type") or "").strip().upper() == "COMAP"
        and model in {"inteligen4 200", "inteligen 4 200", "ig4 200", "ig4-200"}
        and str(generator.get("transport") or "").strip() == "reverse_tcp"
        and int(generator.get("rapid_device_num") or 0) > 0
        and 1 <= int(generator.get("modbus_unit") or 0) <= 247
        and ({tag, generator_id} & allowed)
    )


def command_contract(pack: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    if action not in ACTIONS:
        raise ValueError(f"ação IG4 de produção não suportada: {action or '-'}")
    candidate = dict((pack.get("homologationCandidates") or {}).get(action) or {})
    if not candidate.get("documented"):
        raise ValueError(f"{action.upper()} IG4 não possui mecanismo documentado no pack")

    return {
        "executor": "comap_privileged",
        "transport": "reverse_tcp",
        "confirmation": action.upper(),
        "preconditions": [
            "generator_enabled",
            "field_validated_pack",
            "binding_match",
            "approved_firmware",
            "production_allowlist",
            "controller_online",
            "manual_mode",
            "breakers_open",
        ] + (["engine_stopped", "no_blocking_alarm"] if action == "start" else ["engine_running"]),
        "feedback": {
            "metric": "rpm",
            "operator": "gt" if action == "start" else "lte",
            "value": 100,
            "timeoutSeconds": 15 if action == "start" else 30,
        },
        "timeoutSeconds": 20 if action == "start" else 35,
        "notes": (
            "IG4 START/STOP liberado somente para instâncias explicitamente allowlisted; "
            "o executor revalida modo, breaker, estado do motor e RPM imediatamente antes da escrita."
        ),
    }
