"""Runtime da bridge RC.

A bridge atende equipamentos que iniciam a conexão TCP com a VM.

Dois enquadramentos de fio são suportados no lado remoto:
- Modbus TCP/MBAP (padrão histórico de ``reverse_tcp``);
- Modbus RTU transparente sobre TCP quando o Controller Pack declara
  ``reverseTcpFraming=modbus_rtu``. Nesse modo o modem/DTU transporta o
  barramento RS485 e a bridge converte MBAP local <-> RTU+CRC remoto.

O caminho local usado pelo Rapid SCADA permanece Modbus TCP e somente leitura
FC03/FC04. O controle privilegiado continua globalmente desabilitado por padrão
e jamais é liberado para framing RTU reverso.
"""

import asyncio
import ipaddress
import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path

from . import bridge, db
from .controller_library import pack_for_model

STATUS_FILE = Path(os.environ.get("RC_BRIDGE_STATUS_FILE", "/run/rc-geradores/bridge-status.json"))
CONNECT_RATE_LIMIT = max(1, int(os.environ.get("RC_RAPID_CONNECT_RATE_LIMIT", "30")))
REPLACE_ACTIVE_AFTER = max(5, int(os.environ.get("RC_RAPID_REPLACE_ACTIVE_AFTER", "30")))
REQUIRE_ALLOWLIST = os.environ.get("RC_RAPID_REQUIRE_ALLOWLIST", "0").strip() == "1"
UNIT_BACKOFF_BASE = max(0.5, float(os.environ.get("RC_RAPID_UNIT_BACKOFF_BASE", "5")))
UNIT_BACKOFF_MAX = max(
    UNIT_BACKOFF_BASE,
    float(os.environ.get("RC_RAPID_UNIT_BACKOFF_MAX", "30")),
)

FRAMING_MODBUS_TCP = "modbus_tcp"
FRAMING_MODBUS_RTU = "modbus_rtu"
SUPPORTED_REMOTE_FRAMINGS = {FRAMING_MODBUS_TCP, FRAMING_MODBUS_RTU}


def _allowed_networks():
    raw = os.environ.get("RC_RAPID_REMOTE_ALLOWED_CIDRS", "").strip()
    if not raw:
        if REQUIRE_ALLOWLIST:
            raise RuntimeError(
                "RC_RAPID_REQUIRE_ALLOWLIST=1 exige RC_RAPID_REMOTE_ALLOWED_CIDRS"
            )
        return []
    networks = []
    for item in raw.split(","):
        text = item.strip()
        if not text:
            continue
        try:
            networks.append(ipaddress.ip_network(text, strict=False))
        except ValueError as exc:
            raise RuntimeError(f"CIDR reverse TCP inválido: {text}") from exc
    if REQUIRE_ALLOWLIST and not networks:
        raise RuntimeError("Allowlist reverse TCP obrigatória, mas ficou vazia")
    return networks


REMOTE_ALLOWED_NETWORKS = _allowed_networks()


def _remote_framing_for_generator(generator: dict) -> str:
    """Resolve framing remoto por Controller Pack sem alterar o cadastro legado.

    ``reverse_tcp`` continua Modbus TCP por padrão. Um pack pode declarar
    explicitamente ``reverseTcpFraming=modbus_rtu`` para modem/DTU transparente
    conectado a RS485. Valores ausentes mantêm o comportamento histórico.
    """

    pack = pack_for_model(generator.get("controller_model") or "")
    framing = str((pack or {}).get("reverseTcpFraming") or FRAMING_MODBUS_TCP).strip().lower()
    if framing not in SUPPORTED_REMOTE_FRAMINGS:
        raise ValueError(
            f"Controller Pack {generator.get('controller_model') or generator.get('id')} "
            f"declara reverseTcpFraming inválido: {framing}"
        )
    return framing


