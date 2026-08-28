import json
import time

from . import db


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


def get_transport_config(generator_id: str):
    init_transport_db()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM generator_transport_config WHERE generator_id=?", (generator_id,)).fetchone()
    if not row:
        return {}
    try:
        return json.loads(row["config_json"] or "{}")
    except Exception:
        return {}


def set_transport_config(generator_id: str, config: dict, actor: str):
    init_transport_db()
    allowed = {
        "baudRate", "dataBits", "parity", "stopBits", "dtrEnable", "rtsEnable",
        "tcpPort", "host", "transMode", "timeoutMs", "pollDelayMs"
    }
    clean = {key: value for key, value in (config or {}).items() if key in allowed and value is not None}
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
    return clean


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
    return True
