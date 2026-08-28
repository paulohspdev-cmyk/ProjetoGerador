from contextlib import asynccontextmanager
import sqlite3
import time
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db, ops_store, platform_store, transport_store
from .auth import (
    authenticate,
    create_login_session,
    current_user,
    destroy_login_session,
    hash_password,
    public_user,
    require_admin,
    require_audit,
    require_create,
    require_edit,
    require_manage_users,
    require_operate,
    require_remove,
    require_view,
)
from .automation_engine import set_rule_enabled
from .backup_manager import create_full_backup
from .config import (
    ADMIN_EMAIL,
    ADMIN_NAME,
    ADMIN_PASSWORD,
    API_DOCS_ENABLED,
    CORS_ORIGINS,
    LOGIN_LOCK_SECONDS,
    LOGIN_MAX_FAILURES,
    RAPID_BINDINGS_FILE,
    RAPID_COMM_CONFIG,
    RAPID_READER_DLL,
)
from .control import send_homologated_command
from .diagnostics import system_diagnostics
from .extra_routes import router as extra_router
from .ops_schemas import (
    AgendaCreate,
    AlarmAckRequest,
    ClientCreate,
    ReportCreate,
    RuleCreate,
    RuleUpdate,
    SettingUpdate,
    SiteCreate,
    WebhookCreate,
    WebhookUpdate,
    WorkOrderCreate,
    WorkOrderUpdate,
)
from .rapid import available_metrics, dashboard, overlay_generators, trend_for_generator
from .reporting import generate_report
from .schemas import CommandRequest, GeneratorCreate, GeneratorUpdate, LoginRequest, UserCreate, UserUpdate
from .security_service import begin_login, totp_required, verify_user_totp


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    transport_store.init_transport_db()
    if ADMIN_PASSWORD:
        try:
            _, created = db.bootstrap_admin(ADMIN_NAME, ADMIN_EMAIL, hash_password(ADMIN_PASSWORD))
            if created:
                print(f"[api] administrador inicial criado: {ADMIN_EMAIL}", flush=True)
        except Exception as exc:
            print(f"[api] falha ao criar administrador inicial: {exc}", flush=True)
    elif db.count_users() == 0:
        print("[api] AVISO: nenhum usuário cadastrado e RC_ADMIN_PASSWORD não foi definido", flush=True)
    yield


app = FastAPI(
    title="RC Geradores API",
    version="2.0.0",
    description="Backend RC Geradores. Rapid SCADA é a fonte industrial de telemetria e histórico.",
    docs_url="/api/docs" if API_DOCS_ENABLED else None,
    redoc_url="/api/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/api/openapi.json" if API_DOCS_ENABLED else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


def live_generators():
    return overlay_generators(db.list_generators())


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


def _agenda_public(item: dict) -> dict:
    return {**item, "when": item.get("when_text") or "", "generatorId": item.get("generator_id")}


def _rule_public(item: dict) -> dict:
    return {
        **item,
        "trigger": item.get("trigger_text") or "",
        "action": item.get("action_text") or "",
        "safetyState": item.get("safety_state") or "draft",
    }


def _site_public(item: dict) -> dict:
    return {
        **item,
        "clientId": item.get("client_id"),
        "clientName": item.get("client_name") or "",
        "lat": item.get("latitude"),
        "lng": item.get("longitude"),
    }


def _backup_public(item: dict) -> dict:
    created = int(item.get("created_at") or 0)
    size = int(item.get("size_bytes") or 0)
    return {
        **item,
        "when": time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(created)) if created else "—",
        "size": f"{size / (1024 * 1024):.1f} MB" if size else "0 MB",
        "type": item.get("type") or "Manual",
        "result": item.get("result") or "—",
    }


def _ops_payload() -> dict:
    raw = ops_store.bootstrap_payload()
    return {
        **raw,
        "sites": [_site_public(x) for x in raw["sites"]],
        "agenda": [_agenda_public(x) for x in raw["agenda"]],
        "rules": [_rule_public(x) for x in raw["rules"]],
        "backups": [_backup_public(x) for x in raw["backups"]],
        "fieldDevices": platform_store.list_field_devices(),
        "notifications": platform_store.list_notifications(100),
        "scheduler": platform_store.list_scheduler_jobs(),
    }


# ---------------------------------------------------------------------------
# Saúde e autenticação
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"ok": True, "service": "rc-geradores-api", "version": app.version, "bootstrapRequired": db.count_users() == 0}


@app.get("/api/system/health")
def system_health(user: dict = Depends(require_view)):
    return system_diagnostics()