def resolve_ig200_bound_device(device_num):
    """Resolve um IG200 Modbus TCP pelo Rapid Device sem hardcode do Device 200."""
    device_num = int(device_num or 0)
    if device_num <= 0:
        raise ValueError("Rapid Device inválido para controle IG200")

    binding = next(
        (
            item
            for item in bridge.load_bindings()
            if int(item.get("rapid_device_num") or 0) == device_num
            and str(item.get("controller_type", "")).upper() == "COMAP"
            and str(item.get("controller_model", "")).strip().lower() == "inteligen 200"
            and str(item.get("transport") or "") == "reverse_tcp"
        ),
        None,
    )
    if not binding:
        raise ValueError(f"binding InteliGen 200 reverse TCP não encontrado para Rapid Device {device_num}")

    port = int(binding.get("listen_port") or 0)
    unit = int(binding.get("modbus_unit") or 0)
    generator = next(
        (
            item
            for item in db.list_generators()
            if int(item.get("rapid_device_num") or 0) == device_num
            and int(item.get("listen_port") or 0) == port
            and int(item.get("modbus_unit") or 0) == unit
            and str(item.get("controller_type", "")).upper() == "COMAP"
            and str(item.get("controller_model", "")).strip().lower() == "inteligen 200"
            and str(item.get("transport") or "") == "reverse_tcp"
        ),
        None,
    )
    if not generator:
        raise ValueError("gerador InteliGen 200 correspondente não encontrado no cadastro")
    if not generator.get("enabled"):
        raise ValueError("gerador está desabilitado no cadastro")
    if _remote_framing_for_generator(generator) != FRAMING_MODBUS_TCP:
        raise PermissionError("controle IG200 bloqueado: framing remoto não é Modbus TCP homologado")
    return generator, port, unit


bridge.resolve_ig200 = resolve_ig200_bound_device


def _modbus_crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def _rtu_frame(unit: int, pdu: bytes) -> bytes:
    if not 1 <= int(unit) <= 247:
        raise ValueError(f"Unit ID RTU inválido: {unit}")
    body = bytes([int(unit)]) + bytes(pdu)
    crc = _modbus_crc16(body)
    return body + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


def _validate_rtu_crc(frame: bytes) -> None:
    if len(frame) < 4:
        raise ValueError("frame RTU curto")
    received = frame[-2] | (frame[-1] << 8)
    calculated = _modbus_crc16(frame[:-2])
    if received != calculated:
        raise ValueError(
            f"CRC RTU inválido: recebido=0x{received:04X} calculado=0x{calculated:04X}"
        )


