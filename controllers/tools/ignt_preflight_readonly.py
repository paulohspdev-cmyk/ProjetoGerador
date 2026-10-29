from __future__ import annotations

import argparse
import json
import socket
import struct
import time
from dataclasses import dataclass

READ_FUNCTION = 3
DEFAULT_LOCAL_PORT = 25031
DEFAULT_UNIT = 12

REGISTERS = {
    "battery_raw": (12, 1),
    "engine_state": (162, 1),
    "breaker_state": (163, 1),
    "mode": (167, 1),
    "rpm": (314, 1),
    "alarm_count": (6353, 1),
    "command_release": (6358, 2),
    "user_id": (6362, 1),
}

START_ENGINE_READY = 1
MODE_MANUAL = 1
BREAKERS_OFF = 1
RUNNING_STATES = {7, 8}
STOP_BREAKER_STATES = {1, 2, 3, 4, 10, 11}


class ModbusReadError(RuntimeError):
    pass


@dataclass
class Target:
    host: str
    port: int
    unit: int
    tag: str


def _recv_exact(sock: socket.socket, count: int) -> bytes:
    data = b""
    while len(data) < count:
        chunk = sock.recv(count - len(data))
        if not chunk:
            raise ModbusReadError("conexão encerrada antes da resposta completa")
        data += chunk
    return data


def read_holding(target: Target, address: int, count: int, tid: int, timeout: float) -> list[int]:
    request = struct.pack(
        ">HHHBBHH",
        tid & 0xFFFF,
        0,
        6,
        target.unit,
        READ_FUNCTION,
        address,
        count,
    )
    with socket.create_connection((target.host, target.port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(request)
        header = _recv_exact(sock, 7)
        rtid, proto, length, runit = struct.unpack(">HHHB", header)
        if rtid != (tid & 0xFFFF) or proto != 0 or runit != target.unit:
            raise ModbusReadError("MBAP de resposta não confere com a requisição")
        body = _recv_exact(sock, length - 1)

    if not body:
        raise ModbusReadError("resposta Modbus vazia")
    if body[0] & 0x80:
        code = body[1] if len(body) > 1 else -1
        raise ModbusReadError(f"exceção Modbus {code} no endereço {address}")
    expected_bytes = count * 2
    if body[0] != READ_FUNCTION or len(body) != 2 + expected_bytes or body[1] != expected_bytes:
        raise ModbusReadError(f"resposta FC03 inválida no endereço {address}: {body.hex()}")
    return [struct.unpack_from(">H", body, 2 + i * 2)[0] for i in range(count)]


def read_with_retry(
    target: Target,
    address: int,
    count: int,
    tid: int,
    timeout: float,
    retries: int,
) -> list[int]:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return read_holding(target, address, count, tid + attempt, timeout)
        except (OSError, ModbusReadError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(min(2.0 + attempt * 2.0, 6.0))
    raise ModbusReadError(str(last_error) if last_error else "falha de leitura")


def snapshot(target: Target, tid_seed: int, timeout: float, retries: int) -> dict:
    values: dict[str, int | float] = {}
    for offset, (name, (address, count)) in enumerate(REGISTERS.items()):
        regs = read_with_retry(target, address, count, tid_seed + offset * 8, timeout, retries)
        if count == 2:
            values[name] = (regs[0] << 16) | regs[1]
        else:
            values[name] = regs[0]
    values["battery_v"] = float(values["battery_raw"]) / 10.0
    return values


def evaluate_start(first: dict, second: dict) -> list[str]:
    blockers: list[str] = []
    for label, current, expected in (
        ("mode", (first["mode"], second["mode"]), MODE_MANUAL),
        ("engine_state", (first["engine_state"], second["engine_state"]), START_ENGINE_READY),
        ("breaker_state", (first["breaker_state"], second["breaker_state"]), BREAKERS_OFF),
        ("rpm", (first["rpm"], second["rpm"]), 0),
    ):
        if any(value != expected for value in current):
            blockers.append(f"{label}_not_{expected}")
    if first["alarm_count"] != 0 or second["alarm_count"] != 0:
        blockers.append("active_alarm_list_not_empty")
    if any(first[key] != second[key] for key in ("mode", "engine_state", "breaker_state", "rpm")):
        blockers.append("critical_state_changed_between_reads")
    return blockers


def evaluate_stop(first: dict, second: dict) -> list[str]:
    blockers: list[str] = []
    if first["mode"] != MODE_MANUAL or second["mode"] != MODE_MANUAL:
        blockers.append("controller_not_manual")
    if first["rpm"] <= 100 or second["rpm"] <= 100:
        blockers.append("engine_not_running")
    if first["engine_state"] not in RUNNING_STATES or second["engine_state"] not in RUNNING_STATES:
        blockers.append("engine_state_not_running")
    if first["breaker_state"] not in STOP_BREAKER_STATES or second["breaker_state"] not in STOP_BREAKER_STATES:
        blockers.append("breaker_state_not_stop_safe")
    if any(first[key] != second[key] for key in ("mode", "engine_state", "breaker_state")):
        blockers.append("critical_state_changed_between_reads")
    return blockers


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Preflight IG-NT somente leitura. Nunca envia FC06/FC16."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=DEFAULT_LOCAL_PORT)
    parser.add_argument("--unit", type=int, default=DEFAULT_UNIT)
    parser.add_argument("--tag", default="G-113")
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--gap", type=float, default=0.6)
    args = parser.parse_args()

    target = Target(args.host, args.port, args.unit, args.tag)
    result = {
        "target": args.tag,
        "transport": "local_mbap_to_reverse_tcp_rtu",
        "host": args.host,
        "port": args.port,
        "unit": args.unit,
        "writes_sent": False,
        "functions_used": [READ_FUNCTION],
        "status": "COMMUNICATION_BLOCKED",
        "start": {"ready": False, "blockers": ["not_evaluated"]},
        "stop": {"ready": False, "blockers": ["not_evaluated"]},
    }

    try:
        first = snapshot(target, 0x5100, args.timeout, args.retries)
        time.sleep(max(0.1, args.gap))
        second = snapshot(target, 0x6100, args.timeout, args.retries)
        start_blockers = evaluate_start(first, second)
        stop_blockers = evaluate_stop(first, second)
        result.update(
            {
                "snapshot_1": first,
                "snapshot_2": second,
                "status": "READY_FOR_FIELD_HOMOLOGATION" if not start_blockers else "PRECONDITION_BLOCKED",
                "start": {"ready": not start_blockers, "blockers": start_blockers},
                "stop": {"ready": not stop_blockers, "blockers": stop_blockers},
            }
        )
    except Exception as exc:
        result["communication_error"] = str(exc)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] != "COMMUNICATION_BLOCKED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
