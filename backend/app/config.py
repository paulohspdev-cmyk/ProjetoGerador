import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("RC_DATA_DIR", "/var/lib/rc-geradores"))
DB_FILE = Path(os.environ.get("RC_DB_FILE", DATA_DIR / "rc-geradores.db"))
RAPID_BINDINGS_FILE = Path(os.environ.get("RC_RAPID_BINDINGS", PROJECT_ROOT / "rapid" / "bindings.json"))
RAPID_READER_DLL = Path(os.environ.get("RC_RAPID_READER", "/opt/rc-geradores/.rapid-reader/RcRapidReader.dll"))
RAPID_COMM_CONFIG = Path(os.environ.get("RC_RAPID_COMM_CONFIG", "/opt/scada/ScadaComm/Config/ScadaCommConfig.xml"))
RAPID_CACHE_TTL = float(os.environ.get("RC_RAPID_CACHE_TTL", "1.5"))
CONTROL_SOCKET = os.environ.get("RC_RAPID_CONTROL_SOCKET", "/run/rc-geradores/control.sock")
BRIDGE_STATUS_FILE = Path(os.environ.get("RC_BRIDGE_STATUS_FILE", "/run/rc-geradores/bridge-status.json"))
APP_VERSION = os.environ.get("RC_APP_VERSION", "3.0.0").strip() or "3.0.0"

AUTH_COOKIE_NAME = os.environ.get("RC_AUTH_COOKIE", "rc_session")
AUTH_SESSION_TTL = int(os.environ.get("RC_AUTH_SESSION_TTL", "43200"))
# Desenvolvimento/testes locais podem manter HTTP quando não usam o instalador.
# A instalação de produção grava explicitamente RC_AUTH_COOKIE_SECURE=1.
AUTH_COOKIE_SECURE = os.environ.get("RC_AUTH_COOKIE_SECURE", "0").strip() == "1"
LOGIN_MAX_FAILURES = int(os.environ.get("RC_LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCK_SECONDS = int(os.environ.get("RC_LOGIN_LOCK_SECONDS", "900"))
PASSWORD_RESET_TTL = int(os.environ.get("RC_PASSWORD_RESET_TTL", "1800"))
PUBLIC_BASE_URL = os.environ.get("RC_PUBLIC_BASE_URL", "").rstrip("/")

ADMIN_NAME = os.environ.get("RC_ADMIN_NAME", "Administrador")
ADMIN_EMAIL = os.environ.get("RC_ADMIN_EMAIL", "admin@rcgeradores.local").strip().lower()
ADMIN_PASSWORD = os.environ.get("RC_ADMIN_PASSWORD", "")
API_DOCS_ENABLED = os.environ.get("RC_API_DOCS", "0").strip() == "1"

SMTP_HOST = os.environ.get("RC_SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("RC_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("RC_SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("RC_SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("RC_SMTP_FROM", "").strip()
SMTP_STARTTLS = os.environ.get("RC_SMTP_STARTTLS", "1").strip() == "1"
WHATSAPP_API_URL = os.environ.get("RC_WHATSAPP_API_URL", "").strip()
WHATSAPP_API_TOKEN = os.environ.get("RC_WHATSAPP_API_TOKEN", "")
ALLOW_PRIVATE_WEBHOOKS = os.environ.get("RC_ALLOW_PRIVATE_WEBHOOKS", "0").strip() == "1"
BACKUP_RETENTION = int(os.environ.get("RC_BACKUP_RETENTION", "14"))

CORS_ORIGINS = [
    item.strip()
    for item in os.environ.get("RC_CORS_ORIGINS", "http://localhost,http://127.0.0.1").split(",")
    if item.strip()
]