class HardenedBridgePort(bridge.BridgePort):
    """Protege peer e impede um Unit em timeout de monopolizar a linha compartilhada."""

    remote_framing = FRAMING_MODBUS_TCP

    def __init__(self, remote_port):
        super().__init__(remote_port)
        self._attempts = defaultdict(deque)
        self.rejected_connections = 0
        self._unit_consecutive_timeouts: dict[int, int] = {}
        self._unit_backoff_until: dict[int, float] = {}
        self._unit_last_timeout_at: dict[int, int] = {}
        self._unit_last_response_at: dict[int, int] = {}
        self.unit_backoff_skips = 0

    @staticmethod
    def _peer_ip(peer):
        if not isinstance(peer, (tuple, list)) or not peer:
            return None
        try:
            return ipaddress.ip_address(str(peer[0]))
        except ValueError:
            return None

    def _allowed(self, address) -> bool:
        if address is None:
            return False
        if not REMOTE_ALLOWED_NETWORKS:
            return True
        return any(address in network for network in REMOTE_ALLOWED_NETWORKS)

    def _rate_allowed(self, address, now: float) -> bool:
        key = str(address)
        bucket = self._attempts[key]
        cutoff = now - 60.0
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= CONNECT_RATE_LIMIT:
            return False
        bucket.append(now)
        if len(self._attempts) > 2048:
            for old_key in list(self._attempts):
                old_bucket = self._attempts[old_key]
                while old_bucket and old_bucket[0] < cutoff:
                    old_bucket.popleft()
                if not old_bucket:
                    self._attempts.pop(old_key, None)
        return True

    def _active_peer_is_protected(self, incoming, now_epoch: int) -> bool:
        current_writer = self.remote_writer
        if current_writer is None or current_writer.is_closing():
            return False
        current = self._peer_ip(self.remote_peer)
        if current is None or current == incoming:
            return False
        activity = max(
            int(self.connected_at or 0),
            int(self.last_rx_at or 0),
            int(self.last_tx_at or 0),
        )
        return activity > 0 and now_epoch - activity < REPLACE_ACTIVE_AFTER

    async def _reject(self, writer, reason: str) -> None:
        self.rejected_connections += 1
        peer = writer.get_extra_info("peername")
        bridge.log(f"porta {self.remote_port}: conexão rejeitada de {peer}: {reason}")
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

    def _clear_unit_backoff(self) -> None:
        self._unit_consecutive_timeouts.clear()
        self._unit_backoff_until.clear()
        self._unit_last_timeout_at.clear()
        self._unit_last_response_at.clear()

    def _unit_health_snapshot(self) -> dict[str, dict]:
        now = time.monotonic()
        units = set(self._unit_consecutive_timeouts)
        units.update(self._unit_backoff_until)
        units.update(self._unit_last_timeout_at)
        units.update(self._unit_last_response_at)
        return {
            str(unit): {
                "consecutiveTimeouts": int(self._unit_consecutive_timeouts.get(unit, 0)),
                "backoffRemainingSeconds": round(
                    max(0.0, self._unit_backoff_until.get(unit, 0.0) - now),
                    3,
                ),
                "lastTimeoutAt": self._unit_last_timeout_at.get(unit),
                "lastResponseAt": self._unit_last_response_at.get(unit),
            }
            for unit in sorted(units)
        }

    async def accept_remote(self, reader, writer):
        peer = writer.get_extra_info("peername")
        address = self._peer_ip(peer)
        now_mono = time.monotonic()
        now_epoch = int(time.time())
        if not self._allowed(address):
            await self._reject(writer, "origem fora da allowlist")
            return
        if not self._rate_allowed(address, now_mono):
            await self._reject(writer, "limite de conexões por minuto excedido")
            return
        if self._active_peer_is_protected(address, now_epoch):
            await self._reject(writer, "sessão legítima de outro peer ainda está ativa")
            return
        # Uma nova sessão física dá a todos os Units uma oportunidade imediata de recuperação.
        self._clear_unit_backoff()
        await super().accept_remote(reader, writer)

    async def transact(self, local_tid, unit, pdu):
        if not pdu:
            return bridge.exception_pdu(0, 3)
        function = pdu[0]
        if function not in bridge.READ_FUNCTIONS:
            return bridge.exception_pdu(function, 1)

        unit = int(unit)
        async with self.remote_lock:
            loop = asyncio.get_running_loop()
            now_mono = loop.time()
            until = self._unit_backoff_until.get(unit, 0.0)
            if until > now_mono:
                self.unit_backoff_skips += 1
                return bridge.exception_pdu(function, 11)

            writer = self.remote_writer
            try:
                response = await self.request_locked(unit, pdu)
                self._unit_consecutive_timeouts[unit] = 0
                self._unit_backoff_until.pop(unit, None)
                self._unit_last_response_at[unit] = int(time.time())
                return response
            except asyncio.TimeoutError:
                self.timeouts += 1
                failures = int(self._unit_consecutive_timeouts.get(unit, 0)) + 1
                self._unit_consecutive_timeouts[unit] = failures
                delay = min(UNIT_BACKOFF_MAX, UNIT_BACKOFF_BASE * (2 ** min(failures - 1, 8)))
                self._unit_backoff_until[unit] = loop.time() + delay
                self._unit_last_timeout_at[unit] = int(time.time())
                bridge.log(
                    f"porta {self.remote_port}: timeout Unit {unit} FC{function:02d}; "
                    f"backoff {delay:.1f}s sem derrubar os demais Units"
                )
                return bridge.exception_pdu(function, 11)
            except (ConnectionError, asyncio.IncompleteReadError) as exc:
                self.errors += 1
                bridge.log(
                    f"porta {self.remote_port}: conexão perdida Unit {unit} FC{function:02d}: "
                    f"{type(exc).__name__}"
                )
                await self.clear_remote(only_writer=writer)
                return bridge.exception_pdu(function, 11)
            except Exception as exc:
                self.errors += 1
                bridge.log(
                    f"porta {self.remote_port}: erro remoto Unit {unit} FC{function:02d}: {exc}"
                )
                await self.clear_remote(only_writer=writer)
                return bridge.exception_pdu(function, 11)

    def snapshot(self):
        return {
            **super().snapshot(),
            "remoteFraming": self.remote_framing,
            "rejectedConnections": self.rejected_connections,
            "peerAllowlistEnabled": bool(REMOTE_ALLOWED_NETWORKS),
            "peerAllowlistRequired": REQUIRE_ALLOWLIST,
            "connectRateLimitPerMinute": CONNECT_RATE_LIMIT,
            "activePeerProtectionSeconds": REPLACE_ACTIVE_AFTER,
            "unitBackoffBaseSeconds": UNIT_BACKOFF_BASE,
            "unitBackoffMaxSeconds": UNIT_BACKOFF_MAX,
            "unitBackoffSkips": self.unit_backoff_skips,
            "unitHealth": self._unit_health_snapshot(),
        }


