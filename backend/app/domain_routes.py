from __future__ import annotations

import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from . import domain_bundle, domain_store
from .auth import require_admin, require_create, require_edit, require_remove, require_view
from .integration_status import safe_integration_status

router = APIRouter()
PROVISION_SOCKET = os.environ.get("RC_PROVISION_SOCKET", "/run/rc-geradores/provision.sock")


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


class AssetCreate(BaseModel):
    tag: str = Field(min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=160)
    kind: str
    site: str = Field(default="", max_length=160)
    site_id: str | None = None
    customer: str = Field(default="", max_length=160)
    enabled: bool = True
    metadata: dict = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    tag: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    kind: str | None = None
    site: str | None = Field(default=None, max_length=160)
    site_id: str | None = None
    customer: str | None = Field(default=None, max_length=160)
    enabled: bool | None = None
    metadata: dict | None = None


class ControllerCreate(BaseModel):
    asset_id: str | None = None
    manufacturer: str | None = None
    family: str | None = None
    model: str = Field(min_length=1, max_length=180)
    firmware: str = Field(default="", max_length=120)
    enabled: bool = True
    metadata: dict = Field(default_factory=dict)


class ControllerUpdate(BaseModel):
    asset_id: str | None = None
    firmware: str | None = Field(default=None, max_length=120)
    enabled: bool | None = None
    metadata: dict | None = None


class ConnectionCreate(BaseModel):
    controller_id: str
    name: str = Field(default="Principal", max_length=120)
    transport: str = "reverse_tcp"
    host: str = Field(default="", max_length=255)
    listen_port: int = Field(default=0, ge=0, le=65535)
    modbus_unit: int = Field(default=1, ge=1, le=247)
    rapid_device_num: int | None = Field(default=None, ge=1)
    enabled: bool = True
    config: dict = Field(default_factory=dict)


class ConnectionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    transport: str | None = None
    host: str | None = Field(default=None, max_length=255)
    listen_port: int | None = Field(default=None, ge=0, le=65535)
    modbus_unit: int | None = Field(default=None, ge=1, le=247)
    rapid_device_num: int | None = Field(default=None, ge=1)
    enabled: bool | None = None
    config: dict | None = None


class BundleController(BaseModel):
    manufacturer: str | None = None
    family: str | None = None
    model: str = Field(min_length=1, max_length=180)
    firmware: str = Field(default="", max_length=120)
    enabled: bool = True
    metadata: dict = Field(default_factory=dict)


class BundleConnection(BaseModel):
    name: str = Field(default="Principal", max_length=120)
    transport: str = "reverse_tcp"
    host: str = Field(default="", max_length=255)
    listen_port: int = Field(default=0, ge=0, le=65535)
    modbus_unit: int = Field(default=1, ge=1, le=247)
    rapid_device_num: int | None = Field(default=None, ge=1)
    enabled: bool = True
    config: dict = Field(default_factory=dict)


class EquipmentBundleCreate(BaseModel):
    asset: AssetCreate
    controller: BundleController
    connection: BundleConnection | None = None


class AssetLinkCreate(BaseModel):
    from_asset_id: str
    to_asset_id: str
    relation: str = Field(min_length=1, max_length=80)
    metadata: dict = Field(default_factory=dict)


class DeprovisionRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=32)


async def _privileged_deprovision(generator_id: str) -> dict:
    try:
        reader, writer = await asyncio.open_unix_connection(PROVISION_SOCKET)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Serviço privilegiado de provisionamento não está disponível") from exc
    writer.write((json.dumps({
        "operation": "deprovision",
        "generator_id": generator_id,
        "confirm": "DEPROVISION_CONFIRMED",
    }) + "\n").encode())
    await writer.drain()
    try:
        raw = await asyncio.wait_for(reader.readline(), timeout=100)
    finally:
        writer.close()
        await writer.wait_closed()
    try:
        result = json.loads(raw.decode())
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida do serviço de deprovisionamento") from exc
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail=result.get("error") or "Deprovisionamento recusado")
    return result


@router.get("/api/integrations/status")
def integrations_status(user: dict = Depends(require_view)):
    return safe_integration_status()


