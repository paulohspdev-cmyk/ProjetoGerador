from __future__ import annotations

import json
import time
import uuid

from . import db, domain_store
from .controller_library import catalog_for_model, pack_for_model

APPLICATION_ASSET_KIND = {
    "genset": "genset",
    "mains": "mains",
    "ats": "ats",
    "bus": "bus",
    "bess": "bess",
    "engine": "engine",
    "light_tower": "light_tower",
    "field_gateway": "field_gateway",
    "microgrid": "microgrid",
}


def _dump(value) -> str:
    return json.dumps(value if isinstance(value, dict) else {}, ensure_ascii=False, separators=(",", ":"))


def create_equipment_bundle(payload: dict, actor: str) -> dict:
    """Cria Asset + Controller + Connection em uma única transação.

    O bundle apenas cadastra identidade e conectividade. Ele não provisiona o
    Rapid SCADA e não habilita comandos. Essa separação é proposital para que
    modelos somente de catálogo/laboratório possam ser inventariados com
    segurança sem serem confundidos com suporte industrial homologado.
    """
    domain_store.init_domain_db()
    asset_data = dict(payload.get("asset") or {})
    controller_data = dict(payload.get("controller") or {})
    connection_data = dict(payload.get("connection") or {}) if payload.get("connection") else None

    tag = str(asset_data.get("tag") or "").strip().upper()
    if not tag:
        raise ValueError("Tag do asset é obrigatória")
    kind = domain_store._validate_kind(asset_data.get("kind") or "other")

    model = str(controller_data.get("model") or "").strip()
    if not model:
        raise ValueError("Modelo da controladora é obrigatório")
    catalog = catalog_for_model(model)
    pack = pack_for_model(model)
    application = str((catalog or {}).get("application") or (pack or {}).get("application") or "other")
    expected_kind = APPLICATION_ASSET_KIND.get(application)
    if expected_kind and kind != expected_kind:
        raise ValueError(f"O modelo {model} é classificado como {application}; use asset kind {expected_kind}")

    manufacturer = str(controller_data.get("manufacturer") or (catalog or {}).get("manufacturer") or (pack or {}).get("manufacturer") or "Generic")
    family = str(controller_data.get("family") or (catalog or {}).get("family") or (pack or {}).get("family") or "")

    if connection_data:
        transport = domain_store._validate_transport(connection_data.get("transport") or "reverse_tcp")
        listen_port = int(connection_data.get("listen_port") or 0)
        modbus_unit = int(connection_data.get("modbus_unit") or 1)
        if not 1 <= modbus_unit <= 247:
            raise ValueError("Modbus Unit ID deve ficar entre 1 e 247")
        if transport in {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp"} and not 1 <= listen_port <= 65535:
            raise ValueError("Transporte TCP exige porta válida")
        host = str(connection_data.get("host") or "").strip()
        if transport in {"modbus_tcp_direct", "rtu_over_tcp", "modbus_rtu_serial"} and not host:
            raise ValueError("Transporte direto/serial exige host ou dispositivo")
    else:
        transport = ""
        listen_port = 0
        modbus_unit = 1
        host = ""

    now = int(time.time())
    asset_id = f"asset-{uuid.uuid4().hex[:12]}"
    controller_id = f"ctrl-{uuid.uuid4().hex[:12]}"
    connection_id = f"conn-{uuid.uuid4().hex[:12]}" if connection_data else None

    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO assets(id,tag,name,kind,site,site_id,customer,legacy_generator_id,enabled,metadata_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,NULL,?,?,?,?)
            """,
            (
                asset_id,
                tag,
                str(asset_data.get("name") or tag).strip(),
                kind,
                str(asset_data.get("site") or "").strip(),
                asset_data.get("site_id"),
                str(asset_data.get("customer") or "").strip(),
                1 if asset_data.get("enabled", True) else 0,
                _dump(asset_data.get("metadata")),
                now,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO controller_instances(id,asset_id,manufacturer,family,model,firmware,pack_id,pack_lifecycle,state,enabled,metadata_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                controller_id,
                asset_id,
                manufacturer,
                family,
                model,
                str(controller_data.get("firmware") or ""),
                (pack or {}).get("packId"),
                (pack or {}).get("lifecycle"),
                str((pack or {}).get("status") or (catalog or {}).get("catalogStatus") or "inventory_only"),
                1 if controller_data.get("enabled", True) else 0,
                _dump(controller_data.get("metadata")),
                now,
                now,
            ),
        )
        if connection_data and connection_id:
            conn.execute(
                """
                INSERT INTO controller_connections(id,controller_id,name,transport,host,listen_port,modbus_unit,rapid_device_num,enabled,config_json,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    connection_id,
                    controller_id,
                    str(connection_data.get("name") or "Principal"),
                    transport,
                    host,
                    listen_port,
                    modbus_unit,
                    connection_data.get("rapid_device_num"),
                    1 if connection_data.get("enabled", True) else 0,
                    _dump(connection_data.get("config")),
                    now,
                    now,
                ),
            )

    detail = f"tag={tag};kind={kind};controller={manufacturer} {model};connection={transport or 'none'}"
    db.add_audit(actor, "create_bundle", "asset", asset_id, detail)
    return {
        "asset": domain_store.get_asset(asset_id),
        "controller": domain_store.get_controller(controller_id),
        "connection": domain_store.get_connection(connection_id) if connection_id else None,
        "provisionable": bool(pack and pack.get("lifecycle") == "production"),
        "pack": {
            "id": (pack or {}).get("packId"),
            "lifecycle": (pack or {}).get("lifecycle"),
            "status": (pack or {}).get("status"),
        } if pack else None,
    }
