import asyncio
import json
import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import db, ops_store, platform_store, transport_store
from .auth import current_user, hash_password, require_admin, require_operate, require_view
from .automation_engine import approve_rule, set_rule_enabled
from .backup_manager import safe_archive_path
from .completion_routes import router as completion_router
from .config import LOGIN_LOCK_SECONDS, LOGIN_MAX_FAILURES
from .controller_library import channel_catalog, library_summary
from .control import send_homologated_command
from .diagnostics import system_diagnostics, version_info
from .notifications import process_due_notifications
from .rapid import load_bindings, overlay_generators
from .reporting import generate_report
from .security_service import (
    change_password,
    confirm_password_reset,
    disable_totp,
    enable_totp,
    list_sessions,
    request_password_reset,
    revoke_all_sessions,
    setup_totp,
)

router = APIRouter()
PROVISION_SOCKET = os.environ.get("RC_PROVISION_SOCKET", "/run/rc-geradores/provision.sock")


def actor(user: dict):
    return user.get("email") or user.get("id") or "unknown"


class FieldDeviceCreate(BaseModel):
    kind: str
    name: str = Field(min_length=1, max_length=160)
    site_id: str | None = None
    generator_id: str | None = None
    model: str = ""
    serial: str = ""
    imei: str = ""
    sim_iccid: str = ""
    carrier: str = ""
    host: str = ""
    rssi: float | None = None
    status: str = "unknown"
    metadata: dict = {}


class FieldDeviceUpdate(BaseModel):
    name: str | None = None
    site_id: str | None = None
    generator_id: str | None = None
    model: str | None = None
    serial: str | None = None
    imei: str | None = None
    sim_iccid: str | None = None
    carrier: str | None = None
    host: str | None = None
    rssi: float | None = None
    status: str | None = None
    last_seen: int | None = None
    metadata: dict | None = None
    active: bool | None = None


class TransportConfigPayload(BaseModel):
    config: dict


class NotificationTest(BaseModel):
    channel: str
    destination: str = ""
    subject: str = "Teste RC Geradores"
    body: str = "Notificação de teste"


class SchedulerPayload(BaseModel):
    id: str | None = None
    name: str
    kind: str
    interval_seconds: int = Field(ge=60, le=31536000)
    payload: dict = {}
    enabled: bool = True
    next_run: int | None = None


class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: str = Field(min_length=8, max_length=256)


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    newPassword: str = Field(min_length=8, max_length=256)


