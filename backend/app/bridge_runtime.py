"""Runtime da bridge RC.

A bridge existe exclusivamente para equipamentos que iniciam a conexão TCP
(`reverse_tcp`). Modbus TCP direto e RTU-over-TCP são conexões de saída do
Rapid SCADA e nunca devem abrir listener reverso aqui.

O controle privilegiado continua globalmente desabilitado por padrão. Quando
ativado, qualquer InteliGen 200 só é elegível se existir binding Rapid e
cadastro habilitado com o mesmo Rapid Device, porta e Unit ID.
"""

import asyncio

from . import bridge, db


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


# O serviço de produção executa app.bridge_runtime. Substituímos aqui somente
# a resolução de identidade; transporte, intertravamento por RPM, confirmação,
# sequência Modbus e auditoria continuam implementados em app.bridge.
bridge.resolve_ig200 = resolve_ig200_bound_device


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
