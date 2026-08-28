from contextlib import asynccontextmanager
import sqlite3

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .auth import (
    authenticate,
    create_login_session,
    current_user,
    destroy_login_session,
    hash_password,
    public_user,
    require_audit,
    require_create,
    require_edit,
    require_manage_users,
    require_operate,
    require_remove,
    require_view,
)
from .config import (
    ADMIN_EMAIL,
    ADMIN_NAME,
    ADMIN_PASSWORD,
    API_DOCS_ENABLED,
    CORS_ORIGINS,
    RAPID_BINDINGS_FILE,
    RAPID_COMM_CONFIG,
    RAPID_READER_DLL,
)
from .control import send_homologated_command
from .rapid import dashboard, overlay_generators
from .schemas import (
    CommandRequest,
    GeneratorCreate,
    GeneratorUpdate,
    LoginRequest,
    UserCreate,
    UserUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
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
    version="1.0.0",
    description="Backend do RC Geradores. Rapid SCADA é a fonte industrial de telemetria.",
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


# ---------------------------------------------------------------------------
# Saúde e autenticação
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "rc-geradores-api",
        "version": app.version,
        "bootstrapRequired": db.count_users() == 0,
    }


@app.get("/api/system/health")
def system_health(user: dict = Depends(require_view)):
    return {
        "ok": True,
        "service": "rc-geradores-api",
        "rapid": {
            "bindings": str(RAPID_BINDINGS_FILE),
            "bindingsExists": RAPID_BINDINGS_FILE.exists(),
            "reader": str(RAPID_READER_DLL),
            "readerExists": RAPID_READER_DLL.exists(),
            "commConfig": str(RAPID_COMM_CONFIG),
            "commConfigExists": RAPID_COMM_CONFIG.exists(),
        },
    }


@app.post("/api/auth/login")
def auth_login(payload: LoginRequest, request: Request, response: Response):
    user = authenticate(payload.email, payload.password)
    if not user:
        db.add_audit(payload.email.strip().lower(), "login_failed", "session", "-", "credenciais inválidas")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos")
    result = create_login_session(user, request, response)
    db.add_audit(user["email"], "login", "session", user["id"], "login efetuado")
    return result


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
    return public_user(user)


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
        created = db.create_user(
            {
                "name": payload.name,
                "email": payload.email,
                "password_hash": hash_password(payload.password),
                "role": payload.role,
                "active": True,
            },
            actor=actor(user),
        )
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
    if target["role"] == "administrador" and db.count_active_admins() <= 1:
        if new_role != "administrador" or new_active is False:
            raise HTTPException(status_code=409, detail="Não é possível desativar ou rebaixar o último administrador")

    db_patch = {key: value for key, value in patch.items() if key != "password"}
    if patch.get("password"):
        try:
            db_patch["password_hash"] = hash_password(patch["password"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
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
    item = next(
        (
            g
            for g in live_generators()
            if g["id"] == generator_id or g["tag"].lower() == generator_id.lower()
        ),
        None,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Gerador não encontrado")
    return item


@app.post("/api/generators", status_code=status.HTTP_201_CREATED)
def generator_create(payload: GeneratorCreate, user: dict = Depends(require_create)):
    try:
        created = db.create_generator(payload.to_db(), actor=actor(user))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Tag de gerador já cadastrada") from exc
    return next(g for g in overlay_generators([created]) if g["id"] == created["id"])


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
async def generator_command(
    generator_id: str,
    action: str,
    payload: CommandRequest,
    user: dict = Depends(require_operate),
):
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
    db.add_audit(
        actor(user),
        f"command_{action}",
        "generator",
        generator["id"],
        f"accepted={accepted}; {result.get('reason') or result.get('error') or ''}",
    )
    if not accepted:
        raise HTTPException(status_code=409, detail=result.get("reason") or result.get("error") or "Controlador recusou o comando")
    return result


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
