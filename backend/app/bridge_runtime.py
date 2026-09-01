"""Runtime da bridge RC.

A bridge existe exclusivamente para equipamentos que iniciam a conexão TCP
(`reverse_tcp`). Modbus TCP direto e RTU-over-TCP são conexões de saída do
Rapid SCADA e nunca devem abrir listener reverso aqui.

O controle privilegiado continua globalmente desabilitado por padrão. Quando
ativado, qualquer InteliGen 200 só é elegível se existir binding Rapid e
cadastro habilitado com o mesmo Rapid Device, porta e Unit ID.
"""

import asyncio
import ipaddress
import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path

from . import bridge, db

STATUS_FILE = Path(os.environ.get("RC_BRIDGE_STATUS_FILE", "/run/rc-geradores/bridge-status.json"))
CONNECT_RATE_LIMIT = max(1, int(os.environ.get("RC_RAPID_CONNECT_RATE_LIMIT", "30")))
REPLACE_ACTIVE_AFTER = max(5, int(os.environ.get("RC_RAPID_REPLACE_ACTIVE_AFTER", "30")))
REQUIRE_ALLOWLIST = os.environ.get("RC_RAPID_REQUIRE_ALLOWLIST", "0").strip() == "1"


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


def resolve_ig200_bound_device(device_num):
    """Resolve um IG200 pelo Rapid Device sem hardcode do Device 200."""
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
        ),
        None,
    )
    if not binding:
        raise ValueError(f"binding InteliGen 200 não encontrado para Rapid Device {device_num}")

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
        ),
        None,
    )
    if not generator:
        raise ValueError("gerador InteliGen 200 correspondente não encontrado no cadastro")
    if not generator.get("enabled"):
        raise ValueError("gerador está desabilitado no cadastro")
    return generator, port, unit


bridge.resolve_ig200 = resolve_ig200_bound_device


class HardenedBridgePort(bridge.BridgePort):
    """Adiciona proteção de peer sem alterar o protocolo Modbus da bridge base."""

    def __init__(self, remote_port):
        super().__init__(remote_port)
        self._attempts = defaultdict(deque)
        self.rejected_connections = 0

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
        await super().accept_remote(reader, writer)

    def snapshot(self):
        return {
            **super().snapshot(),
            "rejectedConnections": self.rejected_connections,
            "peerAllowlistEnabled": bool(REMOTE_ALLOWED_NETWORKS),
            "peerAllowlistRequired": REQUIRE_ALLOWLIST,
            "connectRateLimitPerMinute": CONNECT_RATE_LIMIT,
            "activePeerProtectionSeconds": REPLACE_ACTIVE_AFTER,
        }


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
        wanted_ports = sorted({int(g["listen_port"]) for g in enabled})

        for port in wanted_ports:
            if port in bridge.bridges:
                continue
            item = HardenedBridgePort(port)
            await item.start()
            bridge.bridges[port] = item

        for port in list(bridge.bridges):
            if port in wanted_ports:
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
