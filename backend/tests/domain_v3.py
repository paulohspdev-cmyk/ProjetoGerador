import os
import tempfile
from pathlib import Path

# Isola completamente o banco do teste antes de importar app.config/db.
tmp = tempfile.TemporaryDirectory(prefix="rc-domain-v3-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "domain-v3.db")
os.environ["RC_ENABLE_IG200_CONTROL"] = "0"

from app import db, domain_bundle, domain_store  # noqa: E402
from app.controller_library import catalog_for_model, library_summary, pack_for_model  # noqa: E402


db.init_db()
domain_store.init_domain_db()

library = library_summary()
catalog = library["catalog"]
assert len(catalog) >= 100, len(catalog)
assert {item["manufacturer"] for item in catalog} >= {"ComAp", "DSE"}

ig200 = catalog_for_model("InteliGen 200")
assert ig200 and ig200["provisionable"] is True
assert ig200["packLifecycle"] == "production"
pack = pack_for_model("IG200")
assert pack and pack["schema"] == 3
assert pack["capabilities"]["start"] is True
assert pack["capabilities"]["stop"] is True
for forbidden in ("auto", "manual", "test", "mcb_open", "mcb_close", "gcb_open", "gcb_close", "paralleling"):
    assert pack["capabilities"][forbidden] is False, forbidden

# O catálogo não transforma modelos ainda não homologados em produção.
dse335 = catalog_for_model("DSE335")
assert dse335 and dse335["provisionable"] is False
assert not dse335.get("packLifecycle")

# Compatibilidade: geradores legados ganham Asset/Controller/Connection estáveis.
generator = db.create_generator(
    {
        "tag": "GEN001",
        "name": "Gerador 01",
        "customer": "",
        "site": "Site A",
        "controller_type": "COMAP",
        "controller_model": "InteliGen 200",
        "transport": "reverse_tcp",
        "host": "",
        "listen_port": 15001,
        "modbus_unit": 2,
        "rapid_device_num": 200,
        "enabled": True,
    },
    actor="test",
)
assert domain_store.sync_legacy_generators() == 1
snapshot = domain_store.topology_snapshot()
assert snapshot["counts"] == {"assets": 1, "controllers": 1, "connections": 1, "links": 0}
legacy_asset = snapshot["assets"][0]
assert legacy_asset["legacy_generator_id"] == generator["id"]
assert legacy_asset["kind"] == "genset"
assert legacy_asset["controllers"][0]["pack_lifecycle"] == "production"
assert legacy_asset["controllers"][0]["connections"][0]["modbus_unit"] == 2

# ATS pode existir como asset próprio sem virar "gerador" e sem obter poderes
# industriais apenas por estar no catálogo.
bundle = domain_bundle.create_equipment_bundle(
    {
        "asset": {"tag": "ATS001", "name": "ATS principal", "kind": "ats", "site": "Site A"},
        "controller": {"model": "DSE335"},
        "connection": {"transport": "modbus_tcp_direct", "host": "10.10.10.50", "listen_port": 502, "modbus_unit": 1},
    },
    actor="test",
)
assert bundle["asset"]["kind"] == "ats"
assert bundle["controller"]["manufacturer"] == "DSE"
assert bundle["provisionable"] is False
assert bundle["pack"] is None

# Classificação errada deve falhar fechada.
try:
    domain_bundle.create_equipment_bundle(
        {
            "asset": {"tag": "BESS-ERRADO", "kind": "genset", "site": "Site A"},
            "controller": {"model": "InteliNeo 530 BESS"},
        },
        actor="test",
    )
except ValueError as exc:
    assert "asset kind bess" in str(exc)
else:
    raise AssertionError("bundle aceitou aplicação BESS como genset")

# Sincronização é idempotente: não duplica o legado nem altera o ATS.
assert domain_store.sync_legacy_generators() == 1
snapshot = domain_store.topology_snapshot()
assert snapshot["counts"]["assets"] == 2
assert snapshot["counts"]["controllers"] == 2
assert snapshot["counts"]["connections"] == 2

print("RC Geradores domain v3 smoke: OK")
tmp.cleanup()