@app.post("/api/auth/login")
def auth_login(payload: LoginRequest, request: Request, response: Response):
    key, allowed, retry = begin_login(payload.email, request, LOGIN_MAX_FAILURES, LOGIN_LOCK_SECONDS)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente mais tarde.", headers={"Retry-After": str(retry)})

    user = authenticate(payload.email, payload.password)
    if not user:
        platform_store.record_login_failure(key, LOGIN_MAX_FAILURES, LOGIN_LOCK_SECONDS)
        db.add_audit(payload.email.strip().lower(), "login_failed", "session", "-", "credenciais inválidas")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos")

    if totp_required(user) and not verify_user_totp(user, payload.otp):
        platform_store.record_login_failure(key, LOGIN_MAX_FAILURES, LOGIN_LOCK_SECONDS)
        db.add_audit(user["email"], "login_2fa_failed", "session", user["id"], "TOTP inválido/ausente")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código 2FA obrigatório ou inválido")

    platform_store.clear_login_failures(key)
    result = create_login_session(user, request, response)
    db.add_audit(user["email"], "login", "session", user["id"], "login efetuado")
    return {**result, "twoFactorEnabled": totp_required(user)}


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def auth_logout(request: Request, response: Response):
    token_user = None
    try:
        token_user = current_user(request)
    except HTTPException:
        pass
    destroy_login_session(request, response)
    if token_user:
        db.add_audit(actor(token_user), "logout", "session", token_user["id"], "logout efetuado")
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=response.headers)


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(current_user)):
    return {**public_user(user), "twoFactorEnabled": totp_required(user)}


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------
@app.get("/api/users")
def users_list(user: dict = Depends(require_manage_users)):
    return [public_user(item) for item in db.list_users()]


@app.post("/api/users", status_code=status.HTTP_201_CREATED)
def users_create(payload: UserCreate, user: dict = Depends(require_manage_users)):
    if payload.role not in {"administrador", "cadastro", "visualizacao"}:
        raise HTTPException(status_code=422, detail="Perfil inválido")
    try:
        created = db.create_user({"name": payload.name, "email": payload.email, "password_hash": hash_password(payload.password), "role": payload.role, "active": True}, actor=actor(user))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Já existe um usuário com este e-mail") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return public_user(created)


