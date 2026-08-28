import json
from collections import Counter, defaultdict
from pathlib import Path

from .config import PROJECT_ROOT


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


def library_summary() -> dict:
    packs = list_controller_packs()
    manufacturers: dict[str, dict] = {}
    protocols = Counter()
    transports = Counter()

    for pack in packs:
        manufacturer = str(pack.get("manufacturer") or "Desconhecido")
        item = manufacturers.setdefault(
            manufacturer,
            {
                "id": manufacturer.lower().replace(" ", "-"),
                "name": manufacturer,
                "models": 0,
                "production": 0,
                "lab": 0,
            },
        )
        item["models"] += 1
        item[pack.get("lifecycle") or "lab"] += 1
        for proto in pack.get("protocols") or []:
            protocols[str(proto)] += 1
        for transport in pack.get("transports") or []:
            transports[str(transport)] += 1

    return {
        "packs": packs,
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
        },
    }


def pack_for_model(model: str) -> dict | None:
    wanted = str(model or "").strip().lower()
    for pack in list_controller_packs():
        names = [pack.get("model"), *(pack.get("aliases") or [])]
        if any(str(name or "").strip().lower() == wanted for name in names):
            return pack
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
