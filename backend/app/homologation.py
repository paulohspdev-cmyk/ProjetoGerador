from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

from . import db, domain_store
from .binding_store import load_runtime_bindings
from .controller_library import (
    COMMAND_CAPABILITIES,
    command_firmware_approval,
    pack_for_model,
    pack_is_production_ready,
)

SUPPORTED_EXECUTORS = {"ig200_privileged", "dse_gencomm_privileged", "comap_privileged"}


def _controller_inventory(generator: dict) -> list[dict]:
    gid = str(generator.get("id") or "")
    assets = [
        item
        for item in domain_store.list_assets()
        if str(item.get("legacy_generator_id") or "") == gid
    ]
    if len(assets) != 1:
        return []
    return [
        item
        for item in domain_store.list_controllers(str(assets[0].get("id") or ""))
        if item.get("enabled", True)
    ]


def _firmwares(generator: dict) -> list[str]:
    values = {
        str(item.get("firmware") or "").strip()
        for item in _controller_inventory(generator)
        if str(item.get("firmware") or "").strip()
    }
    return sorted(values)


def _binding(generator: dict) -> dict | None:
    gid = str(generator.get("id") or "")
    matches = [
        item
        for item in load_runtime_bindings()
        if str(item.get("generator_id") or "") == gid
    ]
    return matches[0] if len(matches) == 1 else None


def _binding_matches(generator: dict, binding: dict | None) -> bool:
    if not binding:
        return False
    expected = (
        str(generator.get("controller_type") or "").upper(),
        str(generator.get("controller_model") or "").strip().casefold(),
        str(generator.get("transport") or ""),
        int(generator.get("listen_port") or 0),
        int(generator.get("modbus_unit") or 0),
        int(generator.get("rapid_device_num") or 0),
    )
    actual = (
        str(binding.get("controller_type") or "").upper(),
        str(binding.get("controller_model") or "").strip().casefold(),
        str(binding.get("transport") or ""),
        int(binding.get("listen_port") or 0),
        int(binding.get("modbus_unit") or 0),
        int(binding.get("rapid_device_num") or 0),
    )
    return expected == actual


def action_readiness(generator: dict, action: str) -> dict[str, Any]:
    action = str(action or "").strip().lower()
    if action not in COMMAND_CAPABILITIES:
        raise ValueError(f"ação desconhecida: {action}")

    model = str(generator.get("controller_model") or "")
    pack = pack_for_model(model)
    firmwares = _firmwares(generator)
    binding = _binding(generator)
    capabilities = dict((pack or {}).get("capabilities") or {})
    commands = dict((pack or {}).get("commands") or {})
    candidate = deepcopy(((pack or {}).get("homologationCandidates") or {}).get(action))
    contract = deepcopy(commands.get(action)) if isinstance(commands.get(action), dict) else None

    gates = {
        "enabled": bool(generator.get("enabled")),
        "packProductionReady": pack_is_production_ready(pack),
        "packFieldValidated": bool(pack and pack.get("status") == "field_validated"),
        "capabilityEnabled": bool(capabilities.get(action)),
        "commandContractPresent": bool(contract),
        "executorSupported": bool(contract and contract.get("executor") in SUPPORTED_EXECUTORS),
        "singleFirmwareInventoried": len(firmwares) == 1,
        "firmwareApproved": False,
        "bindingPresent": bool(binding),
        "bindingMatches": _binding_matches(generator, binding),
    }

    firmware_detail = "firmware não inventariado"
    if len(firmwares) == 1:
        gates["firmwareApproved"], firmware_detail = command_firmware_approval(pack, firmwares[0])
    elif len(firmwares) > 1:
        firmware_detail = "inventário possui múltiplas versões"

    production_ready = all(gates.values())
    if production_ready:
        status = "production_ready"
    elif not pack:
        status = "missing_pack"
    elif not gates["packProductionReady"]:
        status = "pack_not_production"
    elif not candidate:
        status = "missing_documented_candidate"
    elif not candidate.get("documented"):
        status = str(candidate.get("fieldState") or "candidate_not_documented")
    elif not gates["singleFirmwareInventoried"]:
        status = "firmware_inventory_required"
    elif not gates["firmwareApproved"]:
        status = "firmware_field_validation_required"
    elif not gates["capabilityEnabled"] or not gates["commandContractPresent"]:
        status = "action_field_validation_required"
    else:
        status = "blocked_by_runtime_gate"

    return {
        "tag": generator.get("tag"),
        "generatorId": generator.get("id"),
        "controllerModel": model,
        "action": action,
        "status": status,
        "productionReady": production_ready,
        "packId": (pack or {}).get("packId"),
        "packLifecycle": (pack or {}).get("lifecycle"),
        "packStatus": (pack or {}).get("status"),
        "firmwareInventory": firmwares,
        "firmwareDetail": firmware_detail,
        "binding": binding,
        "candidate": candidate,
        "contract": contract,
        "gates": gates,
    }


