#!/usr/bin/env python3
"""Probe de homologacao do IG4 200 - SOMENTE LEITURA.

Este utilitario nao escreve qualquer registrador e nao envia comandos.
Ele verifica, via bridge local Modbus TCP, se os Units IG4 respondem nos
registradores reservados que a familia ComAp usa para comunicacao/comandos.

A presenca destes registradores NAO homologa comandos por si so. Ela apenas
qualifica a proxima etapa de ensaio controlado.
"""

from __future__ import annotations

import argparse
import socket
import struct
import time

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 25003
DEFAULT_TIMEOUT = 5.0

# Somente registradores de leitura. 4209 (command code) e 4211 (password)
# sao deliberadamente excluidos porque sao definidos como write-only em guias
# ComAp da familia e nao sao necessarios para este probe.
PROBES = [
    ("last_application_error", 4205, 2),
    ("command_argument_or_return", 4207, 2),
    ("communication_status", 4212, 2),
    ("alarm_list_count", 4214, 1),
    ("controller_mode", 1320, 1),
    ("engine_state", 1322, 1),
    ("breaker_state", 1323, 1),
    ("rpm", 1000, 1),
    ("battery_voltage_raw", 1051, 1),
]


def recv_exact(sock: socket.socket, count: int) -> bytes:
    data = b""
    while len(data) < count:
        chunk = sock.recv(count - len(data))
        if not chunk:
            raise ConnectionError("conexao encerrada")
        data += chunk
    return data


def read_holding(host: str, port: int, timeout: float, unit: int, address: int, count: int):
    tid = ((unit & 0xFF) << 8 | (address & 0xFF)) & 0xFFFF
    pdu = struct.pack(">BHH", 3, address, count)
    frame = struct.pack(">HHHB", tid, 0, len(pdu) + 1, unit) + pdu

    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        started = time.monotonic()
        sock.sendall(frame)
        header = recv_exact(sock, 7)
        rtid, proto, length, runit = struct.unpack(">HHHB", header)
        body = recv_exact(sock, length - 1)
        elapsed_ms = (time.monotonic() - started) * 1000

    if rtid != tid or proto != 0 or runit != unit:
        raise RuntimeError("resposta MBAP invalida")
    if not body:
        raise RuntimeError("resposta vazia")
    if body[0] & 0x80:
        code = body[1] if len(body) > 1 else -1
        return {"ok": False, "exception": code, "elapsed_ms": elapsed_ms}
    if body[0] != 3 or len(body) < 2:
        raise RuntimeError(f"resposta FC03 invalida: {body.hex()}")
    byte_count = body[1]
    if byte_count != count * 2 or len(body) != 2 + byte_count:
        raise RuntimeError(f"tamanho FC03 invalido: {body.hex()}")
    regs = [struct.unpack_from(">H", body, 2 + i * 2)[0] for i in range(count)]
    return {"ok": True, "regs": regs, "elapsed_ms": elapsed_ms}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    parser.add_argument("--units", default="3,4")
    args = parser.parse_args()

    units = []
    for raw in args.units.split(","):
        unit = int(raw.strip())
        if not 1 <= unit <= 247:
            raise SystemExit(f"Unit ID invalido: {unit}")
        units.append(unit)

    print("IG4 200 - HOMOLOGATION READ-ONLY PROBE")
    print("FC03 only. No writes. No commands.\n")

    all_ok = True
    for unit in units:
        print("=" * 72)
        print(f"UNIT {unit}")
        print("=" * 72)
        for name, address, count in PROBES:
            try:
                result = read_holding(args.host, args.port, args.timeout, unit, address, count)
                if result["ok"]:
                    regs = result["regs"]
                    print(
                        f"{name:28} reg={address:<5} count={count} "
                        f"raw={regs} time={result['elapsed_ms']:.0f}ms"
                    )
                else:
                    all_ok = False
                    print(
                        f"{name:28} reg={address:<5} count={count} "
                        f"MODBUS_EXCEPTION={result['exception']} "
                        f"time={result['elapsed_ms']:.0f}ms"
                    )
            except Exception as exc:
                all_ok = False
                print(f"{name:28} reg={address:<5} ERROR {type(exc).__name__}: {exc}")

    print("\n" + "=" * 72)
    print("NO WRITES WERE SENT")
    print("RESULT:", "READ BLOCK PRESENT" if all_ok else "REVIEW REQUIRED")
    print("=" * 72)
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
