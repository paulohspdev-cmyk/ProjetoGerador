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

CORS_ORIGINS = [
    item.strip()
    for item in os.environ.get(
        "RC_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if item.strip()
]
