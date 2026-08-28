import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("RC_DATA_DIR", "/var/lib/rc-geradores"))
DB_FILE = Path(os.environ.get("RC_DB_FILE", DATA_DIR / "rc-geradores.db"))
RAPID_BINDINGS_FILE = Path(
    os.environ.get("RC_RAPID_BINDINGS", PROJECT_ROOT / "rapid" / "bindings.json")
)
RAPID_READER_DLL = Path(
    os.environ.get("RC_RAPID_READER", "/opt/rc-geradores/.rapid-reader/RcRapidReader.dll")
)
RAPID_COMM_CONFIG = Path(
    os.environ.get("RC_RAPID_COMM_CONFIG", "/opt/scada/ScadaComm/Config/ScadaCommConfig.xml")
)
RAPID_CACHE_TTL = float(os.environ.get("RC_RAPID_CACHE_TTL", "1.5"))
CONTROL_SOCKET = os.environ.get("RC_RAPID_CONTROL_SOCKET", "/run/rc-geradores/control.sock")

AUTH_COOKIE_NAME = os.environ.get("RC_AUTH_COOKIE", "rc_session")
AUTH_SESSION_TTL = int(os.environ.get("RC_AUTH_SESSION_TTL", "43200"))
AUTH_COOKIE_SECURE = os.environ.get("RC_AUTH_COOKIE_SECURE", "0").strip() == "1"
ADMIN_NAME = os.environ.get("RC_ADMIN_NAME", "Administrador")
ADMIN_EMAIL = os.environ.get("RC_ADMIN_EMAIL", "admin@rcgeradores.local").strip().lower()
ADMIN_PASSWORD = os.environ.get("RC_ADMIN_PASSWORD", "")
API_DOCS_ENABLED = os.environ.get("RC_API_DOCS", "0").strip() == "1"

CORS_ORIGINS = [
    item.strip()
    for item in os.environ.get(
        "RC_CORS_ORIGINS", "http://localhost,http://127.0.0.1"
    ).split(",")
    if item.strip()
]