@router.get("/api/topology")
def topology(user: dict = Depends(require_view)):
    return domain_store.topology_snapshot()


@router.post("/api/equipment-bundles", status_code=status.HTTP_201_CREATED)
def equipment_bundle_create(payload: EquipmentBundleCreate, user: dict = Depends(require_create)):
    try:
        return domain_bundle.create_equipment_bundle(payload.model_dump(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=409, detail="Já existe um asset com esta tag ou vínculo duplicado") from exc
        raise


@router.post("/api/generators/{generator_id}/deprovision")
async def generator_deprovision(generator_id: str, payload: DeprovisionRequest, user: dict = Depends(require_admin)):
    if payload.confirmation.strip().upper() != "DEPROVISION":
        raise HTTPException(status_code=422, detail="Confirmação deve ser DEPROVISION")
    from . import db
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    result = await _privileged_deprovision(generator["id"])
    db.add_audit(actor(user), "deprovision_requested", "generator", generator["id"], "Rapid SCADA; histórico preservado")
    return result


@router.get("/api/assets")
def assets_list(user: dict = Depends(require_view)):
    domain_store.sync_legacy_generators()
    return domain_store.list_assets()


@router.post("/api/assets", status_code=status.HTTP_201_CREATED)
def assets_create(payload: AssetCreate, user: dict = Depends(require_create)):
    try:
        return domain_store.create_asset(payload.model_dump(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=409, detail="Já existe um asset com esta tag") from exc
        raise


@router.get("/api/assets/{asset_id}")
def asset_get(asset_id: str, user: dict = Depends(require_view)):
    item = domain_store.get_asset(asset_id)
    if not item:
        raise HTTPException(status_code=404, detail="Asset não encontrado")
    return item


@router.patch("/api/assets/{asset_id}")
def asset_update(asset_id: str, payload: AssetUpdate, user: dict = Depends(require_edit)):
    try:
        item = domain_store.update_asset(asset_id, payload.model_dump(exclude_unset=True), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Asset não encontrado")
    return item


@router.delete("/api/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def asset_delete(asset_id: str, user: dict = Depends(require_remove)):
    try:
        ok = domain_store.delete_asset(asset_id, actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Asset não encontrado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/controllers")
def controllers_list(asset_id: str | None = None, user: dict = Depends(require_view)):
    domain_store.sync_legacy_generators()
    return domain_store.list_controllers(asset_id)


@router.post("/api/controllers", status_code=status.HTTP_201_CREATED)
def controllers_create(payload: ControllerCreate, user: dict = Depends(require_create)):
    try:
        return domain_store.create_controller(payload.model_dump(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/api/controllers/{controller_id}")
def controller_update(controller_id: str, payload: ControllerUpdate, user: dict = Depends(require_edit)):
    try:
        item = domain_store.update_controller(controller_id, payload.model_dump(exclude_unset=True), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Controladora não encontrada")
    return item


@router.get("/api/connections")
def connections_list(controller_id: str | None = None, user: dict = Depends(require_view)):
    domain_store.sync_legacy_generators()
    return domain_store.list_connections(controller_id)


@router.post("/api/connections", status_code=status.HTTP_201_CREATED)
def connections_create(payload: ConnectionCreate, user: dict = Depends(require_create)):
    try:
        return domain_store.create_connection(payload.model_dump(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/api/connections/{connection_id}")
def connection_update(connection_id: str, payload: ConnectionUpdate, user: dict = Depends(require_edit)):
    try:
        item = domain_store.update_connection(connection_id, payload.model_dump(exclude_unset=True), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")
    return item


@router.get("/api/asset-links")
def asset_links_list(asset_id: str | None = None, user: dict = Depends(require_view)):
    return domain_store.list_asset_links(asset_id)


@router.post("/api/asset-links", status_code=status.HTTP_201_CREATED)
def asset_links_create(payload: AssetLinkCreate, user: dict = Depends(require_create)):
    try:
        return domain_store.create_asset_link(
            payload.from_asset_id,
            payload.to_asset_id,
            payload.relation,
            payload.metadata,
            actor(user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