class HardenedRtuBridgePort(HardenedBridgePort):
    """Converte MBAP local do Rapid para Modbus RTU transparente no modem."""

    remote_framing = FRAMING_MODBUS_RTU

    async def _read_rtu_response(self, expected_unit: int, expected_function: int) -> bytes:
        reader = self.remote_reader
        if reader is None:
            raise ConnectionError("modem desconectado")

        loop = asyncio.get_running_loop()
        deadline = loop.time() + bridge.TIMEOUT

        async def read_exactly(count: int) -> bytes:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise asyncio.TimeoutError()
            data = await asyncio.wait_for(reader.readexactly(count), remaining)
            self.bytes_rx += len(data)
            self.last_rx_at = int(time.time())
            return data

        head = await read_exactly(2)
        unit, function = head[0], head[1]

        if unit != int(expected_unit):
            raise ValueError(f"Unit ID RTU inesperado {unit}; esperado {int(expected_unit)}")
        if function not in (expected_function, expected_function | 0x80):
            raise ValueError(f"função RTU inesperada {function}; esperada {expected_function}")

        if function & 0x80:
            tail = await read_exactly(3)
            frame = head + tail
            _validate_rtu_crc(frame)
            return frame[1:-2]

        if function not in bridge.READ_FUNCTIONS:
            raise PermissionError(f"FC{function:02d} bloqueada no caminho RTU somente leitura")

        byte_count_raw = await read_exactly(1)
        byte_count = byte_count_raw[0]
        if byte_count <= 0 or byte_count > 250:
            raise ValueError(f"byte count RTU inválido: {byte_count}")

        tail = await read_exactly(byte_count + 2)
        frame = head + byte_count_raw + tail
        _validate_rtu_crc(frame)
        return frame[1:-2]

    async def request_locked(self, unit, pdu):
        if not pdu:
            raise ValueError("PDU vazio")
        function = pdu[0]
        if function not in bridge.READ_FUNCTIONS:
            raise PermissionError(f"FC{function:02d} bloqueada no reverse TCP RTU somente leitura")
        reader = self.remote_reader
        writer = self.remote_writer
        if reader is None or writer is None or writer.is_closing():
            raise ConnectionError("modem desconectado")

        frame = _rtu_frame(unit, pdu)
        writer.write(frame)
        await writer.drain()
        self.bytes_tx += len(frame)
        self.last_tx_at = int(time.time())
        return await self._read_rtu_response(int(unit), int(function))

    async def ig200_command(self, unit, action, password=None):
        raise PermissionError(
            "controle industrial bloqueado no reverse TCP RTU; caminho disponível somente para FC03/FC04"
        )