class TotpCode(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    scopes: list[str] = ["ops.read"]
    rateLimit: int = Field(default=120, ge=10, le=5000)
    expiresAt: int | None = None


class RuleEnable(BaseModel):
    enabled: bool


# ---------------------- biblioteca e diagnóstico ---------------------------
@router.get("/api/library")
def library(user: dict = Depends(require_view)):
    return library_summary()


@router.get("/api/library/channels")
def library_channels(user: dict = Depends(require_view)):
    return channel_catalog(load_bindings())


@router.get("/api/system/diagnostics")
def diagnostics(user: dict = Depends(require_view)):
    return system_diagnostics()


@router.get("/api/system/version")
def version(user: dict = Depends(require_view)):
    return version_info()


# ------------------------- inventário de campo -----------------------------
@router.get("/api/field-devices")
def field_devices(kind: str | None = None, user: dict = Depends(require_view)):
    return platform_store.list_field_devices(kind)


@router.post("/api/field-devices", status_code=201)
def field_device_create(payload: FieldDeviceCreate, user: dict = Depends(require_admin)):
    try:
        return platform_store.create_field_device(payload.model_dump(), actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/api/field-devices/{item_id}")
def field_device_update(item_id: str, payload: FieldDeviceUpdate, user: dict = Depends(require_admin)):
    updated = platform_store.update_field_device(item_id, payload.model_dump(exclude_unset=True), actor(user))
    if not updated:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    return updated


@router.delete("/api/field-devices/{item_id}", status_code=204)
def field_device_delete(item_id: str, user: dict = Depends(require_admin)):
    if not platform_store.delete_field_device(item_id, actor(user)):
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")


# ------------------------- transporte/provisionamento ----------------------
@router.get("/api/generators/{generator_id}/transport-config")
def transport_config_get(generator_id: str, user: dict = Depends(require_view)):
    if not db.get_generator(generator_id):
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return transport_store.get_transport_config(generator_id)


@router.put("/api/generators/{generator_id}/transport-config")
def transport_config_set(generator_id: str, payload: TransportConfigPayload, user: dict = Depends(require_admin)):
    try:
        return transport_store.set_transport_config(generator_id, payload.config, actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _provision(generator_id: str):
    try:
        reader, writer = await asyncio.open_unix_connection(PROVISION_SOCKET)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Serviço de provisionamento não está disponível") from exc
    writer.write((json.dumps({"generator_id": generator_id, "confirm": "PROVISION_CONFIRMED"}) + "\n").encode())
    await writer.drain()
    try:
        raw = await asyncio.wait_for(reader.readline(), timeout=70)
    finally:
        writer.close()
        await writer.wait_closed()
    try:
        result = json.loads(raw.decode())
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Resposta inválida do provisionador") from exc
    if not result.get("ok"):
        raise HTTPException(status_code=409, detail=result.get("error") or "Provisionamento recusado")
    return result


@router.post("/api/generators/{generator_id}/provision")
async def generator_provision(generator_id: str, user: dict = Depends(require_admin)):
    if not db.get_generator(generator_id):
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    result = await _provision(generator_id)
    db.add_audit(actor(user), "provision", "generator", generator_id, "Rapid SCADA")
    return result


# ------------------------- notificações e scheduler ------------------------
@router.get("/api/notifications")
def notification_list(limit: int = 200, user: dict = Depends(require_view)):
    return platform_store.list_notifications(limit)


@router.get("/api/notifications/deliveries")
def delivery_list(limit: int = 200, user: dict = Depends(require_admin)):
    return platform_store.list_deliveries(limit)


@router.post("/api/notifications/test", status_code=201)
def notification_test(payload: NotificationTest, user: dict = Depends(require_admin)):
    if payload.channel not in {"panel", "email", "whatsapp", "webhook"}:
        raise HTTPException(status_code=422, detail="Canal inválido")
    item_id = platform_store.enqueue_notification("system.test", payload.channel, destination=payload.destination, subject=payload.subject, body=payload.body, payload={"actor": actor(user)})
    return {"id": item_id, "status": "queued"}


@router.post("/api/notifications/process")
def notification_process(user: dict = Depends(require_admin)):
    return {"processed": process_due_notifications()}


@router.get("/api/scheduler")
def scheduler_list(user: dict = Depends(require_view)):
    return platform_store.list_scheduler_jobs()


@router.post("/api/scheduler", status_code=201)
def scheduler_upsert(payload: SchedulerPayload, user: dict = Depends(require_admin)):
    if payload.kind not in {"backup", "report", "notification"}:
        raise HTTPException(status_code=422, detail="Scheduler aceita somente backup, report e notification. Comandos industriais são proibidos.")
    return platform_store.upsert_scheduler_job(payload.model_dump(), actor(user))


@router.delete("/api/scheduler/{item_id}", status_code=204)
def scheduler_delete(item_id: str, user: dict = Depends(require_admin)):
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM scheduler_jobs WHERE id=?", (item_id,))
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    db.add_audit(actor(user), "delete", "scheduler_job", item_id, "")


# ------------------------- automação segura --------------------------------
@router.post("/api/automation/rules/{rule_id}/approve")
def automation_approve(rule_id: str, user: dict = Depends(require_admin)):
    try:
        item = approve_rule(rule_id, actor(user))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    return item


@router.put("/api/automation/rules/{rule_id}/enabled")
def automation_enable(rule_id: str, payload: RuleEnable, user: dict = Depends(require_admin)):
    try:
        item = set_rule_enabled(rule_id, payload.enabled, actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    return item


# ------------------------- segurança da conta ------------------------------
@router.post("/api/auth/password/change", status_code=204)
def password_change(payload: PasswordChange, user: dict = Depends(current_user)):
    try:
        change_password(user, payload.currentPassword, payload.newPassword)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/auth/password/reset-request", status_code=202)
def password_reset_request(payload: PasswordResetRequest):
    request_password_reset(payload.email)
    return {"accepted": True}


@router.post("/api/auth/password/reset-confirm", status_code=204)
def password_reset_confirm(payload: PasswordResetConfirm):
    try:
        confirm_password_reset(payload.token, payload.newPassword)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/auth/2fa/setup")
def twofa_setup(user: dict = Depends(current_user)):
    return setup_totp(user)


@router.post("/api/auth/2fa/enable", status_code=204)
def twofa_enable(payload: TotpCode, user: dict = Depends(current_user)):
    try:
        enable_totp(user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/auth/2fa/disable", status_code=204)
def twofa_disable(payload: TotpCode, user: dict = Depends(current_user)):
    try:
        disable_totp(user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/auth/sessions")
def sessions(user: dict = Depends(current_user)):
    return list_sessions(user["id"])


@router.delete("/api/auth/sessions", status_code=204)
def sessions_revoke(user: dict = Depends(current_user)):
    revoke_all_sessions(user["id"])


# ------------------------- API externa -------------------------------------
def external_token(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token obrigatório")
    raw = authorization.split(None, 1)[1].strip()
    token = platform_store.authenticate_api_token(raw)
    if not token:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    if not platform_store.consume_api_rate(token["id"], token["rate_limit"]):
        raise HTTPException(status_code=429, detail="Rate limit excedido")
    return token


def scope(token: dict, required: str):
    if required not in token.get("scopes", []):
        raise HTTPException(status_code=403, detail=f"Escopo obrigatório: {required}")


@router.get("/api/api-tokens")
def token_list(user: dict = Depends(require_admin)):
    return platform_store.list_api_tokens()


@router.post("/api/api-tokens", status_code=201)
def token_create(payload: ApiTokenCreate, user: dict = Depends(require_admin)):
    allowed = {"ops.read", "ops.command"}
    requested = sorted(set(payload.scopes))
    if not requested or any(s not in allowed for s in requested):
        raise HTTPException(status_code=422, detail="Escopos permitidos: ops.read, ops.command")
    raw, item = platform_store.create_api_token(payload.name, requested, payload.rateLimit, payload.expiresAt)
    db.add_audit(actor(user), "create", "api_token", item["id"], " ".join(requested))
    return {**item, "token": raw, "warning": "O token é exibido somente nesta resposta."}


@router.delete("/api/api-tokens/{item_id}", status_code=204)
def token_revoke(item_id: str, user: dict = Depends(require_admin)):
    if not platform_store.revoke_api_token(item_id):
        raise HTTPException(status_code=404, detail="Token não encontrado")
    db.add_audit(actor(user), "revoke", "api_token", item_id, "")


@router.get("/api/v1/generators")
def external_generators(token: dict = Depends(external_token)):
    scope(token, "ops.read")
    return overlay_generators(db.list_generators())


@router.get("/api/v1/generators/{generator_id}")
def external_generator(generator_id: str, token: dict = Depends(external_token)):
    scope(token, "ops.read")
    item = next((g for g in overlay_generators(db.list_generators()) if g["id"] == generator_id or g["tag"].lower() == generator_id.lower()), None)
    if not item:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return item


@router.post("/api/v1/generators/{generator_id}/commands/{action}")
async def external_command(generator_id: str, action: str, x_rc_confirm: str | None = Header(default=None), token: dict = Depends(external_token)):
    scope(token, "ops.command")
    action = action.lower()
    if action not in {"start", "stop"}:
        raise HTTPException(status_code=422, detail="Somente START/STOP homologados")
    if (x_rc_confirm or "").upper() != action.upper():
        raise HTTPException(status_code=422, detail=f"X-RC-Confirm deve ser {action.upper()}")
    generator = db.get_generator(generator_id)
    if not generator or not generator.get("enabled"):
        raise HTTPException(status_code=404, detail="Gerador não encontrado ou desabilitado")
    try:
        result = await send_homologated_command(generator, action)
    except Exception as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.add_audit(f"api-token:{token['id']}", f"command_{action}", "generator", generator["id"], f"accepted={result.get('accepted')}")
    if not result.get("accepted"):
        raise HTTPException(status_code=409, detail=result.get("reason") or "Comando recusado")
    return result


# ------------------------- downloads reais ---------------------------------
@router.get("/api/backups/{backup_id}/download")
def backup_download(backup_id: str, user: dict = Depends(require_admin)):
    item = next((x for x in ops_store.list_backups() if x["id"] == backup_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    try:
        path = safe_archive_path(item["path"])
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path, media_type="application/gzip", filename=path.name)


@router.get("/api/reports/{report_id}/artifact")
def report_artifact(report_id: str, user: dict = Depends(require_view)):
    report = next((x for x in ops_store.list_reports() if x["id"] == report_id), None)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    artifact = platform_store.get_report_artifact(report_id)
    if not artifact or not Path(artifact["path"]).exists():
        artifact = generate_report(report, overlay_generators(db.list_generators()))
        path = Path(artifact["path"])
        media_type = artifact["media_type"]
    else:
        path = Path(artifact["path"])
        media_type = artifact["media_type"]
    return FileResponse(path, media_type=media_type, filename=path.name)


router.include_router(completion_router)
