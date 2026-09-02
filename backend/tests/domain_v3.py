import os
import tempfile
from pathlib import Path

from fastapi import HTTPException

# Isola completamente o banco do teste antes de importar app.config/db.
tmp = tempfile.TemporaryDirectory(prefix="rc-domain-v3-")
os.environ["RC_DATA_DIR"] = tmp.name
os.environ["RC_DB_FILE"] = str(Path(tmp.name) / "domain-v3.db")
os.environ["RC_ENABLE_IG200_CONTROL"] = "0"

from app import db, domain_bundle, domain_store  # noqa: E402
from app.controller_library import catalog_for_model, library_summary, pack_for_model  # noqa: E402
from app.domain_routes import (  # noqa: E402
    asset_delete,
    asset_link_delete,
    connection_delete,
    controller_delete,
)


db.init_db()
domain_store.init_domain_db()
user = {"email": "test@local", "role": "administrador"}

library = library_summary()
catalog = library["catalog"]
assert len(catalog) >= 100, len(catalog)
assert {item["manufacturer"] for item in catalog} >= {"ComAp", "DSE"}

ig200 = catalog_for_model("InteliGen 200")
assert ig200 and ig200["provisionable"] is True
assert ig200["registerable"] is True
assert ig200["packLifecycle"] == "production"
pack = pack_for_model("IG200")
assert pack and pack["schema"] == 3
assert pack["capabilities"]["start"] is True
assert pack["capabilities"]["stop"] is True
for forbidden in (
    "auto",
    "manual",
    "test",
    "mcb_open",
    "mcb_close",
    "gcb_open",
    "gcb_close",
    "paralleling",
):
    assert pack["capabilities"][forbidden] is False, forbidden

# Equipamentos não-genset continuam fora do cadastro de geradores quando não
# existe fluxo técnico específico para sua aplicação.
dse335 = catalog_for_model("DSE335")
assert dse335 and dse335["application"] == "ats"
assert dse335["provisionable"] is False
assert dse335["registerable"] is False
assert dse335["onboardingMode"] == "inventory"
assert not dse335.get("packLifecycle")

# Todo modelo classificado como genset pode receber cadastro operacional mesmo
# antes da homologação do pack. Isso NÃO concede Rapid nem comandos.
intelicompact_mint = catalog_for_model("InteliCompact NT MINT")
assert intelicompact_mint and intelicompact_mint["application"] == "genset"
assert intelicompact_mint["registerable"] is True
assert intelicompact_mint["provisionable"] is False
assert intelicompact_mint["onboardingMode"] == "inventory"
assert not intelicompact_mint.get("packLifecycle")
assert not any(
    intelicompact_mint.get("capabilities", {}).get(name)
    for name in (
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
)

# Pack LAB estritamente read-only pode ser cadastrado para homologação, mas
# jamais é promovido a provisionamento/controle industrial.
dse8610 = catalog_for_model("DSE8610 MKII")
assert dse8610 and dse8610["packLifecycle"] == "lab"
assert dse8610["registerable"] is True
assert dse8610["onboardingMode"] == "lab_read_only"
assert dse8610["provisionable"] is False
assert dse8610["capabilities"]["telemetry"] is True
assert not any(
    dse8610["capabilities"].get(name)
    for name in ("start", "stop", "auto", "manual", "test", "mcb_open", "mcb_close", "gcb_open", "gcb_close", "paralleling")
)

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
legacy_controller = legacy_asset["controllers"][0]
legacy_connection = legacy_controller["connections"][0]
assert legacy_asset["legacy_generator_id"] == generator["id"]
assert legacy_asset["kind"] == "genset"
assert legacy_controller["pack_lifecycle"] == "production"
assert legacy_connection["modbus_unit"] == 2

# Espelhos legacy não podem ser apagados pelo domínio v3.
for remover, item_id in (
    (asset_delete, legacy_asset["id"]),
    (controller_delete, legacy_controller["id"]),
    (connection_delete, legacy_connection["id"]),
):
    try:
        remover(item_id, user=user)
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError(f"espelho legacy foi removido por {remover.__name__}")

# ATS pode existir como asset próprio sem virar "gerador" e sem obter poderes
# industriais apenas por estar no catálogo.
bundle = domain_bundle.create_equipment_bundle(
    {
        "asset": {"tag": "ATS001", "name": "ATS principal", "kind": "ats", "site": "Site A"},
        "controller": {"model": "DSE335"},
        "connection": {
            "transport": "modbus_tcp_direct",
            "host": "10.10.10.50",
            "listen_port": 502,
            "modbus_unit": 1,
        },
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

# Lifecycle de remoção v3: nada de cascade implícito nem remoção ativa.
try:
    asset_delete(bundle["asset"]["id"], user=user)
except HTTPException as exc:
    assert exc.status_code == 409
    assert "controladora" in str(exc.detail).lower()
else:
    raise AssertionError("asset com controladora foi removido por cascade")

try:
    connection_delete(bundle["connection"]["id"], user=user)
except HTTPException as exc:
    assert exc.status_code == 409
    assert "desative" in str(exc.detail).lower()
else:
    raise AssertionError("conexão ativa foi removida")

domain_store.update_connection(bundle["connection"]["id"], {"enabled": False}, actor="test")
assert connection_delete(bundle["connection"]["id"], user=user).status_code == 204
assert controller_delete(bundle["controller"]["id"], user=user).status_code == 204

# Vínculos de topologia também precisam de remoção explícita antes do asset.
link = domain_store.create_asset_link(
    bundle["asset"]["id"],
    legacy_asset["id"],
    "feeds",
    {},
    actor="test",
)
try:
    asset_delete(bundle["asset"]["id"], user=user)
except HTTPException as exc:
    assert exc.status_code == 409
    assert "topologia" in str(exc.detail).lower()
else:
    raise AssertionError("asset vinculado na topologia foi removido")
assert asset_link_delete(link["id"], user=user).status_code == 204
assert asset_delete(bundle["asset"]["id"], user=user).status_code == 204

snapshot = domain_store.topology_snapshot()
assert snapshot["counts"] == {"assets": 1, "controllers": 1, "connections": 1, "links": 0}

print("RC Geradores domain v3 smoke: OK")
tmp.cleanup()
