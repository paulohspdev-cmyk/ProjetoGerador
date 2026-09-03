# RC Universal Gateway — Architecture

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md). Toda mudança no Gateway deve atualizar esse documento.

## Decisão arquitetural vigente

O RC Universal Gateway é uma **ponte universal de conectividade industrial/IoT**.

Ele não é o motor SCADA, não é historiador e não deve manter um banco universal de mapas de memória/registradores dos equipamentos.

Princípio:

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

## Fluxo principal

```text
EQUIPAMENTO / CONTROLADORA / PLC / IHM / RTU / IED
                         |
                RS232 / RS485 / Ethernet
                         |
                         v
               MODEM / ROUTER / VPN
                         |
                         v
                  INTERNET / LAN
                         |
                         v
                 MIKROTIK / NAT
                         |
                         v
               RC UNIVERSAL GATEWAY
           accept / identify / protect
          session / route / reconnect
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
   Rapid SCADA          FUXA        software/SCADA X
        |
        v
   RC Geradores
```

### Exemplo PUSR

```text
Controladora RS485
      |
PUSR TCP Client
      |
IP público:porta
      |
MikroTik DNAT
      |
Gateway listener
      |
rota configurada
      |
Rapid SCADA
```

Rapid SCADA envia uma requisição através da sessão virtual/bridge. O Gateway encaminha os bytes ao modem/controladora e devolve a resposta ao Rapid.

O Gateway não precisa saber que determinado registrador significa RPM, tensão ou pressão.

## Componentes do core

### 1. Transport Plane

Responsável por abrir e manter meios de comunicação:

- TCP server/reverse TCP;
- TCP client;
- UDP;
- TLS/mTLS;
- serial RS-232/422/485;
- WebSocket;
- MQTT quando usado como transporte;
- SocketCAN/CAN quando usado como transporte;
- adapters futuros.

### 2. Session Plane

Responsável por:

- conexão/desconexão;
- timeout;
- reconnect;
- ownership de sessão;
- origem/destino;
- identificação disponível;
- limites por origem;
- estado operacional.

### 3. Routing Plane

É o coração do produto.

Mantém regras de encaminhamento como:

```text
listener tcp-reverse-15020
    -> route gen163-link
    -> target rapid-local:25020
```

ou:

```text
vpn-device 10.60.20.222:502
    -> local virtual endpoint
    -> Rapid/FUXA/outro consumidor
```

Uma rota pode ser byte-transparent ou usar framing mínimo quando necessário.

### 4. Identity/Security Plane

Responsável por confiança e segurança da conexão, não pela semântica da telemetria.

Pode usar:

- certificado/mTLS;
- fingerprint;
- MQTT Client ID;
- IMEI/ICCID quando disponível;
- VPN peer;
- IP/CIDR como evidência auxiliar;
- registration packet/heartbeat do modem;
- serial/device identifier fornecido pelo transporte.

Estados podem continuar como `enrolled`, `quarantined`, `unknown` e `revoked`.

### 5. Framing Plane — mínimo e opcional

Framing existe somente para transportar corretamente quando byte-transparent não é suficiente.

Exemplos:

- reconstrução de MBAP Modbus TCP fragmentado;
- separação de múltiplos frames no mesmo stream;
- CRC16 RTU;
- Unit ID para multiplexação de um barramento;
- protocolo de registro/heartbeat de modem;
- delimitadores de protocolo proprietário.

Framing **não significa interpretar mapa de memória**.

### 6. Destination/Connector Plane

Adapters de saída apresentam a conexão ao sistema consumidor.

Destinos possíveis:

- Rapid SCADA;
- FUXA;
- ThingsBoard;
- Node-RED;
- software do fabricante;
- outro SCADA;
- TCP/UDP endpoint;
- MQTT broker;
- WebSocket endpoint;
- custom connector.

O destino pode interpretar o protocolo. O core do Gateway não precisa.

### 7. Operations Plane

Somente dados operacionais do próprio Gateway:

- health;
- readiness;
- sessões ativas;
- bytes RX/TX;
- reconnects;
- timeouts;
- CRC/framing errors;
- latência;
- filas/buffers;
- logs.

Não é banco de processo nem histórico SCADA.

## Sem banco de telemetria

O produto não deve possuir SQLite/PostgreSQL/Influx/Timescale ou outro banco para armazenar processo industrial.

Buffers necessários para bridging devem ser:

- limitados;
- orientados a sessão/transporte;
- preferencialmente em memória;
- descartados conforme política explícita quando a sessão termina ou o limite é atingido.

Se um consumidor precisa de histórico, isso pertence ao consumidor/historiador, por exemplo Rapid SCADA, ThingsBoard ou um TSDB externo.

## Sem mapas de memória

Não manter dentro do Gateway:

```text
DSE4520 register X = RPM
ComAp IG200 register Y = battery
PLC Siemens DBx.DBy = pressure
```

Esses mapas pertencem aos drivers/sistemas que interpretam o equipamento.

A troca de DSE por ComAp, PLC ou equipamento proprietário **não deve exigir alterar o core do Gateway**.

## Referência ThingsBoard

O ThingsBoard IoT Gateway usa connectors e converters e encaminha dados convertidos para storage/ThingsBoard. Essa modularidade é uma boa referência, mas nosso produto deliberadamente para antes da conversão semântica.

Aproveitar conceitos:

- connectors isolados;
- lifecycle/supervisão;
- reconnect;
- configuração modular;
- custom connectors;
- métricas/logs.

Não copiar para o core:

- converters de pontos;
- polling de registradores para formar telemetria;
- storage de telemetria;
- modelo específico de uma plataforma;
- RPC industrial genérico.

## Command Plane

Continua bloqueado nesta fase.

Uma ponte bidirecional pode tecnicamente transportar bytes enviados pelo sistema consumidor, mas qualquer liberação de comandos industriais precisa de política explícita e homologação separada. Não deve surgir um endpoint de escrita genérico no Gateway apenas porque a conexão é bidirecional.

## Critério de universalidade

O teste mais importante é:

> Se amanhã surgir um equipamento cujo protocolo o Gateway nunca viu, mas existe um software/SCADA capaz de entendê-lo, o Gateway deve conseguir transportar a conexão sem precisar receber um novo mapa de memória.

Se isso for verdade, o Gateway continua universal.
