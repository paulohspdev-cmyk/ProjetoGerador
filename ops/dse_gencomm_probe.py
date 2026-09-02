#!/usr/bin/env python3
"""Sonda DSE GenComm somente leitura para Modbus TCP ou RTU encapsulado em TCP."""

from __future__ import annotations

import argparse
import json
import socket
import struct
import time
from dataclasses import dataclass


class ProbeError(RuntimeError):
    pass


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


@dataclass
class Client:
    host: str
    port: int
    unit: int
    transport: str
    timeout: float
    transaction: int = 0

    def _exchange(self, payload: bytes, expected: int) -> bytes:
        started = time.monotonic()
        with socket.create_connection((self.host, self.port), timeout=self.timeout) as sock:
            sock.settimeout(self.timeout)
            sock.sendall(payload)
            chunks = bytearray()
            while len(chunks) < expected:
                part = sock.recv(expected - len(chunks))
                if not part:
                    break
                chunks.extend(part)
        if len(chunks) < expected:
            raise ProbeError(f"resposta incompleta: {len(chunks)}/{expected} bytes")
        self.last_latency_ms = round((time.monotonic() - started) * 1000, 1)
        return bytes(chunks)

    def read_holding(self, address: int, count: int) -> list[int]:
        if not 0 <= address <= 65535 or not 1 <= count <= 125:
            raise ValueError("faixa Modbus inválida")
        pdu = struct.pack(">BHH", 3, address, count)
        if self.transport == "modbus_tcp":
            self.transaction = (self.transaction + 1) & 0xFFFF
            request = struct.pack(">HHHB", self.transaction, 0, len(pdu) + 1, self.unit) + pdu
            header = self._exchange(request, 9)
            txid, protocol, length, unit, function, byte_count = struct.unpack(">HHHBBB", header)
            if txid != self.transaction or protocol != 0 or unit != self.unit:
                raise ProbeError("cabeçalho Modbus TCP não corresponde à consulta")
            if function & 0x80:
                raise ProbeError(f"exceção Modbus {byte_count}")
            if function != 3 or byte_count != count * 2 or length != byte_count + 3:
                raise ProbeError("resposta Modbus TCP inconsistente")
            body = self._exchange_tail_not_supported(header, request)
            return list(struct.unpack(f">{count}H", body))

        frame = bytes([self.unit]) + pdu
        request = frame + struct.pack("<H", crc16(frame))
        response = self._exchange(request, 5 + count * 2)
        if crc16(response[:-2]) != struct.unpack("<H", response[-2:])[0]:
            raise ProbeError("CRC inválido")
        if response[0] != self.unit:
            raise ProbeError("Unit ID não corresponde à consulta")
        if response[1] & 0x80:
            raise ProbeError(f"exceção Modbus {response[2]}")
        if response[1] != 3 or response[2] != count * 2:
            raise ProbeError("resposta RTU inconsistente")
        return list(struct.unpack(f">{count}H", response[3:-2]))

    def _exchange_tail_not_supported(self, header: bytes, request: bytes) -> bytes:
        # Modbus TCP precisa ser recebido na mesma conexão. Este método nunca deve ser chamado:
        # a implementação especializada abaixo preserva a conexão e substitui read_holding.
        raise AssertionError((header, request))


class TcpClient(Client):
    def read_holding(self, address: int, count: int) -> list[int]:
        self.transaction = (self.transaction + 1) & 0xFFFF
        pdu = struct.pack(">BHH", 3, address, count)
        request = struct.pack(">HHHB", self.transaction, 0, len(pdu) + 1, self.unit) + pdu
        started = time.monotonic()
        with socket.create_connection((self.host, self.port), timeout=self.timeout) as sock:
            sock.settimeout(self.timeout)
            sock.sendall(request)
            header = recv_exact(sock, 7)
            txid, protocol, length, unit = struct.unpack(">HHHB", header)
            body = recv_exact(sock, length - 1)
        self.last_latency_ms = round((time.monotonic() - started) * 1000, 1)
        if txid != self.transaction or protocol != 0 or unit != self.unit:
            raise ProbeError("cabeçalho Modbus TCP não corresponde à consulta")
        if not body:
            raise ProbeError("PDU vazia")
        if body[0] & 0x80:
            code = body[1] if len(body) > 1 else -1
            raise ProbeError(f"exceção Modbus {code}")
        if len(body) < 2 or body[0] != 3 or body[1] != count * 2:
            raise ProbeError("resposta Modbus TCP inconsistente")
        return list(struct.unpack(f">{count}H", body[2:]))


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = bytearray()
    while len(data) < size:
        part = sock.recv(size - len(data))
        if not part:
            raise ProbeError(f"conexão fechada após {len(data)}/{size} bytes")
        data.extend(part)
    return bytes(data)


