import json
from collections import Counter
from pathlib import Path

from .config import PROJECT_ROOT

CATALOG_FILE = PROJECT_ROOT / "controllers" / "catalog" / "catalog-v1.json"


def _norm(value: object) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _read_manifest(path: Path, lifecycle: str) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return None
        rel = path.relative_to(PROJECT_ROOT).as_posix()
        return {
            **data,
            "lifecycle": lifecycle,
            "manifestPath": rel,
            "packId": "/".join(path.parent.relative_to(PROJECT_ROOT / "controllers" / lifecycle).parts),
        }
    except Exception:
        return None


def list_controller_packs() -> list[dict]:
    result: list[dict] = []
    for lifecycle in ("production", "lab"):
        root = PROJECT_ROOT / "controllers" / lifecycle
        if not root.exists():
            continue
        for path in sorted(root.rglob("manifest.json")):
            manifest = _read_manifest(path, lifecycle)
            if manifest:
                result.append(manifest)
    return result


def list_controller_catalog() -> list[dict]:
    """Lista o catálogo comercial/alvo sem transformar inventário em homologação.

    Entradas de catálogo são apenas identidade e classificação de produto. A
    existência de uma entrada aqui nunca habilita polling nem comandos. O
    provisionamento continua dependendo de um Controller Pack em production.
    """
    if not CATALOG_FILE.exists():
        return []
    try:
        raw = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows = raw.get("controllers") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        return []

    result: list[dict] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or not str(row.get("model") or "").strip():
            continue
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
        }
    return {
        "validatedTelemetry": list(pack.get("validatedTelemetry") or []),
        "documentedTelemetry": list(pack.get("documentedTelemetry") or []),
        "metricUnits": dict(pack.get("metricUnits") or {}),
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
                "provisionable": bool(pack and pack.get("lifecycle") == "production"),
            }
        )

    # Não esconder packs existentes só porque ainda não foram adicionados ao
    # catálogo comercial. Isso preserva compatibilidade com instalações atuais.
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
                "provisionable": pack.get("lifecycle") == "production",
                "notes": pack.get("notes") or "",
            }
        )

    return sorted(result, key=lambda x: (_norm(x.get("manufacturer")), _norm(x.get("family")), _norm(x.get("model"))))


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
            "production": sum(p.get("lifecycle") == "production" for p in packs),
            "lab": sum(p.get("lifecycle") == "lab" for p in packs),
            "catalogTotal": len(catalog),
            "catalogProvisionable": sum(bool(row.get("provisionable")) for row in catalog),
            "catalogInventoryOnly": sum(not bool(row.get("packLifecycle")) for row in catalog),
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
