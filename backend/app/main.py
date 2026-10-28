from contextlib import asynccontextmanager
import logging
import sqlite3
import time
import uuid
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import db, domain_store, ops_store, platform_store, transport_store
from .auth import (
    authenticate,
    can,
    create_login_session,
    current_user,
    destroy_login_session,
    hash_password,
    public_user,
    VALID_ROLES,
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
from .control import COMMAND_ACTIONS, send_homologated_command
from .diagnostics import system_diagnostics
from .domain_routes import router as domain_router
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
from .rapid import available_metrics, dashboard, load_bindings, overlay_generators, trend_for_generator
from .production_guard import validate_production_runtime
from .reporting import generate_report, safe_report_artifact_path
from .schemas import CommandRequest, GeneratorCreate, GeneratorUpdate, LoginRequest, UserCreate, UserUpdate
from .security_service import begin_login, totp_required, verify_user_totp


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_production_runtime()
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    transport_store.init_transport_db()
    domain_store.init_domain_db()
    domain_store.sync_legacy_generators()
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
    version="3.0.0",
    description="Backend RC Geradores. Rapid SCADA é a fonte industrial de telemetria e histórico.",
    docs_url="/api/docs" if API_DOCS_ENABLED else None,
    redoc_url="/api/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/api/openapi.json" if API_DOCS_ENABLED else None,
    lifespan=lifespan,
)

_api_log = logging.getLogger("rc-geradores.api")

_UI_RELEASE_ID = "7a7c335-no-auto-rotation"
_UI_RELEASE_COOKIE = "rc_ui_release"


@app.middleware("http")
async def request_observability(request: Request, call_next):
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    except Exception:
        _api_log.exception(
            "unhandled request failure request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "Erro interno do servidor",
                "requestId": request_id,
            },
            headers={"X-Request-ID": request_id},
        )
    response.headers["X-Request-ID"] = request_id

    if (
        request.method == "GET"
        and request.url.path == "/api/generators"
        and request.cookies.get(_UI_RELEASE_COOKIE) != _UI_RELEASE_ID
    ):
        response.headers["Clear-Site-Data"] = '"cache", "executionContexts"'
        response.set_cookie(
            key=_UI_RELEASE_COOKIE,
            value=_UI_RELEASE_ID,
            max_age=7 * 24 * 60 * 60,
            path="/",
            secure=True,
            httponly=True,
            samesite="lax",
        )

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


def live_generators():
    return overlay_generators(db.list_generators())


def actor(user: dict) -> str:
    return user.get("email") or user.get("name") or user.get("id") or "unknown"


def _generator_integrity_detail(exc: sqlite3.IntegrityError) -> str:
    detail = str(exc).lower()
    if (
        "idx_generators_reverse_identity_unique" in detail
        or "domain controller_connections reverse identity conflict" in detail
        or ("generators.listen_port" in detail and "generators.modbus_unit" in detail)
    ):
        return "Porta TCP reversa e Modbus Unit já estão em uso por outro gerador/controladora"
    if (
        "idx_generators_rapid_device_unique" in detail
        or "generators.rapid_device_num" in detail
        or "domain controller_connections rapid_device_num conflict" in detail
    ):
        return "Rapid Device já está associado a outro gerador/controladora"
    if "generators.tag" in detail:
        return "Tag de gerador já cadastrada"
    return "Conflito de integridade no cadastro do gerador"


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


def _visible_settings(user: dict, settings: dict) -> dict:
    if can(user, "admin"):
