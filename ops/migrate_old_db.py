#!/usr/bin/env python3
"""Importa somente cadastro de geradores do antigo rc-scada.

Não altera nem remove o banco antigo. Telemetria/histórico não são migrados,
pois continuam pertencendo ao Rapid SCADA.
"""

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import db  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="/var/lib/rc-scada/scada.db")
    parser.add_argument(
        "--old-rtu-mode",
        choices=("reverse_tcp", "rtu_over_tcp"),
        default="reverse_tcp",
        help="Como interpretar o antigo transport=rtu_over_tcp. O sistema anterior usava bridge reversa por padrão.",
    )
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_file():
        raise SystemExit(f"Banco antigo não encontrado: {source}")

    db.init_db()
    existing = {item["tag"].upper() for item in db.list_generators()}

    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    try:
        rows = src.execute(
            """
            SELECT code, name, customer, site, controller_type, controller_model,
                   transport, modbus_unit, listen_port, enabled
            FROM generators
            ORDER BY listen_port, modbus_unit, code
            """
        ).fetchall()
    finally:
        src.close()

    imported = 0
    skipped = 0
    for row in rows:
        tag = str(row["code"]).strip().upper()
        if tag in existing:
            print(f"SKIP {tag}: já existe")
            skipped += 1
            continue

        old_transport = str(row["transport"] or "").strip()
        if old_transport == "modbus_tcp":
            transport = "modbus_tcp_direct"
        elif old_transport == "rtu_over_tcp":
            transport = args.old_rtu_mode
        else:
            transport = "reverse_tcp"

        created = db.create_generator(
            {
                "tag": tag,
                "name": row["name"] or tag,
                "customer": row["customer"] or "",
                "site": row["site"] or "Sem site",
                "controller_type": row["controller_type"] or "GENERIC",
                "controller_model": row["controller_model"] or "",
                "transport": transport,
                "host": "",
                "listen_port": int(row["listen_port"] or 0),
                "modbus_unit": int(row["modbus_unit"] or 1),
                "rapid_device_num": None,
                "enabled": bool(row["enabled"]),
            }
        )
        existing.add(tag)
        imported += 1
        print(
            f"OK   {created['tag']}: {created['controller_type']} {created['controller_model']} "
            f"{created['transport']} TCP {created['listen_port']} Unit {created['modbus_unit']}"
        )

    print(f"Importação concluída: {imported} importado(s), {skipped} ignorado(s).")


if __name__ == "__main__":
    main()
