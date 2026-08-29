from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from . import domain_store
from .auth import require_create, require_edit, require_remove, require_view

router = APIRouter()


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
    metadata: dict = {}


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
    metadata: dict = {}


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
    config: dict = {}


class ConnectionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    transport: str | None = None
    host: str | None = Field(default=None, max_length=255)
    listen_port: int | None = Field(default=None, ge=0, le=65535)
    modbus_unit: int | None = Field(default=None, ge=1, le=247)
    rapid_device_num: int | None = Field(default=None, ge=1)
    enabled: bool | None = None
    config: dict | None = None


class AssetLinkCreate(BaseModel):
    from_asset_id: str
    to_asset_id: str
    relation: str = Field(min_length=1, max_length=80)
    metadata: dict = {}


@router.get("/api/topology")
def topology(user: dict = Depends(require_view)):
    return domain_store.topology_snapshot()


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
