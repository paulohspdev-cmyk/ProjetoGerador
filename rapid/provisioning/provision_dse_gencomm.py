#!/usr/bin/env python3
"""Provisiona em lote controladoras DSE GenComm homologadas para leitura.

O script nunca habilita comandos. Ele somente aceita Controller Packs DSE de
produção cujo contrato seja estritamente read-only e reinicia o Rapid SCADA uma
única vez ao final do lote.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(os.environ.get("RC_PROJECT_ROOT", "/opt/rc-geradores"))
sys.path.insert(0, str(BASE / "backend"))
sys.path.insert(0, str(BASE / "rapid/provisioning"))

from app import db  # noqa: E402
from app.controller_library import pack_for_model, pack_is_production_ready  # noqa: E402
from provision_generator import provision  # noqa: E402

COMMAND_CAPABILITIES = (
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


def _is_dse_generator(generator: dict) -> bool:
    controller_type = str(generator.get("controller_type") or "").strip().lower()
    model = str(generator.get("controller_model") or "").strip().lower()
    return controller_type == "dse" or model.startswith("dse")


def _safe_read_only_pack(pack: dict | None) -> bool:
    if not pack or str(pack.get("manufacturer") or "").strip().upper() != "DSE":
        return False
    capabilities = dict(pack.get("capabilities") or {})
    mapping = dict(pack.get("mapping") or {})
    rapid = dict(pack.get("rapid") or {})
    return (
        pack_is_production_ready(pack)
        and capabilities.get("telemetry") is True
        and mapping.get("readOnly") is True
        and bool(mapping.get("registers"))
        and bool(rapid.get("template"))
        and bool(rapid.get("channels"))
        and not any(bool(capabilities.get(name)) for name in COMMAND_CAPABILITIES)
    )


def _restart_rapid() -> None:
    subprocess.run(["systemctl", "start", "scadaserver6.service"], check=False)
    time.sleep(2)
    subprocess.run(["systemctl", "restart", "scadacomm6.service"], check=False)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Provisiona DSE GenComm de produção somente leitura no Rapid SCADA."
    )
    parser.add_argument(
        "--generator-id",
        action="append",
        default=[],
        help="ID interno do gerador. Pode ser repetido. Sem esta opção, processa todas as DSE.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o que seria provisionado sem alterar Rapid SCADA ou banco.",
    )
    args = parser.parse_args()

    if os.geteuid() != 0 and not args.dry_run:
        raise PermissionError("Provisionamento DSE no Rapid SCADA exige root")

    db.init_db()
    generators = [item for item in db.list_generators() if _is_dse_generator(item)]
    wanted = {str(item).strip() for item in args.generator_id if str(item).strip()}
    if wanted:
        generators = [item for item in generators if str(item.get("id")) in wanted]
        missing = sorted(wanted - {str(item.get("id")) for item in generators})
    else:
        missing = []

    report: dict[str, object] = {
        "dryRun": bool(args.dry_run),
        "selected": len(generators),
        "missing": missing,
        "provisioned": [],
        "candidates": [],
        "registrationOnly": [],
        "errors": [],
    }
    changed = False

    try:
        for generator in generators:
            model = str(generator.get("controller_model") or "").strip()
            pack = pack_for_model(model)
            identity = {
                "generatorId": generator.get("id"),
                "tag": generator.get("tag"),
                "model": model,
                "port": generator.get("listen_port"),
                "unit": generator.get("modbus_unit"),
            }

            if not _safe_read_only_pack(pack):
                report["registrationOnly"].append(
                    {
                        **identity,
                        "reason": "sem pack DSE GenComm de produção somente leitura documentado",
                    }
                )
                continue

            if args.dry_run:
                report["candidates"].append(
                    {
                        **identity,
                        "packId": pack.get("packId"),
                        "status": pack.get("status"),
                    }
                )
                continue

            try:
                result = provision(str(generator["id"]), restart=False)
                changed = True
                report["provisioned"].append(
                    {
                        **identity,
                        "packId": pack.get("packId"),
                        "reconciled": bool(result.get("reconciled")),
                        "changes": list(result.get("changes") or []),
                    }
                )
            except Exception as exc:  # relatório de lote; mantém os demais itens
                report["errors"].append({**identity, "error": f"{type(exc).__name__}: {exc}"})
    finally:
        if changed:
            _restart_rapid()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["errors"] or missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
