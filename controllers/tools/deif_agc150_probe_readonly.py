#!/usr/bin/env python3
"""DEIF AGC 150: sondagem Modbus/TCP *exclusivamente* FC04.

Os endereços do perfil GEN abaixo são candidatos documentais; é obrigatório
conferir variante, firmware, planilha DEIF 4189341212 e display em campo.
Nunca envia FC05/06/15/16, START, STOP, modo ou disjuntores.
"""
from __future__ import annotations

import argparse
import json
import socket
import struct

# Endereços PDU (base zero), não números PLC 300xxx.
# Tabela 4189341212, coluna GEN; confirmar variante/firmware.
MEASUREMENTS = {
    "voltage_l1_l2": (501, 1, "V"),
    "voltage_l2_l3": (502, 1, "V"),
    "voltage_l3_l1": (503, 1, "V"),
    "frequency_l1": (507, 0.01, "Hz"),
    "power_kw": (519, 1, "kW"),
}
FC_READ_INPUT_REGISTERS = 4


def _receive_exact(sock: socket.socket, size: int) -> bytes:
    result = bytearray()
    while len(result) < size:
        block = sock.recv(size - len(result))
        if not block:
            raise ConnectionError("conexão encerrada antes da resposta completa")
        result.extend(block)
    return bytes(result)


def request_frame(unit: int, address: int, transaction_id: int) -> bytes:
    if not 1 <= unit <= 247:
        raise ValueError("Unit ID deve estar entre 1 e 247")
    if not 0 <= address <= 65535:
        raise ValueError("endereço Modbus fora do limite")
    pdu = struct.pack(">BHH", FC_READ_INPUT_REGISTERS, address, 1)
    return struct.pack(">HHHB", transaction_id, 0, len(pdu) + 1, unit) + pdu


def decode_response(data: bytes, transaction_id: int, unit: int) -> int:
    if len(data) < 9:
        raise ValueError("resposta Modbus incompleta")
    actual_tid, protocol, length, actual_unit = struct.unpack(">HHHB", data[:7])
    if (actual_tid, protocol, actual_unit) != (transaction_id, 0, unit):
        raise ValueError("resposta não corresponde à requisição")
    if len(data) != length + 6:
        raise ValueError("tamanho da resposta inválido")
    pdu = data[7:]
    if len(pdu) == 2 and pdu[0] == (FC_READ_INPUT_REGISTERS | 0x80):
        raise ValueError(f"exceção Modbus FC04 código {pdu[1]}")
    if len(pdu) != 4 or pdu[0] != FC_READ_INPUT_REGISTERS or pdu[1] != 2:
        raise ValueError("resposta FC04 inválida")
    return struct.unpack(">h", pdu[2:4])[0]


def read_signed_input_register(host: str, port: int, unit: int, address: int, tid: int, timeout: float) -> int:
    payload = request_frame(unit, address, tid)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(payload)
        header = _receive_exact(sock, 7)
        _, _, length, _ = struct.unpack(">HHHB", header)
        if not 3 <= length <= 253:
            raise ValueError("comprimento MBAP inválido")
        return decode_response(header + _receive_exact(sock, length - 1), tid, unit)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sondagem DEIF AGC 150 somente FC04")
    parser.add_argument("--host", required=True, help="IP de gerador acessível a partir da VM")
    parser.add_argument("--port", type=int, default=502, help="porta TCP configurada no equipamento")
    parser.add_argument("--unit", required=True, type=int, help="Unit ID confirmado na controladora (sem suposições)")
    parser.add_argument("--timeout", type=float, default=2.5)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port deve estar entre 1 e 65535")
    if args.timeout <= 0 or args.timeout > 15:
        parser.error("--timeout deve ser maior que zero e até 15 segundos")
    readings = {}
    for tid, (name, (address, scale, unit_name)) in enumerate(MEASUREMENTS.items(), start=1):
        try:
            raw = read_signed_input_register(args.host, args.port, args.unit, address, tid, args.timeout)
            readings[name] = {"register": address, "raw": raw, "value": round(raw * scale, 3), "unit": unit_name}
        except (OSError, ConnectionError, ValueError) as exc:
            readings[name] = {"register": address, "error": str(exc)}
    print(json.dumps({"device": "DEIF AGC 150 (variante não confirmada)",
                      "endpoint": f"{args.host}:{args.port}",
                      "unit_id": args.unit, "read_only": True, "function": 4,
                      "measurements": readings}, ensure_ascii=False, indent=2))
    return 0 if all("value" in item for item in readings.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
