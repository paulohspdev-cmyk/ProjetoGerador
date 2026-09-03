# RC Universal Gateway — Architecture

> Handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md).

## 1. Missão

O RC Universal Gateway é uma **ponte universal de conectividade**. Ele conecta dois endpoints e transporta bytes nos dois sentidos sem precisar entender a semântica do equipamento.

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

Geradores são apenas um caso de uso.

## 2. Unidade fundamental: Tunnel

O core é construído em torno de um `Tunnel`:

```text
FIELD ENDPOINT  <======== raw duplex bytes ========>  CONSUMER ENDPOINT
```

Os dois lados são simétricos e podem ser:

```text
listen  -> aguarda peer
connect -> inicia conexão
```

No primeiro milestone de bridge real, o network suportado pelo core é TCP.

### Exemplo A — modem TCP Client + Rapid SCADA

```text
Controladora -> PUSR -> Internet -> MikroTik -> Gateway
                                            field listen :15003
                                                     ||
                                                raw tunnel
                                                     ||
                                       consumer listen :25003
                                                     <- Rapid SCADA
```

### Exemplo B — equipamento direto por VPN/IP

```text
Gateway field connect -> 10.60.20.222:502
         ||
     raw tunnel
         ||
consumer listen :25020 <- Rapid SCADA
```

## 3. Responsabilidades do core

O caminho principal deve conter somente:

1. **Transport** — abrir/aceitar a conexão;
2. **Session/Pair** — parear os dois endpoints;
3. **Security** — allowlist, TLS quando implementado no Tunnel, firewall externo e políticas;
4. **Routing** — determinar qual `field` pertence a qual `consumer`;
5. **Raw forwarding** — transportar bytes sem modificação;
6. **Reconnect/lifecycle** — restabelecer endpoints `connect` e fechar pares quebrados;
7. **Operations** — health, readiness, sessões, logs e métricas de comunicação.

## 4. O que não pertence ao core

Não pertencem ao runtime principal:

- banco de registradores;
- mapa Modbus por fabricante/modelo;
- polling de pontos;
- converter RPM/pressão/tensão/alarme;
- histórico de telemetria;
- historian;
- banco de dispositivos necessário para transportar bytes;
- engine de alarmes;
- dashboard;
- fan-out semântico de telemetria.

ComAp, DSE, Siemens, Schneider, DEIF, Woodward e outros devem ser interpretados pelo Rapid SCADA, FUXA, software do fabricante ou driver apropriado.

## 5. Framing/protocolo é opcional

O Gateway pode conhecer framing quando for **necessário para transportar corretamente**, por exemplo:

- preservar limites de frame em uma conversão serial;
- validar CRC RTU em um adapter específico;
- selecionar Unit ID em uma multiplexação explicitamente projetada;
- encapsular/desencapsular um transporte.

Isso não autoriza o core a conhecer o significado dos registradores.

Um protocolo completamente desconhecido deve poder atravessar um túnel raw.

## 6. Não fazer fan-out raw

Uma sessão request/response não pode ser copiada cegamente para vários mestres:

```text
              X--> Rapid
FIELD --> GW -X--> FUXA        ERRADO como cópia raw simultânea
              X--> outro master
```

Transações Modbus, protocolos proprietários e barramentos seriais podem colidir/intercalar requisições.

Regra do core:

> **um Tunnel raw possui um consumidor ativo por vez.**

Se vários sistemas precisarem dos mesmos valores, o compartilhamento ocorre depois do driver/SCADA ou em plugin protocol-aware separado, com arbitragem explícita.

## 7. Observabilidade não é telemetria industrial

O Gateway pode e deve medir o próprio funcionamento:

- pares ativos;
- conexões abertas/fechadas;
- bytes `field -> consumer`;
- bytes `consumer -> field`;
- erros de bridge;
- reconnects;
- uptime/readiness.

Isso não é histórico do processo industrial e não requer banco de telemetria.

## 8. Código principal atual

```text
cmd/rc-gateway
      |
      v
internal/config   schema 3 / tunnels
      |
      v
internal/gateway  lifecycle + admin + métricas
      |
      v
internal/bridge   pairing + io.Copy duplex
      |
      +--> field endpoint
      |
      +--> consumer endpoint
```

Os adapters criados antes da decisão bridge-first são experimentos de conectividade/bibliotecas. Eles não são iniciados pelo runtime atual e devem ser convertidos futuramente em providers de endpoint raw ou removidos se forem apenas leitores semânticos.

## 9. Próximas extensões corretas

A expansão deve ocorrer por **novos tipos de endpoint**, não por mapas de memória:

- TLS/mTLS endpoint;
- UDP session bridge;
- Serial RS232/422/485 endpoint;
- RTU-over-TCP transparent endpoint;
- WebSocket raw endpoint;
- MQTT tunnel/connector apenas quando houver contrato de bytes/mensagens adequado;
- SocketCAN endpoint;
- Unix socket/local IPC;
- dynamic session routing para muitos modems compartilhando listeners, quando houver identidade/registro seguro.

Cada transporte deve continuar entregando um stream/datagram ao roteador sem converter valores de processo.
