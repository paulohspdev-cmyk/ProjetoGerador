import hashlib
import hmac
import ipaddress
import secrets
import time
from typing import Callable

from fastapi import Depends, HTTPException, Request, Response, status

from . import db
from .config import (
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_SECURE,
    AUTH_SESSION_TTL,
)

ROLE_PERMISSIONS = {
    "administrador": {"view", "operate", "create", "edit", "remove", "manage_users", "audit", "admin"},
    "cadastro": {"view", "create", "edit"},
    "visualizacao": {"view"},
}

TRUSTED_PROXY_PEERS = {"127.0.0.1", "::1"}


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def request_remote_ip(request: Request) -> str:
    """Retorna o IP auditável sem confiar em headers enviados pelo cliente.

    A API de produção fica em loopback e recebe tráfego do Nginx. Somente quando
    o peer TCP é o proxy local aceitamos X-Real-IP; em qualquer outra situação
    usamos diretamente o endereço do socket.
    """
    peer = request.client.host if request.client else ""
    if peer not in TRUSTED_PROXY_PEERS:
        return peer
    candidate = request.headers.get("x-real-ip", "").split(",", 1)[0].strip()
    if not candidate:
        return peer
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return peer


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("A senha deve ter pelo menos 8 caracteres")
    salt = secrets.token_bytes(16)
    n, r, p = 16384, 8, 1
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt${n}${r}${p}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_hex, digest_hex = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(digest_hex)),
        )
        return hmac.compare_digest(derived.hex(), digest_hex)
    except Exception:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: dict) -> dict:
    last_access = user.get("last_access")
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "active": bool(user.get("active")),
        "lastAccess": time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(last_access)) if last_access else None,
    }


def can(user: dict, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.get("role"), set())


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_SESSION_TTL,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        secure=AUTH_COOKIE_SECURE,
        httponly=True,
        samesite="strict",
    )


def authenticate(email: str, password: str) -> dict | None:
    user = db.get_user_auth(normalize_email(email))
    if not user or not user.get("active"):
        return None
    if not verify_password(password, user.get("password_hash") or ""):
        return None
    return user


def create_login_session(user: dict, request: Request, response: Response) -> dict:
    token = secrets.token_urlsafe(48)
    now = int(time.time())
    expires_at = now + AUTH_SESSION_TTL
    remote_ip = request_remote_ip(request)
    user_agent = request.headers.get("user-agent", "")[:500]
    db.create_session(token_hash(token), user["id"], expires_at, remote_ip, user_agent)
    db.touch_user_login(user["id"], now)
    set_session_cookie(response, token)
    refreshed = db.get_user(user["id"])
    return public_user(refreshed)


def destroy_login_session(request: Request, response: Response) -> None:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if token:
        db.delete_session(token_hash(token))
    clear_session_cookie(response)


def current_user(request: Request) -> dict:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão não autenticada")
    user = db.get_session_user(token_hash(token), int(time.time()))
    if not user or not user.get("active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada ou inválida")
    return user


def require(permission: str) -> Callable:
    def dependency(user: dict = Depends(current_user)) -> dict:
        if not can(user, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente")
        return user

    return dependency


require_view = require("view")
require_operate = require("operate")
require_create = require("create")
require_edit = require("edit")
require_remove = require("remove")
require_manage_users = require("manage_users")
require_audit = require("audit")
require_admin = require("admin")
