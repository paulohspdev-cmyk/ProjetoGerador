# RC Universal Gateway — Gateway Umbrella

> **ANTES DE ALTERAR ESTE PROJETO:** leia [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md). Esse arquivo é o handoff canônico e deve ser atualizado após toda mudança no Gateway.

`gateway-umbrella/` é um **gateway universal de conectividade e ponte industrial/IoT**. Ele é deliberadamente isolado do bridge legado, backend, frontend e Rapid SCADA atuais.

## Definição do produto

A regra central é:

> **BRIDGE FIRST. PROTOCOL OPTIONAL. NO DEVICE MEMORY DATABASE.**

O Gateway existe primeiro para **receber, manter, proteger, identificar e encaminhar conexões** entre equipamentos de campo e sistemas consumidores.

Ele **não é um SCADA**, não é historiador, não é banco de telemetria e não deve possuir um catálogo universal de registradores/memórias de ComAp, DSE, PLCs, IHMs, inversores, medidores ou outros equipamentos.

```text
CONTROLADORA / PLC / IHM / RTU / IED / MODEM / SENSOR
                         |
                         v
               INTERNET / VPN / LAN
                         |
                         v
                 MIKROTIK / ROUTER
                         |
                         v
               RC UNIVERSAL GATEWAY
          sessão + segurança + roteamento
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
   Rapid SCADA          FUXA        outro sistema
        |                                 |
        +--> RC Geradores                 +--> ThingsBoard/Node-RED/etc.
```

### Exemplo principal

Um modem PUSR configurado como TCP Client aponta para o IP público/porta do site. A MikroTik encaminha a porta para o Gateway. O Gateway mantém essa sessão e apresenta uma conexão estável ao destino configurado, por exemplo Rapid SCADA.

```text
DSE/ComAp/PLC
   |
 RS232/RS485/Ethernet
   |
 PUSR/Teltonika/outro modem
   |
 Internet
   |
 MikroTik/NAT/VPN
   |
 RC Universal Gateway
   |
 Rapid SCADA / FUXA / software do fabricante / outro destino
```

Se o payload for Modbus RTU transparente, Modbus TCP ou até protocolo proprietário desconhecido, o Gateway deve poder encaminhá-lo sem precisar conhecer o mapa de memória do equipamento.

## O que pertence ao core

- TCP server / reverse TCP;
- TCP client;
- UDP;
- TLS/mTLS;
- serial RS-232/422/485;
- WebSocket quando usado como transporte;
- MQTT quando usado como transporte/bridge;
- SocketCAN/CAN quando usado como transporte;
- sessão, reconnect e timeout;
- roteamento origem -> destino;
- associação de sessão/equipamento;
- ACL, identidade e quarentena;
- framing mínimo quando necessário para multiplexação/roteamento;
- buffers limitados em memória;
- métricas, logs e health checks;
- plugins/adapters de transporte e destino.

## O que NÃO pertence ao core

- banco de dados de telemetria;
- histórico de processo;
- mapas de registradores de controladoras;
- banco de endereços Modbus por fabricante/modelo;
- polling semântico de RPM, tensão, pressão, temperatura etc.;
- conversão de registradores em pontos SCADA;
- regras específicas de ComAp, DSE, Siemens, Schneider, DEIF etc.;
- lógica de dashboard;
- alarmes/processamento de processo;
- substituição obrigatória do Rapid SCADA.

Essas responsabilidades ficam no **sistema consumidor/driver apropriado**: Rapid SCADA, FUXA, ThingsBoard, software específico, RC Geradores ou outro sistema.

## Protocol awareness: somente quando necessário

O Gateway pode reconhecer framing/protocolo para conseguir transportar corretamente, por exemplo:

- separar frames em um stream TCP;
- validar CRC de RTU;
- identificar Unit ID para multiplexação;
- rotear sessões;
- diagnosticar comunicação.

Isso **não autoriza** o Gateway a conhecer a semântica dos registradores ou a manter um banco de memória dos equipamentos.

## Referência ThingsBoard

O ThingsBoard IoT Gateway é referência útil para modularidade de connectors, supervisão, reconnect e extensibilidade. Porém ele também possui converters, leitura de protocolos e storage para transformar dados no modelo ThingsBoard. O RC Universal Gateway deliberadamente não copia essa parte: nosso núcleo permanece bridge-first e platform-agnostic.

## Estado do código

A branch contém experimentos anteriores de parsing/adapters de protocolo. Eles não devem ser interpretados como definição do produto. A direção vigente é manter no core apenas o necessário para transporte/bridge e mover, desabilitar ou remover qualquer componente que faça aquisição semântica, polling de pontos ou persistência de telemetria.

Command Plane continua bloqueado nesta fase.

## Executar

```bash
cd gateway-umbrella
go test ./...
go vet ./...
go build ./cmd/rc-gateway
```

Admin padrão: `127.0.0.1:18080` com health/status/métricas operacionais.

## Documentação essencial

- [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) — **fonte canônica para retomar o trabalho**;
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitetura bridge-first;
- [`docs/PRODUCTION_MATRIX.md`](./docs/PRODUCTION_MATRIX.md) — cobertura e gates de produção;
- [`docs/PLUGIN_CONTRACT.md`](./docs/PLUGIN_CONTRACT.md) — contrato de adapters/sidecars;
- [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md) — toolchain.