@app.patch("/api/users/{user_id}")
def users_update(user_id: str, payload: UserUpdate, user: dict = Depends(require_manage_users)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    patch = payload.model_dump(exclude_unset=True)
    new_role = patch.get("role", target["role"])
    new_active = patch.get("active", target["active"])
    if new_role not in {"administrador", "cadastro", "visualizacao"}:
        raise HTTPException(status_code=422, detail="Perfil inválido")
    if target["role"] == "administrador" and db.count_active_admins() <= 1 and (new_role != "administrador" or new_active is False):
        raise HTTPException(status_code=409, detail="Não é possível desativar ou rebaixar o último administrador")
    db_patch = {key: value for key, value in patch.items() if key != "password"}
    if patch.get("password"):
        db_patch["password_hash"] = hash_password(patch["password"])
    try:
        updated = db.update_user(user_id, db_patch, actor=actor(user))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return public_user(updated)


@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def users_delete(user_id: str, user: dict = Depends(require_manage_users)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=409, detail="Você não pode excluir o próprio usuário")
    if target["role"] == "administrador" and target["active"] and db.count_active_admins() <= 1:
        raise HTTPException(status_code=409, detail="Não é possível excluir o último administrador")
    db.delete_user(user_id, actor=actor(user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Geradores e dados industriais
# ---------------------------------------------------------------------------
@app.get("/api/generators")
def generators_list(user: dict = Depends(require_view)):
    return live_generators()


@app.get("/api/generators/{generator_id}")
def generator_get(generator_id: str, user: dict = Depends(require_view)):
    item = next((g for g in live_generators() if g["id"] == generator_id or g["tag"].lower() == generator_id.lower()), None)
    if not item:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return item


@app.post("/api/generators", status_code=status.HTTP_201_CREATED)
def generator_create(payload: GeneratorCreate, user: dict = Depends(require_create)):
    try:
        created = db.create_generator(payload.to_db(), actor=actor(user))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Tag de gerador já cadastrada") from exc
    return overlay_generators([created])[0]


@app.patch("/api/generators/{generator_id}")
def generator_update(generator_id: str, payload: GeneratorUpdate, user: dict = Depends(require_edit)):
    try:
        updated = db.update_generator(generator_id, payload.to_db(), actor=actor(user))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Conflito no cadastro do gerador") from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return overlay_generators([updated])[0]


@app.delete("/api/generators/{generator_id}", status_code=status.HTTP_204_NO_CONTENT)
def generator_delete(generator_id: str, user: dict = Depends(require_remove)):
    if not db.delete_generator(generator_id, actor=actor(user)):
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/generators/{generator_id}/commands/{action}")
async def generator_command(generator_id: str, action: str, payload: CommandRequest, user: dict = Depends(require_operate)):
    action = action.strip().lower()
    if action not in {"start", "stop"}:
        raise HTTPException(status_code=422, detail="Somente START e STOP estão homologados")
    if payload.confirmation.strip().upper() != action.upper():
        raise HTTPException(status_code=422, detail=f"Confirmação deve ser {action.upper()}")
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    if not generator.get("enabled"):
        raise HTTPException(status_code=409, detail="Gerador desabilitado")
    try:
        result = await send_homologated_command(generator, action)
    except (ValueError, ConnectionError, TimeoutError) as exc:
        db.add_audit(actor(user), f"command_{action}_failed", "generator", generator["id"], str(exc))
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.add_audit(actor(user), f"command_{action}_error", "generator", generator["id"], str(exc))
        raise HTTPException(status_code=502, detail="Falha ao comunicar com a bridge de controle") from exc
    accepted = bool(result.get("accepted"))
    db.add_audit(actor(user), f"command_{action}", "generator", generator["id"], f"accepted={accepted}; {result.get('reason') or result.get('error') or ''}")
    if not accepted:
        raise HTTPException(status_code=409, detail=result.get("reason") or result.get("error") or "Controlador recusou o comando")
    return result


@app.get("/api/generators/{generator_id}/metrics")
def generator_metrics(generator_id: str, user: dict = Depends(require_view)):
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return available_metrics(generator)


@app.get("/api/generators/{generator_id}/trends/{metric}")
def generator_trend(generator_id: str, metric: str, hours: int = 24, archiveBit: int = 1, user: dict = Depends(require_view)):
    generator = db.get_generator(generator_id)
    if not generator:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    try:
        return trend_for_generator(generator, metric, hours=hours, archive_bit=archiveBit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/dashboard")
def dashboard_get(user: dict = Depends(require_view)):
    return dashboard(live_generators())


@app.get("/api/events")
def events_get(limit: int = 200, user: dict = Depends(require_view)):
    return db.list_events(limit)


@app.get("/api/audit")
def audit_get(limit: int = 200, user: dict = Depends(require_audit)):
    return db.list_audit(limit)


@app.get("/api/controller-bindings")
def controller_bindings(user: dict = Depends(require_view)):
    from .rapid import load_bindings
    return load_bindings()


# ---------------------------------------------------------------------------
# Gestão, manutenção, agenda, automação e integrações
# ---------------------------------------------------------------------------
@app.get("/api/ops/bootstrap")
def ops_bootstrap(user: dict = Depends(require_view)):
    return _ops_payload()


@app.get("/api/clients")
def clients_list(user: dict = Depends(require_view)):
    return ops_store.list_clients()


@app.post("/api/clients", status_code=status.HTTP_201_CREATED)
def clients_create(payload: ClientCreate, user: dict = Depends(require_create)):
    try:
        return ops_store.create_client(payload.model_dump(), actor(user))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Cliente já cadastrado") from exc


@app.get("/api/sites")
def sites_list(user: dict = Depends(require_view)):
    return [_site_public(x) for x in ops_store.list_sites()]


@app.post("/api/sites", status_code=status.HTTP_201_CREATED)
def sites_create(payload: SiteCreate, user: dict = Depends(require_create)):
    try:
        return _site_public(ops_store.create_site(payload.to_db(), actor(user)))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Unidade/site já cadastrado ou cliente inválido") from exc


@app.get("/api/work-orders")
def work_orders_list(user: dict = Depends(require_view)):
    return ops_store.list_work_orders()


@app.post("/api/work-orders", status_code=status.HTTP_201_CREATED)
def work_orders_create(payload: WorkOrderCreate, user: dict = Depends(require_create)):
    return ops_store.create_work_order(payload.to_db(), actor(user))


@app.patch("/api/work-orders/{item_id}")
def work_orders_update(item_id: str, payload: WorkOrderUpdate, user: dict = Depends(require_edit)):
    updated = ops_store.update_work_order(item_id, payload.model_dump(exclude_unset=True), actor(user))
    if not updated:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    return updated


@app.get("/api/agenda")
def agenda_list(user: dict = Depends(require_view)):
    return [_agenda_public(x) for x in ops_store.list_agenda()]


@app.post("/api/agenda", status_code=status.HTTP_201_CREATED)
def agenda_create(payload: AgendaCreate, user: dict = Depends(require_create)):
    return _agenda_public(ops_store.create_agenda(payload.to_db(), actor(user)))


@app.get("/api/automation/rules")
def rules_list(user: dict = Depends(require_view)):
    return [_rule_public(x) for x in ops_store.list_rules()]


@app.post("/api/automation/rules", status_code=status.HTTP_201_CREATED)
def rules_create(payload: RuleCreate, user: dict = Depends(require_admin)):
    return _rule_public(ops_store.create_rule(payload.model_dump(), actor(user)))


@app.patch("/api/automation/rules/{item_id}")
def rules_update(item_id: str, payload: RuleUpdate, user: dict = Depends(require_admin)):
    patch = payload.to_db()
    enabled = patch.pop("enabled", None)
    updated = ops_store.update_rule(item_id, patch, actor(user))
    if not updated:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    if enabled is not None:
        try:
            updated = set_rule_enabled(item_id, enabled, actor(user))
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _rule_public(updated)


@app.get("/api/reports")
def reports_list(user: dict = Depends(require_view)):
    return ops_store.list_reports()


@app.post("/api/reports", status_code=status.HTTP_201_CREATED)
def reports_create(payload: ReportCreate, user: dict = Depends(require_create)):
    if payload.format.upper() not in {"CSV", "XLSX", "PDF"}:
        raise HTTPException(status_code=422, detail="Formato inválido")
    report = ops_store.create_report(payload.model_dump(), actor(user))
    generate_report(report, live_generators())
    return report


@app.get("/api/reports/{report_id}/download")
def reports_download(report_id: str, user: dict = Depends(require_view)):
    report = next((x for x in ops_store.list_reports() if x["id"] == report_id), None)
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    artifact = platform_store.get_report_artifact(report_id)
    if not artifact or not Path(artifact["path"]).exists():
        generated = generate_report(report, live_generators())
        path = Path(generated["path"])
        media_type = generated["media_type"]
    else:
        path = Path(artifact["path"])
        media_type = artifact["media_type"]
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.get("/api/webhooks")
def webhooks_list(user: dict = Depends(require_view)):
    return ops_store.list_webhooks()


@app.post("/api/webhooks", status_code=status.HTTP_201_CREATED)
def webhooks_create(payload: WebhookCreate, user: dict = Depends(require_admin)):
    if not payload.url.lower().startswith(("https://", "http://")):
        raise HTTPException(status_code=422, detail="URL de webhook inválida")
    return ops_store.create_webhook(payload.model_dump(), actor(user))


@app.patch("/api/webhooks/{item_id}")
def webhooks_update(item_id: str, payload: WebhookUpdate, user: dict = Depends(require_admin)):
    patch = payload.model_dump(exclude_unset=True)
    if "status" in patch and patch["status"] not in {"Ativo", "Pausado"}:
        raise HTTPException(status_code=422, detail="Status de webhook inválido")
    updated = ops_store.update_webhook(item_id, patch, actor(user))
    if not updated:
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    return updated


@app.get("/api/settings")
def settings_list(user: dict = Depends(require_view)):
    return ops_store.list_settings()


@app.put("/api/settings/{key}")
def settings_update(key: str, payload: SettingUpdate, user: dict = Depends(require_admin)):
    if not key or len(key) > 120:
        raise HTTPException(status_code=422, detail="Chave de configuração inválida")
    return ops_store.set_setting(key, payload.value, actor(user))


@app.get("/api/backups")
def backups_list(user: dict = Depends(require_admin)):
    return [_backup_public(x) for x in ops_store.list_backups()]


@app.post("/api/backups", status_code=status.HTTP_201_CREATED)
def backups_create(user: dict = Depends(require_admin)):
    return _backup_public(create_full_backup(actor(user)))


@app.get("/api/alarms/ack")
def alarm_acks_list(user: dict = Depends(require_view)):
    return ops_store.list_alarm_acks()


@app.post("/api/alarms/ack", status_code=status.HTTP_201_CREATED)
def alarm_ack(payload: AlarmAckRequest, user: dict = Depends(require_operate)):
    return ops_store.ack_alarm(payload.alarmKey, actor(user))


app.include_router(extra_router)
