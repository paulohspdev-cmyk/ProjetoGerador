import json
from collections import Counter
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator

from .config import PROJECT_ROOT

CATALOG_FILE = PROJECT_ROOT / "controllers" / "catalog" / "catalog-v1.json"
PACK_SCHEMA_FILE = PROJECT_ROOT / "controllers" / "schema" / "controller-pack-v3.schema.json"
SUPPORTED_PACK_SCHEMA = 3


def _norm(value: object) -> str:
    return " ".join(str(value or "").strip().lower().split())


@lru_cache(maxsize=1)
def _pack_validator() -> Draft202012Validator:
    try:
        schema = json.loads(PACK_SCHEMA_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Schema de Controller Pack inválido em {PACK_SCHEMA_FILE}: {exc}") from exc
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _validate_pack_schema(data: dict, path: Path) -> None:
    errors = sorted(_pack_validator().iter_errors(data), key=lambda error: list(error.absolute_path))
    if not errors:
        return
    parts = []
    for error in errors[:20]:
        location = ".".join(str(item) for item in error.absolute_path) or "<raiz>"
        parts.append(f"{location}: {error.message}")
    raise ValueError(f"Controller Pack fora do schema v3 em {path}: " + "; ".join(parts))


def pack_is_production_ready(pack: dict | None) -> bool:
    if not pack:
        return False
    return (
        pack.get("lifecycle") == "production"
        and str(pack.get("status") or "") == "field_validated"
        and int(pack.get("schema") or 0) == SUPPORTED_PACK_SCHEMA
    )


def pack_is_lab_onboarding_ready(pack: dict | None) -> bool:
    """Permite cadastro LAB somente quando o pack é estritamente de leitura."""
    if not pack:
        return False
    capabilities = dict(pack.get("capabilities") or {})
    mapping = dict(pack.get("mapping") or {})
    command_capabilities = (
        "start",
        "stop",
        "auto",
        "manual",
        "test",
        "mcb_open",
        "mcb_close",
        "gcb_open",
        "gcb_close",
        "paralleling",
    )
    return (
        pack.get("lifecycle") == "lab"
        and int(pack.get("schema") or 0) == SUPPORTED_PACK_SCHEMA
        and capabilities.get("telemetry") is True
        and mapping.get("readOnly") is True
        and bool(mapping.get("registers"))
        and not any(bool(capabilities.get(name)) for name in command_capabilities)
    )


def _read_manifest(path: Path, lifecycle: str) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Controller Pack inválido em {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Controller Pack inválido em {path}: raiz JSON deve ser objeto")
    _validate_pack_schema(data, path)
    rel = path.relative_to(PROJECT_ROOT).as_posix()
    effective_lifecycle = lifecycle
    if lifecycle == "production" and not (
        str(data.get("status") or "") == "field_validated"
        and int(data.get("schema") or 0) == SUPPORTED_PACK_SCHEMA
    ):
        effective_lifecycle = "invalid_production"
    return {
        **data,
        "lifecycle": effective_lifecycle,
        "declaredLifecycle": lifecycle,
        "manifestPath": rel,
        "packId": "/".join(path.parent.relative_to(PROJECT_ROOT / "controllers" / lifecycle).parts),
    }


def list_controller_packs() -> list[dict]:
    result: list[dict] = []
    for lifecycle in ("production", "lab"):
        root = PROJECT_ROOT / "controllers" / lifecycle
        if not root.exists():
            continue
        for path in sorted(root.rglob("manifest.json")):
            result.append(_read_manifest(path, lifecycle))
    return result


def list_controller_catalog() -> list[dict]:
    """Lista catálogo comercial/alvo sem transformar inventário em homologação."""
    if not CATALOG_FILE.exists():
        return []
    try:
        raw = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Catálogo de controladoras inválido: {exc}") from exc
    rows = raw.get("controllers") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        raise ValueError("Catálogo de controladoras inválido: controllers deve ser lista")

    result: list[dict] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or not str(row.get("model") or "").strip():
            raise ValueError(f"Entrada inválida no catálogo de controladoras: índice {index}")
        manufacturer = str(row.get("manufacturer") or "Desconhecido").strip()
        family = str(row.get("family") or "Outros").strip()
        model = str(row["model"]).strip()
        result.append(
            {
                **row,
                "catalogId": row.get("catalogId") or f"catalog-{index:03d}",
                "manufacturer": manufacturer,
                "family": family,
                "model": model,
                "application": str(row.get("application") or "other"),
                "category": str(row.get("category") or "other"),
                "catalogStatus": str(row.get("status") or "inventory_only"),
                "provisionable": False,
                "registerable": False,
                "onboardingMode": "inventory",
            }
        )
    return result


def _pack_name_index(packs: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for pack in packs:
        names = [pack.get("model"), *(pack.get("aliases") or [])]
        for name in names:
            key = _norm(name)
            if key and key not in index:
                index[key] = pack
    return index


def _pack_telemetry_state(pack: dict | None) -> dict:
    if not pack:
        return {
            "validatedTelemetry": [],
            "documentedTelemetry": [],
            "metricUnits": {},
            "metricLimits": {},
        }
    return {
        "validatedTelemetry": list(pack.get("validatedTelemetry") or []),
        "documentedTelemetry": list(pack.get("documentedTelemetry") or []),
        "metricUnits": dict(pack.get("metricUnits") or {}),
        "metricLimits": dict(pack.get("metricLimits") or {}),
    }


def _firmware_state(pack: dict | None) -> dict:
    firmware = (pack or {}).get("firmware") or {}
    tested = [str(item) for item in (firmware.get("tested") or []) if str(item).strip()]
    return {
        "testedFirmware": tested,
        "firmwareMatrixComplete": bool(tested),
    }


def controller_catalog_with_state(packs: list[dict] | None = None) -> list[dict]:
    packs = packs if packs is not None else list_controller_packs()
    by_name = _pack_name_index(packs)
    catalog = list_controller_catalog()
    result: list[dict] = []
    seen: set[str] = set()

    for row in catalog:
        key = _norm(row.get("model"))
        pack = by_name.get(key)
        seen.add(key)
        result.append(
            {
                **row,
                "packId": pack.get("packId") if pack else None,
                "packLifecycle": pack.get("lifecycle") if pack else None,
                "packStatus": pack.get("status") if pack else None,
                "schema": pack.get("schema") if pack else None,
                "protocols": list(pack.get("protocols") or []) if pack else [],
                "transports": list(pack.get("transports") or []) if pack else [],
                "capabilities": dict(pack.get("capabilities") or {}) if pack else {},
                **_pack_telemetry_state(pack),
                **_firmware_state(pack),
                "provisionable": pack_is_production_ready(pack),
                "registerable": pack_is_production_ready(pack)
                or pack_is_lab_onboarding_ready(pack),
                "onboardingMode": (
                    "production"
                    if pack_is_production_ready(pack)
                    else "lab_read_only"
                    if pack_is_lab_onboarding_ready(pack)
                    else "inventory"
                ),
            }
        )

    for pack in packs:
        key = _norm(pack.get("model"))
        if not key or key in seen:
            continue
        result.append(
            {
                "catalogId": f"pack-{pack.get('packId')}",
                "manufacturer": pack.get("manufacturer") or "Desconhecido",
                "family": pack.get("family") or "Outros",
                "model": pack.get("model") or pack.get("packId"),
                "application": pack.get("application") or "genset",
                "category": pack.get("category") or "pack_only",
                "catalogStatus": "pack_only",
                "packId": pack.get("packId"),
                "packLifecycle": pack.get("lifecycle"),
                "packStatus": pack.get("status"),
                "schema": pack.get("schema"),
                "protocols": list(pack.get("protocols") or []),
                "transports": list(pack.get("transports") or []),
                "capabilities": dict(pack.get("capabilities") or {}),
                **_pack_telemetry_state(pack),
                **_firmware_state(pack),
                "provisionable": pack_is_production_ready(pack),
                "registerable": pack_is_production_ready(pack)
                or pack_is_lab_onboarding_ready(pack),
                "onboardingMode": (
                    "production"
                    if pack_is_production_ready(pack)
                    else "lab_read_only"
                    if pack_is_lab_onboarding_ready(pack)
                    else "inventory"
                ),
                "notes": pack.get("notes") or "",
            }
        )

    return sorted(
        result,
        key=lambda x: (
            _norm(x.get("manufacturer")),
            _norm(x.get("family")),
            _norm(x.get("model")),
        ),
    )


def library_summary() -> dict:
    packs = list_controller_packs()
    catalog = controller_catalog_with_state(packs)
    manufacturers: dict[str, dict] = {}
    protocols = Counter()
    transports = Counter()

    for row in catalog:
        manufacturer = str(row.get("manufacturer") or "Desconhecido")
        item = manufacturers.setdefault(
            manufacturer,
            {
                "id": manufacturer.lower().replace(" ", "-"),
                "name": manufacturer,
                "models": 0,
                "production": 0,
                "lab": 0,
                "inventoryOnly": 0,
            },
        )
        item["models"] += 1
        lifecycle = row.get("packLifecycle")
        if lifecycle == "production":
            item["production"] += 1
        elif lifecycle == "lab":
            item["lab"] += 1
        else:
            item["inventoryOnly"] += 1

    for pack in packs:
        for proto in pack.get("protocols") or []:
            protocols[str(proto)] += 1
        for transport in pack.get("transports") or []:
            transports[str(transport)] += 1

    return {
        "packs": packs,
        "catalog": catalog,
        "manufacturers": sorted(manufacturers.values(), key=lambda x: x["name"].lower()),
        "protocols": [
            {"id": name, "name": name, "packs": count}
            for name, count in sorted(protocols.items())
        ],
        "transports": [
            {"id": name, "name": name, "packs": count}
            for name, count in sorted(transports.items())
        ],
        "counts": {
            "total": len(packs),
            "production": sum(pack_is_production_ready(p) for p in packs),
            "lab": sum(p.get("lifecycle") == "lab" for p in packs),
            "invalidProduction": sum(p.get("lifecycle") == "invalid_production" for p in packs),
            "catalogTotal": len(catalog),
            "catalogProvisionable": sum(bool(row.get("provisionable")) for row in catalog),
            "catalogInventoryOnly": sum(not bool(row.get("packLifecycle")) for row in catalog),
            "productionWithoutFirmwareMatrix": sum(
                bool(row.get("provisionable")) and not bool(row.get("firmwareMatrixComplete"))
                for row in catalog
            ),
        },
    }


def pack_for_model(model: str) -> dict | None:
    wanted = _norm(model)
    if not wanted:
        return None
    for pack in list_controller_packs():
        names = [pack.get("model"), *(pack.get("aliases") or [])]
        if any(_norm(name) == wanted for name in names):
            return pack
    return None


def catalog_for_model(model: str) -> dict | None:
    wanted = _norm(model)
    if not wanted:
        return None
    for row in controller_catalog_with_state():
        names = [row.get("model"), *(row.get("aliases") or [])]
        if any(_norm(name) == wanted for name in names):
            return row
    return None


def channel_catalog(bindings: list[dict]) -> list[dict]:
    rows = []
    for binding in bindings:
        model = binding.get("controller_model") or ""
        device = binding.get("rapid_device_num")
        for key, cfg in (binding.get("channels") or {}).items():
            rows.append(
                {
                    "id": f"{device or 'dev'}:{cfg.get('cnl')}",
                    "name": key,
                    "model": model,
                    "cnl": cfg.get("cnl"),
                    "scale": cfg.get("scale", 1.0),
                    "access": "R",
                    "source": "Rapid SCADA",
                }
            )
    return rows
