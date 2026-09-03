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

Removidos nesta limpeza:

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
- helper TLS antigo.

A remoção é intencional: esses componentes foram criados para uma arquitetura de aquisição/conversão que não é mais o produto. Serial/TLS/UDP/CAN/WS etc. voltarão apenas como endpoint providers **duplex**.

# 4. Validação já confirmada antes desta limpeza

No HEAD `1c5fafdc872a9576e07c91366c5ca50281b51b68`, o workflow Gateway Umbrella estava totalmente verde:

- handoff `success`;
- `gofmt` `success`;
- `go vet` `success`;
- unit tests `success`;
- testes TCP reais `listen↔listen` e `connect↔listen` `success`;
- race detector `success`;
- build `success`;
- antigo módulo adapters também estava verde antes de ser removido.

# 5. Estado deste commit de limpeza

Este commit remove dead code e dependências antigas e simplifica o workflow para um único job **Bridge Core Go** depois do handoff.

**O CI deste novo HEAD deve ser consultado antes de afirmar que a limpeza está verde.**

# 6. Referência ThingsBoard

Foi estudado `thingsboard/thingsboard-gateway`. Aproveitar modularidade, reconnect, supervisão, configuração e métricas. Não copiar converters, storage, mapas de memória ou polling semântico. Ver `THINGSBOARD_REFERENCE.md`.

# 7. Próximos passos

1. confirmar CI verde após a limpeza;
2. adicionar testes de reset/reconnect/half-close/slow peer;
3. implementar TLS/mTLS como endpoint duplex raw;
4. implementar Serial RS232/422/485 como endpoint duplex raw;
5. implementar UDP com política de sessão;
6. adicionar outros meios somente como endpoints bridge;
7. validar PUSR real ↔ Gateway ↔ Rapid em laboratório sem tocar o bridge legado;
8. HIL + impairment celular + soak antes de produção.

# 8. Regra de produção

O Gateway só é confiável quando prova, inclusive sob falhas e execução prolongada:

```text
bytes enviados A == bytes recebidos B
bytes enviados B == bytes recebidos A
```

sem mutar payload, sem misturar consumidores e sem vazar conexões, goroutines ou memória.
