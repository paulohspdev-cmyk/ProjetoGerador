# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.**
>
> Este é o documento canônico de continuidade. Toda mudança no Gateway deve atualizar este arquivo no mesmo ciclo. O workflow `gateway-umbrella.yml` aplica essa regra.

# 1. Decisão vigente

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O RC Universal Gateway é uma ponte industrial/IoT universal. Ele funciona mesmo sem conhecer o protocolo ou modelo do equipamento.

O core deve apenas abrir/aceitar os dois lados, parear, proteger, rotear e transportar bytes sem modificação, com reconnect e observabilidade operacional.

Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver interpreta os equipamentos. Não colocar mapas ComAp/DSE/PLC/IHM, polling, historian, alarmes ou telemetria semântica no core.

# 2. Runtime atual

Schema **3** baseado em `tunnels`:

```text
FIELD ENDPOINT <====== raw duplex bytes ======> CONSUMER ENDPOINT
```

Cada lado pode ser `listen` ou `connect`. Core atual: TCP.

PUSR reverso:

```text
PUSR -> Gateway :15003  <== tunnel ==>  Gateway :25003 <- Rapid
```

Equipamento direto:

```text
Gateway -> 10.60.20.222:502  <== tunnel ==>  Gateway :25020 <- Rapid
```

Em `listen ↔ connect`, o inbound listener é o trigger; só então o lado outbound é discado.

Um Tunnel raw possui **um consumidor ativo por vez**. Não fazer fan-out byte-transparent para múltiplos masters.

# 3. Estrutura do core após limpeza

Mantidos no produto:

- `cmd/rc-gateway`;
- `internal/admin`;
- `internal/bridge`;
- `internal/config`;
- `internal/core/session.go`;
- `internal/gateway`;
- `internal/metrics`;
- `internal/transport/netutil`;
- config, docs, scripts e systemd.

Removidos na limpeza bridge-first:

- módulo `gateway-umbrella/adapters/` inteiro;
- MQTT/MQTT5 reader;
- OPC UA reader;
- SNMP reader;
- CoAP reader;
- serial receive-only antigo;
- SocketCAN receive-only antigo;
- WebSocket receive-only antigo;
- event bus/Record da fase de telemetria;
- detectores/parsers Modbus/NMEA antigos não usados pelo bridge;
- protocol registry;
- supervisor de sidecars;
- HTTP ingest antigo;
- TCP client/server antigos substituídos pelo Tunnel;
- TLS client/server antigos;
- UDP server antigo;
- helper TLS antigo;
- spool/historian de telemetria;
- sink HTTP de Records;
- inventário obrigatório de dispositivos.

A remoção é intencional. Serial/TLS/UDP/CAN/WS etc. só devem voltar como endpoint providers **duplex**, preservando payload e sem leitura semântica de dispositivos.

# 4. Checkpoint bridge-first confirmado

## SHA de código limpo validado

`249a7f0d55c840e5e95764468a6400db8a401fea`

Commit: `refactor(gateway): reduz core a ponte duplex universal`

Validação confirmada em 2026-09-03:

### Workflow Gateway Umbrella

- Canonical project state: `success`;
- Bridge Core Go: `success`;
- `gofmt`: `success`;
- `go vet`: `success`;
- unit + socket integration tests: `success`;
- race detector: `success`;
- build: `success`.

### Repositório

- CI geral: `success`;
- Quality and Security: `success`.

Portanto este é o checkpoint canônico de código bridge-first limpo e verde.

Os testes atuais já cobrem:

- preservação binária byte-for-byte nos dois sentidos;
- `listen ↔ listen` com sockets TCP reais;
- `connect ↔ listen` com sockets TCP reais;
- outbound só é discado após existir o peer inbound quando o outro lado é `listen`;
- encerramento normal por EOF/closed pipe/net closed/context cancel;
- race detector no core.

# 5. Referência ThingsBoard

Foi estudado `thingsboard/thingsboard-gateway`.

Aproveitar:

- modularidade de connectors;
- reconnect;
- supervisão;
- configuração declarativa;
- extensibilidade;
- métricas.

Não copiar para o core:

- converters de telemetria;
- storage/historian;
- mapas de registradores;
- polling semântico de dispositivos.

Ver `THINGSBOARD_REFERENCE.md`.

# 6. Pontos técnicos ainda abertos

Antes de produção ainda faltam, entre outros:

- testes de reset/reconnect repetido;
- comportamento de half-close TCP;
- slow peer e backpressure;
- limite explícito para espera durante estabelecimento do par;
- métricas de bytes atualizadas durante sessões longas, não somente ao encerrar `io.Copy`;
- testes de leak de goroutines/sockets;
- escala/concurrency;
- impairment de rede celular;
- HIL e soak;
- TLS/mTLS como endpoint duplex;
- Serial RS232/422/485 como endpoint duplex;
- UDP com semântica de sessão definida;
- outros meios apenas quando implementados como ponte real.

# 7. Próximos passos recomendados

Ordem recomendada:

1. fortalecer o Tunnel TCP: reconnect/reset/half-close/slow peer/pair establishment timeout/métricas em tempo real;
2. testar ausência de leaks e concorrência;
3. implementar TLS/mTLS como endpoint duplex raw;
4. implementar Serial RS232/422/485 como endpoint duplex raw;
5. implementar UDP bridge com política explícita de sessão;
6. adicionar WebSocket/CAN/MQTT somente quando houver contrato de endpoint duplex claro;
7. validar PUSR real ↔ Gateway ↔ Rapid em porta de laboratório sem tocar o bridge legado;
8. HIL + impairment celular + soak antes de qualquer produção.

# 8. Regra de produção

O Gateway só é confiável quando prova, inclusive sob falhas e execução prolongada:

```text
bytes enviados A == bytes recebidos B
bytes enviados B == bytes recebidos A
```

sem mutar payload, sem misturar consumidores e sem vazar conexões, goroutines ou memória.

# 9. Regra para qualquer próximo chat/agente

Não reintroduzir a arquitetura antiga de telemetria no core para “aproveitar” bibliotecas. Se uma nova conexão precisar ser suportada, modelar primeiro como **Endpoint duplex**. Se não for possível transportar de forma transparente, documentar por que um adapter protocol-aware é indispensável e mantê-lo fora do núcleo genérico sempre que possível.
