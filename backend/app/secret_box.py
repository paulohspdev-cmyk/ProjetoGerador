import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from .config import TOTP_KEY_FILE

PREFIX = "fernet:"


def _key() -> bytes:
    path = Path(TOTP_KEY_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except PermissionError:
        pass
    if not path.exists():
        key = Fernet.generate_key()
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        fd = os.open(path, flags, 0o600)
        try:
            os.write(fd, key + b"\n")
            os.fsync(fd)
        finally:
            os.close(fd)
    try:
        os.chmod(path, 0o600)
    except PermissionError:
        pass
    raw = path.read_bytes().strip()
    try:
        Fernet(raw)
    except Exception as exc:
        raise RuntimeError(f"Chave TOTP inválida em {path}") from exc
    return raw


def protect_secret(secret: str) -> str:
    clean = str(secret or "").strip()
    if not clean:
        raise ValueError("Segredo vazio")
    return PREFIX + Fernet(_key()).encrypt(clean.encode("ascii")).decode("ascii")


def reveal_secret(stored: str) -> tuple[str, bool]:
    value = str(stored or "").strip()
    if not value:
        raise ValueError("Segredo TOTP ausente")
    if not value.startswith(PREFIX):
        return value, True
    try:
        clear = Fernet(_key()).decrypt(value[len(PREFIX) :].encode("ascii")).decode("ascii")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise ValueError("Segredo TOTP não pode ser decriptado com a chave desta instalação") from exc
    return clear, False
