from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from . import db, domain_store, ops_store
from .auth import require_admin, require_edit
from .config import DATA_DIR

router = APIRouter()


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


def _client_public(row) -> dict:
    item = dict(row)
    item["active"] = bool(item.get("active", 0))
    return item


def _site_public(row) -> dict:
    item = dict(row)
    return {
        **item,
        "clientId": item.get("client_id"),
        "clientName": item.get("client_name") or "",
        "lat": item.get("latitude"),
        "lng": item.get("longitude"),
        "active": bool(item.get("active", 0)),
    }


def _agenda_public(row) -> dict:
    item = dict(row)
    return {
        **item,
        "when": item.get("when_text") or "",
        "generatorId": item.get("generator_id"),
        "enabled": bool(item.get("enabled", 0)),
    }


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    units: int | None = Field(default=None, ge=0, le=100000)
    gens: int | None = Field(default=None, ge=0, le=100000)
    sla: str | None = Field(default=None, max_length=40)
    active: bool | None = None


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    clientId: str | None = None
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    timezone: str | None = Field(default=None, max_length=80)
    active: bool | None = None


class AgendaUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=240)
    when: str | None = Field(default=None, min_length=2, max_length=120)
    site: str | None = Field(default=None, max_length=160)
    generatorId: str | None = None
    kind: str | None = Field(default=None, max_length=40)
    enabled: bool | None = None


# --------------------------- clientes --------------------------------------
@router.patch("/api/clients/{item_id}")
def client_update(item_id: str, payload: ClientUpdate, user: dict = Depends(require_edit)):
    patch = payload.model_dump(exclude_unset=True)
    allowed = {"name", "units", "gens", "sla", "active"}
    fields: list[str] = []
    values: list[object] = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key == "active":
            value = 1 if value else 0
        fields.append(f"{key}=?")
        values.append(value)
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM clients WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        if fields:
            fields.append("updated_at=strftime('%s','now')")
            try:
                conn.execute(f"UPDATE clients SET {', '.join(fields)} WHERE id=?", (*values, item_id))
            except sqlite3.IntegrityError as exc:
                raise HTTPException(status_code=409, detail="Já existe cliente com este nome") from exc
        row = conn.execute("SELECT * FROM clients WHERE id=?", (item_id,)).fetchone()
    db.add_audit(actor(user), "update", "client", item_id, ",".join(patch.keys()))
    return _client_public(row)


