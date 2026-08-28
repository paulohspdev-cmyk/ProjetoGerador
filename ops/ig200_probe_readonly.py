#!/usr/bin/env python3
"""Probe MODBUS/TCP somente leitura para InteliGen 200.

Uso de campo: coleta snapshots de registradores de VALORES (1000..2999) por
FC03/FC04 para correlação com a documentação e com estados observados do
controlador. Este utilitário NÃO implementa FC05/06/15/16 e recusa endereços
fora da faixa read-only de valores do IG200.

Exemplo:
  python3 ops/ig200_probe_readonly.py --port 25002 --unit 16 \
    --start 1000 --end 1099 --snapshot stopped --output /tmp/ig200-stopped.json
"""

from __future__ import annotations

import argparse
import json
import socket
import struct
import time
from pathlib import Path

READ_MIN = 1000
READ_MAX = 2999
MAX_REGS_PER_REQUEST = 32

# Referências do Global Guide / mapa default. São apenas âncoras de comparação:
# o mapa 1000..2999 é configurável e o resultado de campo é a autoridade.
KNOWN_DEFAULT = {
    1000: ("rpm", 1.0, "rpm"),
    1036: ("generator_voltage_l1_n", 1.0, "V"),
    1037: ("generator_voltage_l2_n", 1.0, "V"),
    1038: ("generator_voltage_l3_n", 1.0, "V"),
    1039: ("generator_voltage_l1_l2", 1.0, "V"),
    1040: ("generator_voltage_l2_l3", 1.0, "V"),
    1041: ("generator_voltage_l3_l1", 1.0, "V"),
    1045: ("generator_frequency", 0.01, "Hz"),
    1053: ("battery_voltage", 0.1, "V"),
    1068: ("binary_inputs_mask", 1.0, "bits"),
    1228: ("nominal_power", 1.0, "kW"),
}


def mbap(tid: int, unit: int, pdu: bytes) -> bytes:
    return struct.pack(">HHHB", tid, 0, len(pdu) + 1, unit) + pdu


def read_pdu(function: int, address: int, count: int) -> bytes:
    if function not in (3, 4):
        raise ValueError("somente FC03/FC04 são permitidas")
    return struct.pack(">BHH", function, address, count)


class ReadOnlyClient:
    def __init__(self, host: str, port: int, unit: int, function: int, timeout: float, delay: float):
        self.host = host
        self.port = port
        self.unit = unit
        self.function = function
        self.timeout = timeout
        self.delay = delay
        self.tid = 0

    def _next_tid(self) -> int:
        self.tid = (self.tid + 1) & 0xFFFF
        return self.tid

    @staticmethod
    def _recv_exact(sock: socket.socket, count: int) -> bytes:
        buf = bytearray()
        while len(buf) < count:
            chunk = sock.recv(count - len(buf))
            if not chunk:
                raise ConnectionError("conexão encerrada antes da resposta completa")
            buf.extend(chunk)
        return bytes(buf)

    def read(self, address: int, count: int) -> list[int]:
        if address < READ_MIN or address + count - 1 > READ_MAX:
            raise ValueError(f"faixa recusada: {address}..{address + count - 1}; permitido somente {READ_MIN}..{READ_MAX}")
        if count < 1 or count > MAX_REGS_PER_REQUEST:
            raise ValueError(f"count inválido: {count}")

        tid = self._next_tid()
        packet = mbap(tid, self.unit, read_pdu(self.function, address, count))
        with socket.create_connection((self.host, self.port), timeout=self.timeout) as sock:
            sock.settimeout(self.timeout)
            sock.sendall(packet)
            header = self._recv_exact(sock, 7)
            r_tid, proto, length, unit = struct.unpack(">HHHB", header)
            if r_tid != tid or proto != 0 or unit != self.unit or length < 2:
                raise ValueError(f"MBAP inválido: tid={r_tid} proto={proto} length={length} unit={unit}")
            pdu = self._recv_exact(sock, length - 1)

        time.sleep(self.delay)
        if not pdu:
            raise ValueError("PDU vazio")
        if pdu[0] & 0x80:
            code = pdu[1] if len(pdu) > 1 else -1
            raise ValueError(f"exceção Modbus FC{self.function:02d} código {code}")
        if pdu[0] != self.function or len(pdu) < 2:
            raise ValueError(f"resposta inesperada: {pdu.hex()}")
        byte_count = pdu[1]
        if byte_count != count * 2 or len(pdu) != 2 + byte_count:
            raise ValueError(f"tamanho inesperado: {pdu.hex()}")
        return [struct.unpack_from(">H", pdu, 2 + i * 2)[0] for i in range(count)]


