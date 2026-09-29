"""Executor GenComm para comandos DSE homologados em Controller Pack específico.

O executor permanece fail-closed: relê modo, RPM, status e disponibilidade da
control key antes de qualquer FC16. A autorização por modelo/firmware/binding é
feita em control.command_contract. Neste release START, STOP/OFF, AUTO, MANUAL e TEST são promovidos
somente para o DSE4520 MKII 4.8.
"""

from __future__ import annotations

import asyncio
import struct

from . import db

CONTROL_ADDRESS = 4104
AVAILABILITY_ADDRESS = 4096
AVAILABILITY_COUNT = 8
MODE_ADDRESS = 772
STATUS_FLAGS_ADDRESS = 774
RPM_ADDRESS = 1030
STATE_MACHINE_TIMER_ADDRESS = 778
STATE_MACHINE_TIMER_COUNT = 3
NAMED_ALARM_HIGH_FUEL_ADDRESS = 154 * 256 + 10
WARNING_STATUS_MASK = 0x0400
BLOCKING_STATUS_MASK = 0x3800
KEY_STOP = 35700
KEY_AUTO = 35701
KEY_MANUAL = 35702
KEY_TEST = 35703
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
    direct = {
        "stop": (KEY_STOP, "STOP"),
        "off": (KEY_STOP, "OFF/STOP"),
        "auto": (KEY_AUTO, "AUTO"),
        "manual": (KEY_MANUAL, "MANUAL"),
        "test": (KEY_TEST, "TEST"),
    }
    if action in direct:
        key, label = direct[action]
        if not availability_has_key(registers, key):
            raise PermissionError(f"{label} não está disponível na página 16 desta controladora")
        return key
    if action != "start":
        raise ValueError(f"Ação DSE não suportada pelo executor GenComm: {action or '-'}")

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

    expected_modes = {"stop": 0, "off": 0, "auto": 1, "manual": 2, "test": 3}

    async with _ModbusTcp(host, port, unit) as client:
        mode = (await client.read_holding(MODE_ADDRESS, 1))[0]
        status_flags = (await client.read_holding(STATUS_FLAGS_ADDRESS, 1))[0]
        rpm_before = (await client.read_holding(RPM_ADDRESS, 1))[0]
        availability = await client.read_holding(AVAILABILITY_ADDRESS, AVAILABILITY_COUNT)
        timers_before = (
            await client.read_holding(STATE_MACHINE_TIMER_ADDRESS, STATE_MACHINE_TIMER_COUNT)
            if action == "start"
            else [0, 0, 0]
        )
        try:
            named_alarm_word = (await client.read_holding(NAMED_ALARM_HIGH_FUEL_ADDRESS, 1))[0]
            high_fuel_warning = ((named_alarm_word >> 4) & 0xF) == 2
        except Exception:
            high_fuel_warning = False
        if all(reg in {0, 0xFFFF} for reg in availability):
            raise PermissionError("Página 16 sem funções de controle declaradas; escrita bloqueada")
        if action == "start" and rpm_before > MAX_START_RPM:
            return {
                "ok": False, "accepted": False, "action": "start",
                "reason": f"partida bloqueada: motor já apresenta {rpm_before} rpm",
                "rpm_before": rpm_before, "mode_before": mode,
                "status_flags": status_flags, "availability": availability,
            }
        if action == "start" and (status_flags & BLOCKING_STATUS_MASK):
            return {
                "ok": False, "accepted": False, "action": "start",
                "reason": (
                    "partida bloqueada: status DSE indica electrical trip/shutdown/"
                    f"falha de unidade (0x{status_flags:04X})"
                ),
                "rpm_before": rpm_before, "mode_before": mode,
                "status_flags": status_flags, "availability": availability,
            }

        key = select_key(action, mode, availability)
        await client.write_multiple(CONTROL_ADDRESS, [key, complement(key)])

        deadline = asyncio.get_running_loop().time() + (
            15.0 if action == "start" else 30.0 if action == "stop" else 3.0
        )
        mode_after = mode
        rpm_after = rpm_before
        timers_after = list(timers_before)
        start_pending = False
        accepted = False
        while True:
            await asyncio.sleep(0.25)
            mode_after = (await client.read_holding(MODE_ADDRESS, 1))[0]
            rpm_after = (await client.read_holding(RPM_ADDRESS, 1))[0]
            if action == "start":
                timers_after = await client.read_holding(
                    STATE_MACHINE_TIMER_ADDRESS, STATE_MACHINE_TIMER_COUNT
                )
                start_pending = key == KEY_REMOTE_START_AUTO and any(
                    int(after) > 0 and int(after) != int(before)
                    for before, after in zip(timers_before, timers_after)
                )
                accepted = rpm_after > MAX_START_RPM or start_pending
            elif action == "stop":
                accepted = rpm_after <= MAX_START_RPM
            else:
                accepted = mode_after == expected_modes[action]
            if accepted or asyncio.get_running_loop().time() >= deadline:
                break

    warning_active = bool(status_flags & WARNING_STATUS_MASK)
    if accepted:
        if action == "start" and start_pending and rpm_after <= MAX_START_RPM:
            active_timer = max((int(value) for value in timers_after), default=0)
            reason = (
                "Pedido START aceito pela DSE; temporização interna ativa "
                f"({active_timer}s), aguardando partida/RPM"
            )
        elif action == "start":
            reason = f"START confirmado pela telemetria: {rpm_after} rpm"
        elif action == "stop":
            reason = f"STOP confirmado pela telemetria: {rpm_after} rpm"
        else:
            reason = f"{action.upper()} confirmado pela DSE: modo {mode}->{mode_after}"
    else:
        reason = (
            f"FC16 recebido pela DSE, mas {action.upper()} não foi confirmado; "
            f"modo={mode}->{mode_after}, rpm={rpm_before}->{rpm_after}. "
            "Verifique Panel Lock, Protected Start e permissivos/configuração do módulo."
        )

    result = {
        "ok": accepted,
        "accepted": accepted,
        "action": action,
        "reason": reason,
        "key": key,
        "mode_before": mode,
        "mode_after": mode_after,
        "mode_name": MODE_NAMES.get(int(mode_after), "desconhecido"),
        "rpm_before": rpm_before,
        "rpm_after": rpm_after,
        "availability": availability,
        "status_flags": status_flags,
        "warning_active": warning_active,
        "warnings": ["High fuel level"] if high_fuel_warning else [],
        "state_machine_timers_before": timers_before,
        "state_machine_timers_after": timers_after,
        "start_pending": start_pending,
        "running_confirmed": action == "start" and rpm_after > MAX_START_RPM,
        "lab": False,
    }
    try:
        db.add_event(
            generator["id"],
            "WARN" if accepted else "ERROR",
            (
                f"Controle DSE {action.upper()} {generator.get('tag')}: key={key} "
                f"aceito={accepted} modo={mode}->{mode_after} rpm={rpm_before}->{rpm_after} "
                f"status=0x{status_flags:04X}"
            ),
        )
    except Exception:
        pass
    return result