@router.delete("/api/clients/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def client_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM clients WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        linked = conn.execute("SELECT COUNT(*) FROM sites WHERE client_id=?", (item_id,)).fetchone()[0]
        if linked:
            raise HTTPException(status_code=409, detail=f"Cliente possui {linked} unidade(s) vinculada(s). Remova ou transfira as unidades primeiro.")
        conn.execute("DELETE FROM clients WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "client", item_id, current["name"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------- sites/unidades --------------------------------
@router.patch("/api/sites/{item_id}")
def site_update(item_id: str, payload: SiteUpdate, user: dict = Depends(require_edit)):
    patch = payload.model_dump(exclude_unset=True)
    mapping = {"clientId": "client_id"}
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM sites WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Unidade/site não encontrado")
        old_name = str(current["name"])
        if "clientId" in patch and patch["clientId"]:
            exists = conn.execute("SELECT 1 FROM clients WHERE id=?", (patch["clientId"],)).fetchone()
            if not exists:
                raise HTTPException(status_code=422, detail="Cliente vinculado não existe")
        fields: list[str] = []
        values: list[object] = []
        for key, value in patch.items():
            column = mapping.get(key, key)
            if column not in {"name", "client_id", "city", "state", "address", "latitude", "longitude", "timezone", "active"}:
                continue
            if column == "active" and value is not None:
                value = 1 if value else 0
            fields.append(f"{column}=?")
            values.append(value)
        if fields:
            fields.append("updated_at=strftime('%s','now')")
            try:
                conn.execute(f"UPDATE sites SET {', '.join(fields)} WHERE id=?", (*values, item_id))
            except sqlite3.IntegrityError as exc:
                raise HTTPException(status_code=409, detail="Já existe unidade/site com este nome") from exc
        updated = conn.execute("SELECT * FROM sites WHERE id=?", (item_id,)).fetchone()
        new_name = str(updated["name"])
        # O legado guarda o site por nome. Renomear precisa ser transacional para não
        # deixar geradores, OS, agenda e assets apontando para um nome inexistente.
        if new_name != old_name:
            conn.execute("UPDATE generators SET site=?,updated_at=strftime('%s','now') WHERE site=? COLLATE NOCASE", (new_name, old_name))
            conn.execute("UPDATE work_orders SET site=?,updated_at=strftime('%s','now') WHERE site=? COLLATE NOCASE", (new_name, old_name))
            conn.execute("UPDATE agenda SET site=?,updated_at=strftime('%s','now') WHERE site=? COLLATE NOCASE", (new_name, old_name))
            conn.execute("UPDATE assets SET site=?,site_id=?,updated_at=strftime('%s','now') WHERE site=? COLLATE NOCASE OR site_id=?", (new_name, item_id, old_name, item_id))
        row = conn.execute(
            "SELECT s.*,c.name client_name FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.id=?",
            (item_id,),
        ).fetchone()
    db.add_audit(actor(user), "update", "site", item_id, ",".join(patch.keys()))
    return _site_public(row)


@router.delete("/api/sites/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def site_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM sites WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Unidade/site não encontrado")
        name = str(current["name"])
        refs = {
            "geradores": conn.execute("SELECT COUNT(*) FROM generators WHERE site=? COLLATE NOCASE", (name,)).fetchone()[0],
            "assets": conn.execute("SELECT COUNT(*) FROM assets WHERE site=? COLLATE NOCASE OR site_id=?", (name, item_id)).fetchone()[0],
            "equipamentos": conn.execute("SELECT COUNT(*) FROM field_devices WHERE site_id=?", (item_id,)).fetchone()[0],
            "ordens de serviço": conn.execute("SELECT COUNT(*) FROM work_orders WHERE site=? COLLATE NOCASE", (name,)).fetchone()[0],
            "agenda": conn.execute("SELECT COUNT(*) FROM agenda WHERE site=? COLLATE NOCASE", (name,)).fetchone()[0],
        }
        used = {key: value for key, value in refs.items() if value}
        if used:
            detail = ", ".join(f"{key}: {value}" for key, value in used.items())
            raise HTTPException(status_code=409, detail=f"Unidade em uso ({detail}). Transfira/remova os vínculos antes de excluir.")
        conn.execute("DELETE FROM sites WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "site", item_id, name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------- agenda / OS -----------------------------------
@router.patch("/api/agenda/{item_id}")
def agenda_update(item_id: str, payload: AgendaUpdate, user: dict = Depends(require_edit)):
    patch = payload.model_dump(exclude_unset=True)
    mapping = {"when": "when_text", "generatorId": "generator_id"}
    fields: list[str] = []
    values: list[object] = []
    for key, value in patch.items():
        column = mapping.get(key, key)
        if column not in {"title", "when_text", "site", "generator_id", "kind", "enabled"}:
            continue
        if column == "enabled" and value is not None:
            value = 1 if value else 0
        fields.append(f"{column}=?")
        values.append(value)
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM agenda WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Compromisso não encontrado")
        if fields:
            fields.append("updated_at=strftime('%s','now')")
            conn.execute(f"UPDATE agenda SET {', '.join(fields)} WHERE id=?", (*values, item_id))
        row = conn.execute("SELECT * FROM agenda WHERE id=?", (item_id,)).fetchone()
    db.add_audit(actor(user), "update", "agenda", item_id, ",".join(patch.keys()))
    return _agenda_public(row)


@router.delete("/api/agenda/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def agenda_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM agenda WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Compromisso não encontrado")
        conn.execute("DELETE FROM agenda WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "agenda", item_id, current["title"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/work-orders/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def work_order_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM work_orders WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
        final = str(current["status"] or "").strip().lower()
        if final not in {"concluída", "concluida", "cancelada", "cancelado", "cancelled"}:
            raise HTTPException(status_code=409, detail="Somente OS concluída ou cancelada pode ser excluída. Finalize/cancele antes.")
        conn.execute("DELETE FROM work_orders WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "work_order", item_id, str(current["status"]))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------- automação / integrações -----------------------
@router.delete("/api/automation/rules/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def rule_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM automation_rules WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Regra não encontrada")
        if bool(current["enabled"]):
            raise HTTPException(status_code=409, detail="Desative a regra antes de excluí-la")
        conn.execute("DELETE FROM automation_rules WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "automation_rule", item_id, current["name"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/webhooks/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def webhook_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM webhooks WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Webhook não encontrado")
        conn.execute("DELETE FROM webhooks WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "webhook", item_id, f"{current['event']} {current['url']}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------- relatórios / backup ---------------------------
@router.delete("/api/reports/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def report_delete(item_id: str, user: dict = Depends(require_admin)):
    reports_dir = DATA_DIR / "reports"
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM reports WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Relatório não encontrado")
        artifact = conn.execute("SELECT * FROM report_artifacts WHERE report_id=?", (item_id,)).fetchone()
        if artifact:
            path = Path(artifact["path"])
            if _inside(path, reports_dir) and path.exists() and path.is_file():
                path.unlink()
            conn.execute("DELETE FROM report_artifacts WHERE report_id=?", (item_id,))
        conn.execute("DELETE FROM reports WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "report", item_id, current["name"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/backups/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def backup_delete(item_id: str, user: dict = Depends(require_admin)):
    backups_dir = DATA_DIR / "backups"
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM backup_records WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Backup não encontrado")
        path = Path(current["path"])
        if not _inside(path, backups_dir):
            raise HTTPException(status_code=409, detail="Caminho do backup está fora do diretório protegido")
        if path.exists() and path.is_file():
            path.unlink()
        conn.execute("DELETE FROM backup_records WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "backup", item_id, path.name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------- domínio v3 ------------------------------------
@router.delete("/api/controllers/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def controller_delete(item_id: str, user: dict = Depends(require_admin)):
    controller = domain_store.get_controller(item_id)
    if not controller:
        raise HTTPException(status_code=404, detail="Controladora não encontrada")
    asset = domain_store.get_asset(str(controller.get("asset_id") or "")) if controller.get("asset_id") else None
    if asset and asset.get("legacy_generator_id"):
        raise HTTPException(status_code=409, detail="Controladora de gerador legado deve ser retirada pelo fluxo seguro do gerador")
    connections = domain_store.list_connections(item_id)
    if bool(controller.get("enabled")) or any(bool(item.get("enabled")) for item in connections):
        raise HTTPException(status_code=409, detail="Desative a controladora e todas as conexões antes de excluir")
    with db.connect() as conn:
        conn.execute("DELETE FROM controller_instances WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "controller", item_id, str(controller.get("model") or ""))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/connections/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def connection_delete(item_id: str, user: dict = Depends(require_admin)):
    connection = domain_store.get_connection(item_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")
    controller = domain_store.get_controller(str(connection.get("controller_id") or ""))
    asset = domain_store.get_asset(str(controller.get("asset_id") or "")) if controller and controller.get("asset_id") else None
    if asset and asset.get("legacy_generator_id"):
        raise HTTPException(status_code=409, detail="Conexão de gerador legado deve ser retirada pelo fluxo seguro do gerador")
    if bool(connection.get("enabled")):
        raise HTTPException(status_code=409, detail="Desative a conexão antes de excluir")
    with db.connect() as conn:
        conn.execute("DELETE FROM controller_connections WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "controller_connection", item_id, str(connection.get("transport") or ""))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/asset-links/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def asset_link_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        current = conn.execute("SELECT * FROM asset_links WHERE id=?", (item_id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Relação de topologia não encontrada")
        conn.execute("DELETE FROM asset_links WHERE id=?", (item_id,))
    db.add_audit(actor(user), "delete", "asset_link", item_id, f"{current['from_asset_id']}->{current['to_asset_id']}:{current['relation']}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
