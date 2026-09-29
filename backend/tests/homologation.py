import json
import os
import tempfile
from pathlib import Path

tmp = tempfile.TemporaryDirectory(prefix="rc-homologation-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "test.db")
os.environ["RC_RAPID_BINDINGS"] = str(Path(tmp.name) / "bindings.json")

from app import db, domain_store  # noqa: E402
from app.controller_library import pack_for_model  # noqa: E402
from app.homologation import action_readiness, evidence_template, promotion_proposal, validate_evidence  # noqa: E402

db.init_db()

gen = db.create_generator(
    {
        "tag": "HOMO-IG200",
        "name": "Homologation IG200",
        "customer": "LAB",
        "site": "LAB",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "listen_port": 15990,
        "modbus_unit": 7,
        "rapid_device_num": 490,
        "enabled": True,
    }
)
domain_store.sync_legacy_generators()
asset = next(a for a in domain_store.list_assets() if a.get("legacy_generator_id") == gen["id"])
controller = domain_store.list_controllers(asset["id"])[0]
domain_store.update_controller(controller["id"], {"firmware": "1.8.1.1"}, actor="test")

Path(os.environ["RC_RAPID_BINDINGS"]).write_text(
    json.dumps(
        [
            {
                "generator_id": gen["id"],
                "controller_type": "COMAP",
                "controller_model": "InteliGen 200",
                "transport": "reverse_tcp",
                "listen_port": 15990,
                "modbus_unit": 7,
                "rapid_line_num": 190,
                "rapid_device_num": 490,
                "status": "field_validated",
            }
        ]
    )
)

start = action_readiness(gen, "start")
assert start["status"] == "production_ready", start
assert start["gates"]["capabilityEnabled"] is True
assert start["gates"]["commandContractPresent"] is True
assert start["gates"]["firmwareApproved"] is True

off = action_readiness(gen, "off")
assert off["status"] == "action_field_validation_required", off
assert off["candidate"]["documented"] is True
assert off["gates"]["capabilityEnabled"] is False
assert off["gates"]["commandContractPresent"] is False

gcb = action_readiness(gen, "gcb_close")
assert gcb["status"] == "action_field_validation_required", gcb
assert gcb["candidate"]["documented"] is True
assert gcb["gates"]["capabilityEnabled"] is False
assert gcb["gates"]["commandContractPresent"] is False

template = evidence_template(gen, "gcb_close")
assert template["action"] == "gcb_close"
assert template["firmware"] == "1.8.1.1"
assert validate_evidence(template)

template.update(
    {
        "executedAt": "2026-09-28T15:00:00-03:00",
        "operator": "field-technician",
        "witness": "commissioning-witness",
        "physicalIsolationConfirmed": True,
        "emergencyStopAvailable": True,
        "controllerResponse": {"return": "0x000011F0"},
        "feedbackObserved": {"gcb_closed": True},
        "result": {
            "accepted": True,
            "feedbackConfirmed": True,
            "safeFinalStateConfirmed": True,
        },
    }
)
assert validate_evidence(template) == []
proposal = promotion_proposal(template)
assert proposal["proposedChanges"]["capabilities.gcb_close"] is True
assert "1.8.1.1" in proposal["proposedChanges"]["firmware.tested"]

pack = pack_for_model("InteliGen 200")
assert pack["capabilities"]["gcb_close"] is False
assert "1.8.1.1" in (pack.get("firmware") or {}).get("tested", [])



dse_evidence = {
    "schema": 1,
    "tag": "DSE-FIELD-TEST",
    "generatorId": "evidence-only",
    "controllerModel": "DSE4520 MKII",
    "firmware": "DSE-FW-EXAMPLE",
    "action": "start",
    "candidate": {"documented": True},
    "executedAt": "2026-09-28T15:00:00-03:00",
    "operator": "field-technician",
    "witness": "commissioning-witness",
    "physicalIsolationConfirmed": True,
    "emergencyStopAvailable": True,
    "preconditionsObserved": {"control_availability": True},
    "controllerResponse": {"accepted": True},
    "feedbackObserved": {"rpm": 1500},
    "result": {
        "accepted": True,
        "feedbackConfirmed": True,
        "safeFinalStateConfirmed": True,
    },
    "notes": "synthetic unit-test evidence only",
}
dse_proposal = promotion_proposal(dse_evidence)
assert dse_proposal["requiresModelSpecificPack"] is True
assert dse_proposal["packId"] == "dse/dse-gencomm-v1"
assert dse_proposal["proposedChanges"]["createModelSpecificProductionPackFor"] == "DSE4520 MKII"

print("Homologation evidence gates: OK")
