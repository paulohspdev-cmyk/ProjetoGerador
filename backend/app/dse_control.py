"""Comando GenComm START/STOP somente leitura da disponibilidade + FC16 atômico.

Usa as chaves documentadas no pack LAB DSE8610 / GenComm v2.38. A escrita só
ocorre depois de ler a página 16. Não envia AUTO, transferência nem disjuntores.
"""

from __future__ import annotations

import asyncio
import struct

from . import db

CONTROL_ADDRESS = 4104
AVAILABILITY_ADDRESS = 4096
AVAILABILITY_COUNT = 8
MODE_ADDRESS = 772
RPM_ADDRESS = 1030
KEY_STOP = 35700
KEY_START_MANUAL_OR_TEST = 35705
KEY_REMOTE_START_AUTO = 35732
KEY_BASE = 35700
MAX_START_RPM = 50
MODE_NAMES = {0: "stop", 1: "auto", 2: "manual", 3: "test", 4: "test_off_load"}


def complement(key: int) -> int:
    return int(key) ^ 0xFFFF


def availability_has_key(registers: list[int], key: int) -> bool:
    """GenComm page 16 usa o bit mais significativo de cada palavra como a primeira chave."""
    index = int(key) - KEY_BASE
    if index < 0 or index >= 16 * len(registers):
        return False
    bit = 15 - (index % 16)
    return bool(int(registers[index // 16]) & (1 << bit))


def select_key(action: str, mode: int, registers: list[int]) -> int:
    action = str(action or "").strip().lower()
    if action == "stop":
        if not availability_has_key(registers, KEY_STOP):
            raise PermissionError("STOP não está disponível na página 16 desta controladora")
        return KEY_STOP
    if action != "start":
        raise ValueError("Somente START e STOP estão liberados neste ensaio")

    mode_name = MODE_NAMES.get(int(mode), "desconhecido")
    if int(mode) in {2, 3, 4}:
        key = KEY_START_MANUAL_OR_TEST
    elif int(mode) == 1:
        key = KEY_REMOTE_START_AUTO
    else:
        raise PermissionError(
            f"START recusado: controladora em modo {mode_name} ({mode}). "
            "Coloque AUTO ou MANUAL no painel antes da partida remota."
        )
    if not availability_has_key(registers, key):
        raise PermissionError(
            f"START ({key}) não está disponível na página 16 em modo {mode_name}"
        )
    return key


class _ModbusTcp:
    def __init__(self, host: str, port: int, unit: int, timeout: float = 4.0):
        self.host = host
        self.port = port
        self.unit = unit
        self.timeout = timeout
        self.transaction = 0
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None

    async def __aenter__(self):
        self.reader, self.writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=self.timeout,
        )
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self.writer is not None:
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass

    async def _exchange(self, pdu: bytes, expected: int) -> bytes:
        if self.reader is None or self.writer is None:
            raise ConnectionError("sessão Modbus TCP encerrada")
        self.transaction = (self.transaction + 1) & 0xFFFF or 1
        request = struct.pack(">HHHB", self.transaction, 0, len(pdu) + 1, self.unit) + pdu
        self.writer.write(request)
        await self.writer.drain()
        header = await asyncio.wait_for(self.reader.readexactly(7), timeout=self.timeout)
        txn, protocol, length, unit = struct.unpack(">HHHB", header)
        if txn != self.transaction or protocol != 0 or unit != self.unit or length < 2:
            raise ValueError("cabeçalho Modbus TCP inválido")
        body = await asyncio.wait_for(self.reader.readexactly(length - 1), timeout=self.timeout)
        if not body:
            raise ValueError("PDU vazia")
        if body[0] & 0x80:
            raise PermissionError(f"exceção Modbus {body[1] if len(body) > 1 else 'desconhecida'}")
        if len(body) < expected:
            raise ValueError(f"resposta Modbus incompleta: {len(body)}/{expected}")
        return body

    async def read_holding(self, address: int, count: int) -> list[int]:
        pdu = struct.pack(">BHH", 3, address, count)
        body = await self._exchange(pdu, 2 + count * 2)
        if body[0] != 3 or body[1] != count * 2:
            raise ValueError("resposta FC03 inconsistente")
        return list(struct.unpack(f">{count}H", body[2 : 2 + count * 2]))

    async def write_multiple(self, address: int, values: list[int]) -> None:
        count = len(values)
        payload = b"".join(struct.pack(">H", int(value) & 0xFFFF) for value in values)
        pdu = struct.pack(">BHHB", 16, address, count, len(payload)) + payload
        body = await self._exchange(pdu, 5)
        if body[0] != 16:
            raise ValueError("resposta FC16 inconsistente")
        _, echo_address, echo_count = struct.unpack(">BHH", body[:5])
        if echo_address != address or echo_count != count:
            raise ValueError(f"eco FC16 inválido: address={echo_address} count={echo_count}")


async def send_command(generator: dict, action: str) -> dict:
    action = str(action or "").strip().lower()
    host = str(generator.get("host") or "").strip()
    port = int(generator.get("listen_port") or 502)
    unit = int(generator.get("modbus_unit") or 1)
    if not host:
        raise ValueError("Gerador DSE sem host TCP")

    async with _ModbusTcp(host, port, unit) as client:
        mode = (await client.read_holding(MODE_ADDRESS, 1))[0]
        rpm_before = (await client.read_holding(RPM_ADDRESS, 1))[0]
        availability = await client.read_holding(AVAILABILITY_ADDRESS, AVAILABILITY_COUNT)
        if all(reg in {0, 0xFFFF} for reg in availability):
            raise PermissionError(
                "Página 16 sem funções de controle declaradas; escrita bloqueada"
            )
        if action == "start" and rpm_before > MAX_START_RPM:
            return {
                "ok": False,
                "accepted": False,
                "action": "start",
                "reason": f"partida bloqueada: motor já apresenta {rpm_before} rpm",
                "rpm_before": rpm_before,
                "mode_before": mode,
                "availability": availability,
            }

        key = select_key(action, mode, availability)
        await client.write_multiple(CONTROL_ADDRESS, [key, complement(key)])
        await asyncio.sleep(0.4)
        mode_after = (await client.read_holding(MODE_ADDRESS, 1))[0]
        rpm_after = (await client.read_holding(RPM_ADDRESS, 1))[0]

    reason = (
        "FC16 GenComm aceito pela controladora; acompanhe partida/parada no painel e na telemetria Rapid"
    )
    result = {
        "ok": True,
        "accepted": True,
        "action": action,
        "reason": reason,
        "key": key,
        "mode_before": mode,
        "mode_after": mode_after,
        "mode_name": MODE_NAMES.get(int(mode), "desconhecido"),
        "rpm_before": rpm_before,
        "rpm_after": rpm_after,
        "availability": availability,
        "lab": True,
    }
    try:
        db.add_event(
            generator["id"],
            "WARN",
            (
                f"Controle DSE LAB {action.upper()} {generator.get('tag')}: key={key} "
                f"modo={mode}->{mode_after} rpm={rpm_before}->{rpm_after}"
            ),
        )
    except Exception:
        pass
    return result
