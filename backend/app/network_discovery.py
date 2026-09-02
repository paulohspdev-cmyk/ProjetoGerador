"""Descoberta passiva de endpoints TCP em redes privadas roteadas.

O scanner apenas conclui o handshake TCP. Ele não envia quadros Modbus e nunca
executa escrita na controladora. Isso permite localizar uma controladora atrás
de modem/VPN sem testar registradores desconhecidos.
"""

from __future__ import annotations

import asyncio
import ipaddress
import time


MAX_HOSTS = 254
MAX_CONCURRENCY = 32


def private_hosts(cidr: str) -> list[str]:
    try:
        network = ipaddress.ip_network(str(cidr).strip(), strict=False)
    except ValueError as exc:
        raise ValueError("Rede inválida. Use CIDR, por exemplo 10.40.10.0/24") from exc
    if network.version != 4:
        raise ValueError("A descoberta suporta somente redes IPv4")
    if not network.is_private or network.is_loopback or network.is_link_local:
        raise ValueError("A descoberta é permitida somente em rede IPv4 privada roteada")
    hosts = [str(host) for host in network.hosts()]
    if not hosts or len(hosts) > MAX_HOSTS:
        raise ValueError("A rede deve conter entre 1 e 254 hosts (máximo /24)")
    return hosts


async def scan_tcp(cidr: str, port: int, timeout_ms: int = 350) -> dict:
    hosts = private_hosts(cidr)
    port = int(port)
    timeout_ms = int(timeout_ms)
    if not 1 <= port <= 65535:
        raise ValueError("Porta TCP inválida")
    if not 100 <= timeout_ms <= 2000:
        raise ValueError("Timeout deve ficar entre 100 e 2000 ms")

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def probe(host: str):
        async with semaphore:
            writer = None
            started = time.monotonic()
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port),
                    timeout=timeout_ms / 1000,
                )
                return {
                    "host": host,
                    "port": port,
                    "latencyMs": max(1, round((time.monotonic() - started) * 1000)),
                    "state": "tcp_open",
                }
            except (TimeoutError, OSError, asyncio.TimeoutError):
                return None
            finally:
                if writer is not None:
                    writer.close()
                    try:
                        await writer.wait_closed()
                    except OSError:
                        pass

    found = [item for item in await asyncio.gather(*(probe(host) for host in hosts)) if item]
    return {
        "cidr": str(ipaddress.ip_network(cidr, strict=False)),
        "port": port,
        "scannedHosts": len(hosts),
        "found": sorted(found, key=lambda item: ipaddress.ip_address(item["host"])),
        "method": "tcp_connect_only",
        "readOnly": True,
    }
