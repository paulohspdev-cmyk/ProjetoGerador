import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from . import db, platform_store
from .auth import hash_password, request_remote_ip, verify_password
from .config import PASSWORD_RESET_TTL, PUBLIC_BASE_URL, SMTP_FROM, SMTP_HOST
from .secret_box import protect_secret, reveal_secret


def remote_ip(request) -> str:
    return request_remote_ip(request)


def begin_login(email: str, request, max_failures: int, lock_seconds: int):
    key = platform_store.login_key(email, remote_ip(request))
    allowed, retry = platform_store.login_allowed(key, max_failures=max_failures, lock_seconds=lock_seconds)
    return key, allowed, retry


def totp_code(secret_base32: str, at: int | None = None, step: int = 30, digits: int = 6) -> str:
    at = int(at or time.time())
    secret = base64.b32decode(secret_base32.upper() + "=" * ((8 - len(secret_base32) % 8) % 8))
    counter = at // step
    digest = hmac.new(secret, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(value).zfill(digits)


def verify_totp(secret_base32: str, code: str) -> bool:
    clean = str(code or "").strip()
    if len(clean) != 6 or not clean.isdigit():
        return False
    now = int(time.time())
    return any(hmac.compare_digest(totp_code(secret_base32, now + delta), clean) for delta in (-30, 0, 30))


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _totp_secret(user_id: str, item: dict) -> str:
    secret, legacy_plaintext = reveal_secret(item["secret_base32"])
    if legacy_plaintext:
        platform_store.set_totp(user_id, protect_secret(secret), bool(item.get("enabled")))
        db.add_audit("security-migration", "encrypt_2fa_secret", "user", user_id, "TOTP secret migrated")
    return secret


def setup_totp(user: dict):
    secret = new_totp_secret()
    platform_store.set_totp(user["id"], protect_secret(secret), False)
    issuer = quote("RC Geradores")
    account = quote(user.get("email") or user["id"])
    uri = f"otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}&digits=6&period=30"
    return {"secret": secret, "otpauthUri": uri}


def enable_totp(user: dict, code: str):
    item = platform_store.get_totp(user["id"])
    if not item:
        raise ValueError("2FA ainda não configurado")
    secret = _totp_secret(user["id"], item)
    if not verify_totp(secret, code):
        raise ValueError("Código TOTP inválido")
    platform_store.set_totp(user["id"], protect_secret(secret), True)
    db.add_audit(user.get("email") or user["id"], "enable_2fa", "user", user["id"], "TOTP")
    return True


def disable_totp(user: dict, code: str):
    item = platform_store.get_totp(user["id"])
    if not item or not item.get("enabled"):
        raise ValueError("2FA não está habilitado")
    secret = _totp_secret(user["id"], item)
    if not verify_totp(secret, code):
        raise ValueError("Código TOTP inválido")
    platform_store.set_totp(user["id"], protect_secret(secret), False)
    db.add_audit(user.get("email") or user["id"], "disable_2fa", "user", user["id"], "TOTP")
    return True


def totp_required(user: dict) -> bool:
    item = platform_store.get_totp(user["id"])
    return bool(item and item.get("enabled"))


def verify_user_totp(user: dict, code: str | None) -> bool:
    item = platform_store.get_totp(user["id"])
    if not item or not item.get("enabled"):
        return True
    return verify_totp(_totp_secret(user["id"], item), code or "")


def change_password(user: dict, current_password: str, new_password: str):
    auth_user = db.get_user_auth(user["email"])
    if not auth_user or not verify_password(current_password, auth_user.get("password_hash") or ""):
        raise ValueError("Senha atual inválida")
    db.update_user(user["id"], {"password_hash": hash_password(new_password)}, actor=user["email"])
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    db.add_audit(user["email"], "change_password", "user", user["id"], "sessões revogadas")


def request_password_reset(email: str):
    user = db.get_user_auth(email.strip().lower())
    if not user or not user.get("active"):
        return None
    token = platform_store.create_password_reset(user["id"], PASSWORD_RESET_TTL)
    if PUBLIC_BASE_URL and SMTP_HOST and SMTP_FROM:
        reset_url = f"{PUBLIC_BASE_URL}/reset-password?token={quote(token)}"
        platform_store.enqueue_notification(
            "auth.password_reset",
            "email",
            destination=user["email"],
            subject="RC Geradores — recuperação de senha",
            body=f"Use este link para redefinir sua senha. Ele expira em {PASSWORD_RESET_TTL // 60} minutos:\n\n{reset_url}",
            payload={"userId": user["id"]},
        )
    return True


def confirm_password_reset(token: str, new_password: str):
    user_id = platform_store.consume_password_reset(token)
    if not user_id:
        raise ValueError("Token inválido ou expirado")
    user = db.get_user(user_id)
    if not user:
        raise ValueError("Usuário não encontrado")
    db.update_user(user_id, {"password_hash": hash_password(new_password)}, actor="password-reset")
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    db.add_audit(user.get("email") or user_id, "password_reset", "user", user_id, "sessões revogadas")


def list_sessions(user_id: str):
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT token_hash,user_id,expires_at,created_at,last_seen,remote_ip,user_agent FROM sessions WHERE user_id=? ORDER BY last_seen DESC",
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["token_hash"][:16],
            "expiresAt": r["expires_at"],
            "createdAt": r["created_at"],
            "lastSeen": r["last_seen"],
            "remoteIp": r["remote_ip"],
            "userAgent": r["user_agent"],
        }
        for r in rows
    ]


def revoke_all_sessions(user_id: str):
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
