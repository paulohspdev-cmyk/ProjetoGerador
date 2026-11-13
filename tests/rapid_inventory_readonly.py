"""Regressão do auditor offline de inventário Rapid; usa apenas fixtures temporárias."""
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ops"))
from audit_rapid_inventory_readonly import audit  # noqa: E402


with tempfile.TemporaryDirectory(prefix="rc-rapid-audit-") as folder:
    tmp = Path(folder)
    database = tmp / "rc.db"
    bindings = tmp / "bindings.json"
    comm = tmp / "ScadaCommConfig.xml"

    with sqlite3.connect(database) as conn:
        conn.execute(
            "CREATE TABLE generators "
            "(id TEXT,tag TEXT,transport TEXT,listen_port INTEGER,"
            "modbus_unit INTEGER,rapid_device_num INTEGER,enabled INTEGER)"
        )
        conn.execute("CREATE TABLE field_device_links (generator_id TEXT)")
        conn.execute(
            "CREATE TABLE generator_telemetry_snapshots "
            "(generator_id TEXT,updated_at INTEGER)"
        )
        conn.executemany(
            "INSERT INTO generators VALUES (?,?,?,?,?,?,?)",
            [
                ("gen-a", "GENA", "reverse_tcp", 15001, 1, 221, 1),
                ("gen-b", "GENB", "reverse_tcp", 15002, 2, 224, 1),
                ("gen-c", "GENC", "modbus_tcp_direct", None, 1, 230, 0),
            ],
        )
        conn.execute("INSERT INTO field_device_links VALUES ('gen-a')")
        conn.execute(
            "INSERT INTO generator_telemetry_snapshots VALUES ('gen-a',1000)"
        )

    bindings.write_text(
        json.dumps([{"generator_id": "gen-a", "rapid_device_num": 221}]),
        encoding="utf-8",
    )
    comm.write_text(
        '<ScadaCommConfig><Lines><Line>'
        '<Device number="1"/><Device number="221"/>'
        '</Line></Lines></ScadaCommConfig>',
        encoding="utf-8",
    )
    output = audit(database, bindings, comm, now=1001)
    assert output["summary"]["generators"] == 3
    assert output["missingBindings"] == ["GENB"]
    assert output["missingRapidDevices"] == [{"tag": "GENB", "device": 224}]
    assert output["missingReverseTcpModemLinks"] == [
        {"tag": "GENB", "port": 15002, "unit": 2}
    ]
    assert output["snapshotMissingOrOlderThan1h"] == ["GENB"]
    assert output["unassignedRapidDevices"] == [1]

    # O auditor não altera bancos nem arquivos.
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT COUNT(*) FROM generators").fetchone()[0] == 3

    bindings.write_text(json.dumps([{"generator_id": "gen-a", "rapid_device_num": 222}]))
    mismatched = audit(database, bindings, comm, now=1001)
    assert mismatched["mismatchedBindingDevices"] == [
        {"tag": "GENA", "configured": 221, "binding": 222}
    ]

print("Rapid inventory read-only audit: OK")
