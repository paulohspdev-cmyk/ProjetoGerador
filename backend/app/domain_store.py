"""Domínio v3 da plataforma RC Geradores.

O produto legado modela `generator -> controller -> connection` em uma única
linha. Este módulo introduz entidades separadas sem quebrar os endpoints atuais:

Site -> Asset -> Controller Instance -> Connection

Assets permitem representar gerador, rede, ATS, barramento, BESS, motor,
switchgear, torre e outros equipamentos. A migração dos geradores existentes é
idempotente e mantém o cadastro legado como fonte compatível durante a transição.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from . import db
from .controller_library import catalog_for_model, pack_for_model

ASSET_KINDS = {
    "genset",
    "mains",
    "ats",
    "bus",
    "bess",
    "engine",
    "switchgear",
    "light_tower",
    "pump",
    "microgrid",
    "field_gateway",
    "other",
}

TRANSPORTS = {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp", "modbus_rtu_serial"}


def _now() -> int:
    return int(time.time())


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"))


def _from_json(value: str | None) -> dict:
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _row(row):
    if row is None:
        return None
    item = dict(row)
    for key in ("enabled",):
        if key in item:
            item[key] = bool(item[key])
    if "metadata_json" in item:
        item["metadata"] = _from_json(item.pop("metadata_json", None))
    if "config_json" in item:
        item["config"] = _from_json(item.pop("config_json", None))
    return item


def init_domain_db() -> None:
    with db.connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS assets(
                id TEXT PRIMARY KEY,
                tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                site TEXT NOT NULL DEFAULT '',
                site_id TEXT,
                customer TEXT NOT NULL DEFAULT '',
                legacy_generator_id TEXT UNIQUE,
                enabled INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_assets_site ON assets(site);
            CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);

            CREATE TABLE IF NOT EXISTS controller_instances(
                id TEXT PRIMARY KEY,
                asset_id TEXT,
                manufacturer TEXT NOT NULL,
                family TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL,
                firmware TEXT NOT NULL DEFAULT '',
                pack_id TEXT,
                pack_lifecycle TEXT,
                state TEXT NOT NULL DEFAULT 'inventory_only',
                enabled INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_controller_asset ON controller_instances(asset_id);
            CREATE INDEX IF NOT EXISTS idx_controller_model ON controller_instances(model);

            CREATE TABLE IF NOT EXISTS controller_connections(
                id TEXT PRIMARY KEY,
                controller_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT 'Principal',
                transport TEXT NOT NULL,
                host TEXT NOT NULL DEFAULT '',
                listen_port INTEGER NOT NULL DEFAULT 0,
                modbus_unit INTEGER NOT NULL DEFAULT 1,
                rapid_device_num INTEGER,
                enabled INTEGER NOT NULL DEFAULT 1,
                config_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(controller_id) REFERENCES controller_instances(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_connection_controller ON controller_connections(controller_id);
            CREATE INDEX IF NOT EXISTS idx_connection_reverse ON controller_connections(transport,listen_port,modbus_unit);

            CREATE TABLE IF NOT EXISTS asset_links(
                id TEXT PRIMARY KEY,
                from_asset_id TEXT NOT NULL,
                to_asset_id TEXT NOT NULL,
                relation TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(from_asset_id,to_asset_id,relation),
                FOREIGN KEY(from_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
                FOREIGN KEY(to_asset_id) REFERENCES assets(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_asset_links_from ON asset_links(from_asset_id);
            CREATE INDEX IF NOT EXISTS idx_asset_links_to ON asset_links(to_asset_id);
            """
        )


def _manufacturer(generator: dict, catalog: dict | None) -> str:
    if catalog and catalog.get("manufacturer"):
        return str(catalog["manufacturer"])
    kind = str(generator.get("controller_type") or "").upper()
    if kind == "COMAP":
        return "ComAp"
    if kind == "DSE":
        return "DSE"
    return kind or "Generic"