def build_matrix() -> list[dict]:
    rows: list[dict] = []
    for generator in db.list_generators():
        if not generator.get("enabled"):
            continue
        for action in COMMAND_CAPABILITIES:
            rows.append(action_readiness(generator, action))
    return rows


def evidence_template(generator: dict, action: str) -> dict:
    readiness = action_readiness(generator, action)
    candidate = readiness.get("candidate")
    if not candidate or not candidate.get("documented"):
        raise ValueError(
            f"{generator.get('tag')} {action}: não há candidato documental suficiente para ensaio"
        )
    firmware = readiness.get("firmwareInventory") or []
    return {
        "schema": 1,
        "tag": generator.get("tag"),
        "generatorId": generator.get("id"),
        "controllerModel": generator.get("controller_model"),
        "firmware": firmware[0] if len(firmware) == 1 else "",
        "action": action,
        "candidate": candidate,
        "executedAt": "",
        "operator": "",
        "witness": "",
        "physicalIsolationConfirmed": False,
        "emergencyStopAvailable": False,
        "preconditionsObserved": {},
        "controllerResponse": {},
        "feedbackObserved": {},
        "result": {
            "accepted": False,
            "feedbackConfirmed": False,
            "safeFinalStateConfirmed": False,
        },
        "notes": "",
    }


def validate_evidence(payload: dict) -> list[str]:
    errors: list[str] = []
    for key in ("tag", "controllerModel", "firmware", "action", "executedAt", "operator", "witness"):
        if not str(payload.get(key) or "").strip():
            errors.append(f"{key} ausente")
    action = str(payload.get("action") or "").strip().lower()
    if action not in COMMAND_CAPABILITIES:
        errors.append("action inválida")
    if payload.get("physicalIsolationConfirmed") is not True:
        errors.append("isolamento/condição física de ensaio não confirmado")
    if payload.get("emergencyStopAvailable") is not True:
        errors.append("parada de emergência não confirmada")
    result = payload.get("result")
    if not isinstance(result, dict):
        errors.append("result ausente")
    else:
        if result.get("accepted") is not True:
            errors.append("controladora não confirmou aceite")
        if result.get("feedbackConfirmed") is not True:
            errors.append("feedback pós-comando não confirmado")
        if result.get("safeFinalStateConfirmed") is not True:
            errors.append("estado final seguro não confirmado")
    if not isinstance(payload.get("controllerResponse"), dict) or not payload.get("controllerResponse"):
        errors.append("controllerResponse ausente")
    if not isinstance(payload.get("feedbackObserved"), dict) or not payload.get("feedbackObserved"):
        errors.append("feedbackObserved ausente")
    try:
        datetime.fromisoformat(str(payload.get("executedAt") or "").replace("Z", "+00:00"))
    except ValueError:
        if str(payload.get("executedAt") or "").strip():
            errors.append("executedAt inválido")
    return errors


def promotion_proposal(payload: dict) -> dict:
    errors = validate_evidence(payload)
    if errors:
        raise ValueError("evidência inválida: " + "; ".join(errors))

    model = str(payload["controllerModel"])
    action = str(payload["action"]).strip().lower()
    firmware = str(payload["firmware"]).strip()
    pack = pack_for_model(model)
    if not pack:
        raise ValueError(f"Controller Pack não encontrado para {model}")
    candidate = ((pack.get("homologationCandidates") or {}).get(action) or {})
    if not candidate.get("documented"):
        raise ValueError("ação sem candidato documental")

    tested = list(((pack.get("firmware") or {}).get("tested") or []))
    if firmware not in tested:
        tested.append(firmware)

    if str(pack.get("packId") or "") == "dse/dse-gencomm-v1":
        return {
            "packId": pack.get("packId"),
            "controllerModel": model,
            "action": action,
            "requiresModelSpecificPack": True,
            "proposedChanges": {
                "createModelSpecificProductionPackFor": model,
                f"capabilities.{action}": True,
                "firmware.tested": [firmware],
                "commands": "requires reviewed model-specific GenComm production contract",
                "validation.field": True,
                "validation.fieldReference": (
                    f"{payload['tag']} / FW {firmware} / {action.upper()} / {payload['executedAt']} / "
                    f"operator={payload['operator']} / witness={payload['witness']}"
                ),
            },
            "note": (
                "PROPOSAL ONLY: DSE GenComm read-only pack is shared by many aliases; "
                "command evidence must create a model-specific pack and never mutate the shared pack."
            ),
        }

    return {
        "packId": pack.get("packId"),
        "controllerModel": model,
        "action": action,
        "proposedChanges": {
            f"capabilities.{action}": True,
            "firmware.tested": sorted(set(tested)),
            "commands": (
                {action: candidate.get("contract")}
                if isinstance(candidate.get("contract"), dict)
                else "requires reviewed production command contract before promotion"
            ),
            "validation.field": True,
            "validation.fieldReferenceAppend": (
                f"{payload['tag']} / FW {firmware} / {action.upper()} / {payload['executedAt']} / "
                f"operator={payload['operator']} / witness={payload['witness']}"
            ),
        },
        "note": "PROPOSAL ONLY: this function never edits a Controller Pack or enables a command.",
    }
