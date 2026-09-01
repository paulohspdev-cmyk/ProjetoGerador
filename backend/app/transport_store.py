import json
import os
import time

from . import db

BRIDGE_TIMEOUT_MS = max(
    500,
    int(float(os.environ.get("RC_RAPID_BRIDGE_TIMEOUT", "4")) * 1000),
)
DEFAULT_DEVICE_TIMEOUT_MS = max(
    BRIDGE_TIMEOUT_MS + 1000,
    int(os.environ.get("RC_MODBUS_DEVICE_TIMEOUT_MS", "5500")),
)
DEFAULT_POLL_DELAY_MS = max(
    100,
    int(os.environ.get("RC_MODBUS_POLL_DELAY_MS", "1000")),
)


def init_transport_db():
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS generator_transport_config(
                generator_id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL DEFAULT '{}',
                updated_by TEXT NOT NULL DEFAULT 'system',
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(generator_id) REFERENCES generators(id) ON DELETE CASCADE
            )"""
        )


def _defaults():
    return {
        "timeoutMs": DEFAULT_DEVICE_TIMEOUT_MS,
        "pollDelayMs": DEFAULT_POLL_DELAY_MS,
    }


def get_transport_config(generator_id: str):
    init_transport_db()
    with db.connect() as conn:
        row = conn.execute(
            "SELECT * FROM generator_transport_config WHERE generator_id=?",
            (generator_id,),
        ).fetchone()
    if not row:
        return _defaults()
    try:
        stored = json.loads(row["config_json"] or "{}")
        if not isinstance(stored, dict):
            stored = {}
    except Exception:
        stored = {}
    return {**_defaults(), **stored}


def set_transport_config(generator_id: str, config: dict, actor: str):
    init_transport_db()
    allowed = {
        "baudRate", "dataBits", "parity", "stopBits", "dtrEnable", "rtsEnable",
        "tcpPort", "host", "transMode", "timeoutMs", "pollDelayMs"
    }
    clean = {key: value for key, value in (config or {}).items() if key in allowed and value is not None}

    if "timeoutMs" in clean:
        timeout_ms = int(clean["timeoutMs"])
        if not 1000 <= timeout_ms <= 30000:
            raise ValueError("timeoutMs deve ficar entre 1000 e 30000 ms")
        if timeout_ms <= BRIDGE_TIMEOUT_MS:
            raise ValueError(
                f"timeoutMs deve ser maior que o timeout da bridge ({BRIDGE_TIMEOUT_MS} ms)"
            )
        clean["timeoutMs"] = timeout_ms
    if "pollDelayMs" in clean:
        poll_delay_ms = int(clean["pollDelayMs"])
        if not 100 <= poll_delay_ms <= 60000:
            raise ValueError("pollDelayMs deve ficar entre 100 e 60000 ms")
        clean["pollDelayMs"] = poll_delay_ms

    now = int(time.time())
    with db.connect() as conn:
        exists = conn.execute("SELECT 1 FROM generators WHERE id=?", (generator_id,)).fetchone()
        if not exists:
            raise ValueError("Gerador não encontrado")
        conn.execute(
            """INSERT INTO generator_transport_config(generator_id,config_json,updated_by,updated_at) VALUES (?,?,?,?)
               ON CONFLICT(generator_id) DO UPDATE SET config_json=excluded.config_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at""",
            (generator_id, json.dumps(clean, ensure_ascii=False), actor, now),
        )
    db.add_audit(actor, "update", "transport_config", generator_id, ",".join(sorted(clean.keys())))
    return {**_defaults(), **clean}


def validate_for_transport(generator: dict, config: dict):
    transport = generator.get("transport")
    if transport == "reverse_tcp":
        port = int(generator.get("listen_port") or 0)
        if not 1 <= port <= 65535:
            raise ValueError("TCP reverso exige porta de escuta válida")
    elif transport in {"modbus_tcp_direct", "rtu_over_tcp"}:
        host = str(generator.get("host") or config.get("host") or "").strip()
        port = int(generator.get("listen_port") or config.get("tcpPort") or (502 if transport == "modbus_tcp_direct" else 0))
        if not host:
            raise ValueError("Transporte TCP direto exige host/IP")
        if not 1 <= port <= 65535:
            raise ValueError("Transporte TCP direto exige porta válida")
    elif transport == "modbus_rtu_serial":
        port_name = str(generator.get("host") or config.get("host") or "").strip()
        if not port_name:
            raise ValueError("Serial exige dispositivo, por exemplo /dev/ttyUSB0")
        baud = int(config.get("baudRate") or 0)
        if baud <= 0:
            raise ValueError("Serial exige baudRate explícito")
        if str(config.get("parity") or "") not in {"None", "Even", "Odd", "Mark", "Space"}:
            raise ValueError("Serial exige parity explícita: None, Even, Odd, Mark ou Space")
        if str(config.get("stopBits") or "") not in {"One", "Two", "OnePointFive"}:
            raise ValueError("Serial exige stopBits explícito")
    else:
        raise ValueError(f"Transporte não suportado: {transport}")

    timeout_ms = int(config.get("timeoutMs") or DEFAULT_DEVICE_TIMEOUT_MS)
    if timeout_ms <= BRIDGE_TIMEOUT_MS:
        raise ValueError(
            f"timeoutMs do Rapid deve ser maior que o timeout da bridge ({BRIDGE_TIMEOUT_MS} ms)"
        )
    return True
