#!/usr/bin/env python3
"""Auditoria offline, somente leitura, do inventário RC <-> bindings <-> ScadaComm.

Não acessa controladoras, não envia Modbus, não altera cadastro nem configuração.
Exemplo: python3 ops/audit_rapid_inventory_readonly.py --db /var/lib/rc-geradores/rc-geradores.db --bindings /var/lib/rc-geradores/rapid-bindings.json --comm /opt/scada/ScadaComm/Config/ScadaCommConfig.xml
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def audit(db_path: Path, bindings_path: Path, comm_path: Path, now: int | None = None) -> dict:
    """Carrega três fontes sem efetuar escrita. Lança erro se fonte estiver ilegível."""
    db_uri = db_path.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(db_uri, uri=True, timeout=4) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
        generators = [
            dict(row)
            for row in conn.execute(
                "SELECT id,tag,transport,listen_port,modbus_unit,rapid_device_num,enabled "
                "FROM generators ORDER BY tag"
            )
        ]
        linked_ids = {
            row["generator_id"]
            for row in conn.execute("SELECT DISTINCT generator_id FROM field_device_links")
        }
        snapshots = {
            row["generator_id"]: int(row["updated_at"] or 0)
            for row in conn.execute(
                "SELECT generator_id,updated_at FROM generator_telemetry_snapshots"
            )
        }

    raw_bindings = json.loads(bindings_path.read_text(encoding="utf-8"))
    if not isinstance(raw_bindings, list) or any(
        not isinstance(item, dict) for item in raw_bindings
    ):
        raise ValueError("Arquivo de bindings inválido: esperada lista de objetos")

    owned = {}
    for item in raw_bindings:
        generator_id = str(item.get("generator_id") or "").strip()
        if generator_id:
            if generator_id in owned:
                raise ValueError("Bindings duplicados para o mesmo gerador")
            owned[generator_id] = item

    root = ET.parse(comm_path).getroot()
    rapid_devices: set[int] = set()
    duplicate_devices: set[int] = set()
    for device in root.findall(".//Device"):
        number = int(device.attrib.get("number") or 0)
        if number <= 0:
            continue
        if number in rapid_devices:
            duplicate_devices.add(number)
        rapid_devices.add(number)

    current = int(time.time() if now is None else now)
    missing_bindings = []
    missing_devices = []
    mismatched_bindings = []
    missing_modem_links = []
    snapshot_missing_or_old = []
    used_devices = set()

    for generator in generators:
        if not generator["enabled"]:
            continue
        tag = generator["tag"]
        gid = generator["id"]
        device_num = int(generator["rapid_device_num"] or 0)
        binding = owned.get(str(gid))
        if device_num > 0:
            used_devices.add(device_num)
            if device_num not in rapid_devices:
                missing_devices.append({"tag": tag, "device": device_num})
        if binding is None:
            missing_bindings.append(tag)
        elif int(binding.get("rapid_device_num") or 0) != device_num:
            mismatched_bindings.append({
                "tag": tag, "configured": device_num,
                "binding": int(binding.get("rapid_device_num") or 0),
            })
        if generator["transport"] == "reverse_tcp" and gid not in linked_ids:
            missing_modem_links.append({
                "tag": tag, "port": generator["listen_port"],
                "unit": generator["modbus_unit"],
            })
        updated_at = snapshots.get(gid)
        if updated_at is None or current - updated_at > 3600:
            snapshot_missing_or_old.append(tag)

    return {
        "summary": {
            "generators": len(generators),
            "enabledGenerators": sum(bool(g["enabled"]) for g in generators),
            "bindings": len(raw_bindings),
            "rapidDevices": len(rapid_devices),
        },
        "missingBindings": missing_bindings,
        "missingRapidDevices": missing_devices,
        "mismatchedBindingDevices": mismatched_bindings,
        "missingReverseTcpModemLinks": missing_modem_links,
        "snapshotMissingOrOlderThan1h": snapshot_missing_or_old,
        "duplicateRapidDevices": sorted(duplicate_devices),
        "unassignedRapidDevices": sorted(rapid_devices - used_devices),
        "note": (
            "Auditoria cadastral, não prova conectividade atual. Dispositivos "
            "não vinculados podem incluir o simulador padrão do Rapid."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--bindings", type=Path, required=True)
    parser.add_argument("--comm", type=Path, required=True)
    parser.add_argument(
        "--fail-on-mismatch", action="store_true",
        help="Retorna código 2 se faltarem bindings/dispositivos ou houver duplicações",
    )
    args = parser.parse_args()
    try:
        report = audit(args.db, args.bindings, args.comm)
    except (OSError, sqlite3.DatabaseError, ET.ParseError, ValueError, TypeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.fail_on_mismatch and any(
        report[key] for key in (
            "missingBindings", "missingRapidDevices", "mismatchedBindingDevices",
            "duplicateRapidDevices",
        )
    ):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