def signed16(value: int) -> int:
    return value - 65536 if value & 0x8000 else value


def read_range_resilient(client: ReadOnlyClient, start: int, end: int, chunk: int):
    values: dict[int, int] = {}
    errors: dict[int, str] = {}

    def read_block(address: int, count: int):
        try:
            regs = client.read(address, count)
            for offset, value in enumerate(regs):
                values[address + offset] = value
        except Exception as exc:
            if count == 1:
                errors[address] = str(exc)
                return
            left = count // 2
            read_block(address, left)
            read_block(address + left, count - left)

    cursor = start
    while cursor <= end:
        count = min(chunk, end - cursor + 1)
        read_block(cursor, count)
        cursor += count
    return values, errors


def known_interpretations(values: dict[int, int]):
    out = []
    for address, (key, scale, unit) in KNOWN_DEFAULT.items():
        if address not in values:
            continue
        raw = values[address]
        item = {
            "address": address,
            "candidate": key,
            "raw": raw,
            "hex": f"0x{raw:04X}",
            "value": raw * scale,
            "unit": unit,
            "authority": "documented_default_candidate_not_field_map",
        }
        if address == 1068:
            item["default_binary_decode"] = {
                "BIN1_GCB_feedback": bool(raw & 0x0001),
                "BIN2_MCB_feedback": bool(raw & 0x0002),
                "BIN3_emergency_stop": bool(raw & 0x0004),
                "BIN4_access_lock": bool(raw & 0x0008),
                "BIN5_remote_off": bool(raw & 0x0010),
                "BIN6_remote_test": bool(raw & 0x0020),
                "BIN7_sd_override": bool(raw & 0x0040),
                "BIN8": bool(raw & 0x0080),
            }
        out.append(item)
    return out


def main():
    parser = argparse.ArgumentParser(description="Snapshot MODBUS read-only do InteliGen 200")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True, help="porta local da bridge, ex. 25002")
    parser.add_argument("--unit", type=int, required=True)
    parser.add_argument("--function", type=int, choices=(3, 4), default=3)
    parser.add_argument("--start", type=int, default=1000)
    parser.add_argument("--end", type=int, default=1099)
    parser.add_argument("--chunk", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=4.0)
    parser.add_argument("--delay", type=float, default=0.03)
    parser.add_argument("--snapshot", default="manual")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--also-nominal-power", action="store_true", help="lê também o endereço default 1228")
    args = parser.parse_args()

    if not (1 <= args.unit <= 247):
        parser.error("Unit ID deve estar entre 1 e 247")
    if not (READ_MIN <= args.start <= args.end <= READ_MAX):
        parser.error(f"somente a faixa read-only {READ_MIN}..{READ_MAX} é permitida")
    if not (1 <= args.chunk <= MAX_REGS_PER_REQUEST):
        parser.error(f"--chunk deve estar entre 1 e {MAX_REGS_PER_REQUEST}")

    client = ReadOnlyClient(args.host, args.port, args.unit, args.function, args.timeout, args.delay)
    values, errors = read_range_resilient(client, args.start, args.end, args.chunk)

    if args.also_nominal_power and not (args.start <= 1228 <= args.end):
        try:
            values[1228] = client.read(1228, 1)[0]
        except Exception as exc:
            errors[1228] = str(exc)

    report = {
        "schema": 1,
        "safety": "read_only_fc03_fc04_values_range_1000_2999",
        "snapshot": args.snapshot,
        "endpoint": {"host": args.host, "port": args.port, "unit": args.unit, "function": args.function},
        "range": {"start": args.start, "end": args.end},
        "known_default_candidates": known_interpretations(values),
        "registers": [
            {"address": address, "raw": raw, "hex": f"0x{raw:04X}", "signed16": signed16(raw)}
            for address, raw in sorted(values.items())
        ],
        "errors": [{"address": address, "error": error} for address, error in sorted(errors.items())],
    }

    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        print(f"Snapshot salvo em {args.output}")
    else:
        print(text, end="")

    print("\nÂncoras documentais encontradas:")
    for item in report["known_default_candidates"]:
        print(f"  {item['address']}: {item['candidate']} raw={item['raw']} -> {item['value']} {item['unit']}")
    print(f"\nRegistradores lidos: {len(values)} | erros isolados: {len(errors)}")
    print("Nenhum comando de escrita é implementado neste utilitário.")


if __name__ == "__main__":
    main()