def write_status(enabled: list[dict]) -> None:
    by_port: dict[int, list[dict]] = {}
    for generator in enabled:
        port = int(generator.get("listen_port") or 0)
        by_port.setdefault(port, []).append(
            {
                "generatorId": generator["id"],
                "tag": generator.get("tag") or generator["id"],
                "unit": int(generator.get("modbus_unit") or 1),
                "rapidDeviceNum": generator.get("rapid_device_num"),
                "transport": generator.get("transport"),
                "remoteFraming": _remote_framing_for_generator(generator),
            }
        )

    payload = {
        "updatedAt": int(time.time()),
        "pid": os.getpid(),
        "security": {
            "peerAllowlistEnabled": bool(REMOTE_ALLOWED_NETWORKS),
            "peerAllowlistRequired": REQUIRE_ALLOWLIST,
            "connectRateLimitPerMinute": CONNECT_RATE_LIMIT,
            "activePeerProtectionSeconds": REPLACE_ACTIVE_AFTER,
        },
        "ports": [
            {
                **item.snapshot(),
                "generators": sorted(by_port.get(port, []), key=lambda x: (x["unit"], x["tag"])),
            }
            for port, item in sorted(bridge.bridges.items())
        ],
    }
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATUS_FILE.with_name(f".{STATUS_FILE.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.chmod(tmp, 0o640)
    os.replace(tmp, STATUS_FILE)


async def reconcile_reverse_tcp():
    while True:
        enabled = [
            g
            for g in db.list_generators()
            if g.get("enabled")
            and g.get("transport") == "reverse_tcp"
            and 1 <= int(g.get("listen_port") or 0) <= 65535
        ]

        by_port: dict[int, list[dict]] = {}
        for generator in enabled:
            by_port.setdefault(int(generator["listen_port"]), []).append(generator)

        wanted: dict[int, str] = {}
        for port, generators in sorted(by_port.items()):
            try:
                framings = {_remote_framing_for_generator(g) for g in generators}
            except Exception as exc:
                bridge.log(f"porta {port}: framing inválido; listener bloqueado: {exc}")
                continue
            if len(framings) != 1:
                labels = ", ".join(
                    f"{g.get('tag') or g['id']}={_remote_framing_for_generator(g)}"
                    for g in generators
                )
                bridge.log(f"porta {port}: framing misto no mesmo listener ({labels}); porta bloqueada")
                continue
            wanted[port] = next(iter(framings))

        for port, framing in wanted.items():
            current = bridge.bridges.get(port)
            if current is not None and getattr(current, "remote_framing", None) == framing:
                continue
            if current is not None:
                await current.stop()
                bridge.bridges.pop(port, None)
                bridge.log(f"porta {port}: framing alterado; ponte anterior removida")

            if framing == FRAMING_MODBUS_RTU:
                item = HardenedRtuBridgePort(port)
            else:
                item = HardenedBridgePort(port)
            await item.start()
            bridge.bridges[port] = item
            bridge.log(f"porta {port}: framing remoto {framing}")

        for port in list(bridge.bridges):
            if port in wanted:
                continue
            item = bridge.bridges.pop(port)
            await item.stop()
            bridge.log(f"porta {port}: ponte removida")

        try:
            write_status(enabled)
        except Exception as exc:
            bridge.log(f"falha ao publicar status da bridge: {exc}")

        await asyncio.sleep(bridge.RECONCILE_SECONDS)


async def main():
    db.init_db()
    try:
        STATUS_FILE.unlink(missing_ok=True)
    except Exception:
        pass
    bridge.log(
        "iniciando ponte reverse TCP; caminho Rapid somente leitura FC03/FC04; "
        "framing remoto definido por Controller Pack; "
        f"allowlist={'ativa' if REMOTE_ALLOWED_NETWORKS else 'não configurada'}"
    )
    await bridge.start_control_server()
    try:
        await reconcile_reverse_tcp()
    finally:
        await bridge.stop_control_server()
        await asyncio.gather(
            *(item.stop() for item in list(bridge.bridges.values())),
            return_exceptions=True,
        )
        try:
            STATUS_FILE.unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