def u32(words: list[int], offset: int) -> int | None:
    value = (words[offset] << 16) | words[offset + 1]
    return None if value >= 0xFFFFFFF8 else value


def s16(value: int) -> int | None:
    if 0x7FF8 <= value <= 0x7FFF:
        return None
    return value - 0x10000 if value & 0x8000 else value


def u16(value: int) -> int | None:
    return None if 0xFFF8 <= value <= 0xFFFF else value


def decode(args: argparse.Namespace) -> dict:
    cls = TcpClient if args.transport == "modbus_tcp" else Client
    client = cls(args.host, args.port, args.unit, args.transport, args.timeout)
    blocks: dict[str, list[int]] = {}
    errors: dict[str, str] = {}
    latencies: dict[str, float] = {}
    for name, address, count in (
        ("identity", 768, 7),
        ("engine", 1024, 35),
        ("accumulated", 1794, 16),
        ("control_support", 4096, 8),
        ("led_feedback", 48654, 8),
    ):
        try:
            blocks[name] = client.read_holding(address, count)
            latencies[name] = client.last_latency_ms
        except (OSError, ProbeError) as exc:
            errors[name] = str(exc)

    identity = blocks.get("identity", [])
    engine = blocks.get("engine", [])
    accumulated = blocks.get("accumulated", [])
    leds = blocks.get("led_feedback", [])
    result: dict = {
        "target": {"host": args.host, "port": args.port, "unit": args.unit, "transport": args.transport},
        "readOnly": True,
        "latencyMs": latencies,
        "errors": errors,
        "identity": {},
        "telemetry": {},
        "feedback": {},
        "controlSupportWords": blocks.get("control_support"),
    }
    if len(identity) == 7:
        result["identity"] = {
            "manufacturerCode": u16(identity[0]),
            "modelNumber": u16(identity[1]),
            "serialNumber": u32(identity, 2),
            "controlMode": u16(identity[4]),
            "statusWord": identity[6],
        }
    if len(engine) == 35:
        result["telemetry"] = {
            "oilPressureKpa": u16(engine[0]),
            "coolantTemperatureC": s16(engine[1]),
            "oilTemperatureC": s16(engine[2]),
            "fuelLevelPercent": u16(engine[3]),
            "alternatorVoltageV": None if u16(engine[4]) is None else u16(engine[4]) * 0.1,
            "batteryVoltageV": None if u16(engine[5]) is None else u16(engine[5]) * 0.1,
            "rpm": u16(engine[6]),
            "frequencyHz": None if u16(engine[7]) is None else u16(engine[7]) * 0.1,
            "voltageL1V": None if u32(engine, 8) is None else u32(engine, 8) * 0.1,
            "voltageL2V": None if u32(engine, 10) is None else u32(engine, 10) * 0.1,
            "voltageL3V": None if u32(engine, 12) is None else u32(engine, 12) * 0.1,
            "currentL1A": None if u32(engine, 20) is None else u32(engine, 20) * 0.1,
            "currentL2A": None if u32(engine, 22) is None else u32(engine, 22) * 0.1,
            "currentL3A": None if u32(engine, 24) is None else u32(engine, 24) * 0.1,
        }
    if len(accumulated) == 16:
        maintenance = u32(accumulated, 0)
        runtime = u32(accumulated, 4)
        energy = u32(accumulated, 6)
        starts = u32(accumulated, 14)
        result["telemetry"].update(
            {
                "maintenanceHours": None if maintenance is None else maintenance / 3600,
                "runHours": None if runtime is None else runtime / 3600,
                "gensetKwh": None if energy is None else energy * 0.1,
                "numberStarts": starts,
            }
        )
    if len(leds) == 8:
        result["feedback"] = {
            "stopLed": bool(leds[0]),
            "manualLed": bool(leds[1]),
            "testLed": bool(leds[2]),
            "autoLed": bool(leds[3]),
            "gcbClosedLed": bool(leds[6]),
            "engineRunningLed": bool(leds[7]),
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--unit", required=True, type=int, choices=range(1, 248), metavar="1..247")
    parser.add_argument("--transport", choices=("modbus_tcp", "rtu_over_tcp"), default="modbus_tcp")
    parser.add_argument("--timeout", type=float, default=2.0)
    args = parser.parse_args()
    print(json.dumps(decode(args), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
