"""Runtime da bridge RC.

A bridge existe exclusivamente para equipamentos que iniciam a conexão TCP
(`reverse_tcp`). Modbus TCP direto e RTU-over-TCP são conexões de saída do
Rapid SCADA e nunca devem abrir listener reverso aqui.
"""

import asyncio

from . import bridge, db


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
            item = bridge.BridgePort(port)
            await item.start()
            bridge.bridges[port] = item

        for port in list(bridge.bridges):
            if port in wanted_ports:
                continue
            item = bridge.bridges.pop(port)
            await item.stop()
            bridge.log(f"porta {port}: ponte removida")

        await asyncio.sleep(bridge.RECONCILE_SECONDS)


async def main():
    db.init_db()
    bridge.log("iniciando ponte reverse TCP; caminho Rapid somente leitura FC03/FC04")
    await bridge.start_control_server()
    try:
        await reconcile_reverse_tcp()
    finally:
        await bridge.stop_control_server()
        await asyncio.gather(
            *(item.stop() for item in list(bridge.bridges.values())),
            return_exceptions=True,
        )


if __name__ == "__main__":
    asyncio.run(main())