def sync_legacy_generators() -> int:
    """Espelha geradores existentes no domínio v3 de forma idempotente."""
    init_domain_db()
    generators = db.list_generators()
    count = 0
    now = _now()

    with db.connect() as conn:
        for generator in generators:
            catalog = catalog_for_model(generator.get("controller_model") or "")
            pack = pack_for_model(generator.get("controller_model") or "")
            asset_id = f"asset-{generator['id']}"
            controller_id = f"ctrl-{generator['id']}"
            connection_id = f"conn-{generator['id']}"
            manufacturer = _manufacturer(generator, catalog)
            family = str((catalog or {}).get("family") or (pack or {}).get("family") or "")
            model = str(generator.get("controller_model") or "").strip()
            pack_id = (pack or {}).get("packId")
            pack_lifecycle = (pack or {}).get("lifecycle")
            state = str((pack or {}).get("status") or (catalog or {}).get("catalogStatus") or "inventory_only")

            conn.execute(
                """
                INSERT INTO assets(id,tag,name,kind,site,site_id,customer,legacy_generator_id,enabled,metadata_json,created_at,updated_at)
                VALUES (?,?,?,?,?,NULL,?,?,?,'{}',?,?)
                ON CONFLICT(legacy_generator_id) DO UPDATE SET
                    tag=excluded.tag,
                    name=excluded.name,
                    kind='genset',
                    site=excluded.site,
                    customer=excluded.customer,
                    enabled=excluded.enabled,
                    updated_at=excluded.updated_at
                """,
                (
                    asset_id,
                    generator["tag"],
                    generator.get("name") or generator["tag"],
                    "genset",
                    generator.get("site") or "",
                    generator.get("customer") or "",
                    generator["id"],
                    1 if generator.get("enabled", True) else 0,
                    now,
                    now,
                ),
            )
            asset = conn.execute("SELECT id FROM assets WHERE legacy_generator_id=?", (generator["id"],)).fetchone()
            if not asset:
                continue
            asset_id = asset["id"]

            conn.execute(
                """
                INSERT INTO controller_instances(id,asset_id,manufacturer,family,model,firmware,pack_id,pack_lifecycle,state,enabled,metadata_json,created_at,updated_at)
                VALUES (?,?,?,?,?,'',?,?,?,?, '{}',?,?)
                ON CONFLICT(id) DO UPDATE SET
                    asset_id=excluded.asset_id,
                    manufacturer=excluded.manufacturer,
                    family=excluded.family,
                    model=excluded.model,
                    pack_id=excluded.pack_id,
                    pack_lifecycle=excluded.pack_lifecycle,
                    state=excluded.state,
                    enabled=excluded.enabled,
                    updated_at=excluded.updated_at
                """,
                (
                    controller_id,
                    asset_id,
                    manufacturer,
                    family,
                    model,
                    pack_id,
                    pack_lifecycle,
                    state,
                    1 if generator.get("enabled", True) else 0,
                    now,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO controller_connections(id,controller_id,name,transport,host,listen_port,modbus_unit,rapid_device_num,enabled,config_json,created_at,updated_at)
                VALUES (?,?,'Principal',?,?,?,?,?,?,'{}',?,?)
                ON CONFLICT(id) DO UPDATE SET
                    controller_id=excluded.controller_id,
                    transport=excluded.transport,
                    host=excluded.host,
                    listen_port=excluded.listen_port,
                    modbus_unit=excluded.modbus_unit,
                    rapid_device_num=excluded.rapid_device_num,
                    enabled=excluded.enabled,
                    updated_at=excluded.updated_at
                """,
                (
                    connection_id,
                    controller_id,
                    generator.get("transport") or "reverse_tcp",
                    generator.get("host") or "",
                    int(generator.get("listen_port") or 0),
                    int(generator.get("modbus_unit") or 1),
                    generator.get("rapid_device_num"),
                    1 if generator.get("enabled", True) else 0,
                    now,
                    now,
                ),
            )
            count += 1
    return count


def remove_legacy_generator(generator_id: str) -> None:
    init_domain_db()
    with db.connect() as conn:
        row = conn.execute("SELECT id FROM assets WHERE legacy_generator_id=?", (generator_id,)).fetchone()
        if row:
            conn.execute("DELETE FROM assets WHERE id=?", (row["id"],))


def _validate_kind(kind: str) -> str:
    kind = str(kind or "").strip().lower()
    if kind not in ASSET_KINDS:
        raise ValueError(f"Tipo de asset inválido. Permitidos: {', '.join(sorted(ASSET_KINDS))}")
    return kind


def _validate_transport(transport: str) -> str:
    transport = str(transport or "").strip()
    if transport not in TRANSPORTS:
        raise ValueError(f"Transporte inválido. Permitidos: {', '.join(sorted(TRANSPORTS))}")
    return transport


def list_assets() -> list[dict]:
    init_domain_db()
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM assets ORDER BY site COLLATE NOCASE, tag COLLATE NOCASE").fetchall()
    return [_row(row) for row in rows]


def get_asset(asset_id: str) -> dict | None:
    init_domain_db()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM assets WHERE id=? OR lower(tag)=lower(?)", (asset_id, asset_id)).fetchone()
    return _row(row)


def create_asset(data: dict, actor: str = "system") -> dict:
    init_domain_db()
    now = _now()
    asset_id = str(data.get("id") or f"asset-{uuid.uuid4().hex[:12]}")
    tag = str(data.get("tag") or "").strip().upper()
    if not tag:
        raise ValueError("Tag do asset é obrigatória")
    kind = _validate_kind(data.get("kind") or "other")
    record = (
        asset_id,
        tag,
        str(data.get("name") or tag).strip(),
        kind,
        str(data.get("site") or "").strip(),
        data.get("site_id"),
        str(data.get("customer") or "").strip(),
        1 if data.get("enabled", True) else 0,
        _json(data.get("metadata")),
        now,
        now,
    )
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO assets(id,tag,name,kind,site,site_id,customer,enabled,metadata_json,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            record,
        )
    db.add_audit(actor, "create", "asset", asset_id, f"tag={tag};kind={kind}")
    return get_asset(asset_id)


def update_asset(asset_id: str, patch: dict, actor: str = "system") -> dict | None:
    current = get_asset(asset_id)
    if not current:
        return None
    allowed = {"tag", "name", "kind", "site", "site_id", "customer", "enabled", "metadata"}
    fields: list[str] = []
    values: list[Any] = []
    detail: list[str] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        column = key
        if key == "kind":
            value = _validate_kind(value)
        elif key == "tag":
            value = str(value).strip().upper()
        elif key == "enabled":
            value = 1 if bool(value) else 0
        elif key == "metadata":
            column = "metadata_json"
            value = _json(value)
        fields.append(f"{column}=?")
        values.append(value)
        detail.append(key)
    if not fields:
        return current
    fields.append("updated_at=?")
    values.append(_now())
    values.append(current["id"])
    with db.connect() as conn:
        conn.execute(f"UPDATE assets SET {', '.join(fields)} WHERE id=?", values)
    db.add_audit(actor, "update", "asset", current["id"], ",".join(detail))
    return get_asset(current["id"])


def delete_asset(asset_id: str, actor: str = "system") -> bool:
    current = get_asset(asset_id)
    if not current:
        return False
    if current.get("legacy_generator_id"):
        raise ValueError("Asset legado de gerador deve ser removido pelo fluxo de geradores para manter compatibilidade")
    with db.connect() as conn:
        conn.execute("DELETE FROM assets WHERE id=?", (current["id"],))
    db.add_audit(actor, "delete", "asset", current["id"], current["tag"])
    return True


def list_controllers(asset_id: str | None = None) -> list[dict]:
    init_domain_db()
    with db.connect() as conn:
        if asset_id:
            rows = conn.execute(
                "SELECT c.*,a.tag asset_tag,a.site asset_site FROM controller_instances c LEFT JOIN assets a ON a.id=c.asset_id WHERE c.asset_id=? ORDER BY c.model",
                (asset_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*,a.tag asset_tag,a.site asset_site FROM controller_instances c LEFT JOIN assets a ON a.id=c.asset_id ORDER BY a.site,a.tag,c.model"
            ).fetchall()
    return [_row(row) for row in rows]


def get_controller(controller_id: str) -> dict | None:
    init_domain_db()
    with db.connect() as conn:
        row = conn.execute(
            "SELECT c.*,a.tag asset_tag,a.site asset_site FROM controller_instances c LEFT JOIN assets a ON a.id=c.asset_id WHERE c.id=?",
            (controller_id,),
        ).fetchone()
    return _row(row)


def create_controller(data: dict, actor: str = "system") -> dict:
    init_domain_db()
    asset_id = data.get("asset_id")
    if asset_id and not get_asset(str(asset_id)):
        raise ValueError("Asset não encontrado")
    model = str(data.get("model") or "").strip()
    if not model:
        raise ValueError("Modelo da controladora é obrigatório")
    catalog = catalog_for_model(model)
    pack = pack_for_model(model)
    manufacturer = str(data.get("manufacturer") or (catalog or {}).get("manufacturer") or (pack or {}).get("manufacturer") or "Generic")
    family = str(data.get("family") or (catalog or {}).get("family") or (pack or {}).get("family") or "")
    controller_id = str(data.get("id") or f"ctrl-{uuid.uuid4().hex[:12]}")
    now = _now()
    with db.connect() as conn:
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
                str(data.get("firmware") or ""),
                (pack or {}).get("packId"),
                (pack or {}).get("lifecycle"),
                str((pack or {}).get("status") or (catalog or {}).get("catalogStatus") or "inventory_only"),
                1 if data.get("enabled", True) else 0,
                _json(data.get("metadata")),
                now,
                now,
            ),
        )
    db.add_audit(actor, "create", "controller", controller_id, f"{manufacturer} {model}")
    return get_controller(controller_id)


def update_controller(controller_id: str, patch: dict, actor: str = "system") -> dict | None:
    current = get_controller(controller_id)
    if not current:
        return None
    allowed = {"asset_id", "firmware", "enabled", "metadata"}
    fields: list[str] = []
    values: list[Any] = []
    detail: list[str] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        column = key
        if key == "asset_id" and value and not get_asset(str(value)):
            raise ValueError("Asset não encontrado")
        if key == "enabled":
            value = 1 if bool(value) else 0
        if key == "metadata":
            column = "metadata_json"
            value = _json(value)
        fields.append(f"{column}=?")
        values.append(value)
        detail.append(key)
    if not fields:
        return current
    fields.append("updated_at=?")
    values.append(_now())
    values.append(controller_id)
    with db.connect() as conn:
        conn.execute(f"UPDATE controller_instances SET {', '.join(fields)} WHERE id=?", values)
    db.add_audit(actor, "update", "controller", controller_id, ",".join(detail))
    return get_controller(controller_id)


def list_connections(controller_id: str | None = None) -> list[dict]:
    init_domain_db()
    with db.connect() as conn:
        if controller_id:
            rows = conn.execute("SELECT * FROM controller_connections WHERE controller_id=? ORDER BY name", (controller_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM controller_connections ORDER BY controller_id,name").fetchall()
    return [_row(row) for row in rows]


def get_connection(connection_id: str) -> dict | None:
    init_domain_db()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM controller_connections WHERE id=?", (connection_id,)).fetchone()
    return _row(row)


def create_connection(data: dict, actor: str = "system") -> dict:
    init_domain_db()
    controller_id = str(data.get("controller_id") or "")
    if not get_controller(controller_id):
        raise ValueError("Controladora não encontrada")
    transport = _validate_transport(data.get("transport") or "reverse_tcp")
    port = int(data.get("listen_port") or 0)
    unit = int(data.get("modbus_unit") or 1)
    if not 1 <= unit <= 247:
        raise ValueError("Modbus Unit ID deve ficar entre 1 e 247")
    if transport in {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp"} and not 1 <= port <= 65535:
        raise ValueError("Transporte TCP exige porta válida")
    connection_id = str(data.get("id") or f"conn-{uuid.uuid4().hex[:12]}")
    now = _now()
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO controller_connections(id,controller_id,name,transport,host,listen_port,modbus_unit,rapid_device_num,enabled,config_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                connection_id,
                controller_id,
                str(data.get("name") or "Principal"),
                transport,
                str(data.get("host") or "").strip(),
                port,
                unit,
                data.get("rapid_device_num"),
                1 if data.get("enabled", True) else 0,
                _json(data.get("config")),
                now,
                now,
            ),
        )
    db.add_audit(actor, "create", "controller_connection", connection_id, f"{transport};unit={unit};port={port}")
    return get_connection(connection_id)


def update_connection(connection_id: str, patch: dict, actor: str = "system") -> dict | None:
    current = get_connection(connection_id)
    if not current:
        return None
    allowed = {"name", "transport", "host", "listen_port", "modbus_unit", "rapid_device_num", "enabled", "config"}
    merged = {**current, **{k: v for k, v in patch.items() if k in allowed and v is not None}}
    transport = _validate_transport(merged.get("transport") or "reverse_tcp")
    port = int(merged.get("listen_port") or 0)
    unit = int(merged.get("modbus_unit") or 1)
    if not 1 <= unit <= 247:
        raise ValueError("Modbus Unit ID deve ficar entre 1 e 247")
    if transport in {"reverse_tcp", "modbus_tcp_direct", "rtu_over_tcp"} and not 1 <= port <= 65535:
        raise ValueError("Transporte TCP exige porta válida")

    fields: list[str] = []
    values: list[Any] = []
    detail: list[str] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        column = key
        if key == "transport":
            value = transport
        elif key == "modbus_unit":
            value = unit
        elif key == "listen_port":
            value = port
        elif key == "enabled":
            value = 1 if bool(value) else 0
        elif key == "config":
            column = "config_json"
            value = _json(value)
        fields.append(f"{column}=?")
        values.append(value)
        detail.append(key)
    if not fields:
        return current
    fields.append("updated_at=?")
    values.append(_now())
    values.append(connection_id)
    with db.connect() as conn:
        conn.execute(f"UPDATE controller_connections SET {', '.join(fields)} WHERE id=?", values)
    db.add_audit(actor, "update", "controller_connection", connection_id, ",".join(detail))
    return get_connection(connection_id)


def create_asset_link(from_asset_id: str, to_asset_id: str, relation: str, metadata: dict | None, actor: str = "system") -> dict:
    if not get_asset(from_asset_id) or not get_asset(to_asset_id):
        raise ValueError("Assets da relação não encontrados")
    relation = str(relation or "").strip().lower()
    if not relation:
        raise ValueError("Relação é obrigatória")
    link_id = f"link-{uuid.uuid4().hex[:12]}"
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO asset_links(id,from_asset_id,to_asset_id,relation,metadata_json,created_at) VALUES (?,?,?,?,?,?)",
            (link_id, from_asset_id, to_asset_id, relation, _json(metadata), _now()),
        )
        row = conn.execute("SELECT * FROM asset_links WHERE id=?", (link_id,)).fetchone()
    db.add_audit(actor, "create", "asset_link", link_id, f"{from_asset_id}->{to_asset_id}:{relation}")
    return _row(row)


def list_asset_links(asset_id: str | None = None) -> list[dict]:
    init_domain_db()
    with db.connect() as conn:
        if asset_id:
            rows = conn.execute(
                "SELECT * FROM asset_links WHERE from_asset_id=? OR to_asset_id=? ORDER BY created_at",
                (asset_id, asset_id),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM asset_links ORDER BY created_at").fetchall()
    return [_row(row) for row in rows]


def topology_snapshot() -> dict:
    sync_legacy_generators()
    assets = list_assets()
    controllers = list_controllers()
    connections = list_connections()
    links = list_asset_links()
    by_asset: dict[str, list[dict]] = {}
    by_controller: dict[str, list[dict]] = {}
    for controller in controllers:
        by_asset.setdefault(str(controller.get("asset_id") or ""), []).append(controller)
    for connection in connections:
        by_controller.setdefault(str(connection.get("controller_id") or ""), []).append(connection)
    for controller in controllers:
        controller["connections"] = by_controller.get(controller["id"], [])
    for asset in assets:
        asset["controllers"] = by_asset.get(asset["id"], [])
    return {"assets": assets, "links": links, "counts": {"assets": len(assets), "controllers": len(controllers), "connections": len(connections), "links": len(links)}}
