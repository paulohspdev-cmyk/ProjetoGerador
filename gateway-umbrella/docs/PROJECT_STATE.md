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

O RC Universal Gateway é uma ponte industrial/IoT universal. O core abre/aceita os dois lados, pareia, protege, roteia e transporta bytes sem interpretar registradores, controladoras ou telemetria. Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver interpreta o equipamento.

# 2. Runtime atual

Schema **3**, baseado em túneis duplex:

```text
FIELD ENDPOINT <====== raw duplex bytes ======> CONSUMER ENDPOINT
```

O core atual suporta TCP `listen`/`connect`. Um túnel raw possui um consumidor ativo por vez; não fazer fan-out byte-transparent para múltiplos masters.

# 3. Checkpoint bridge-first limpo

SHA de código limpo validado anteriormente: `249a7f0d55c840e5e95764468a6400db8a401fea`.

Nesse checkpoint: Gateway Umbrella, `gofmt`, `go vet`, unit/socket tests, race detector, build, CI geral e Quality/Security passaram.

# 4. Endurecimento TCP implementado nesta etapa

Adicionado ao core:

- `pairTimeoutSeconds` (default 30 s): um peer não fica preso indefinidamente esperando o outro lado;
- `writeTimeoutSeconds` (default 30 s): slow peer não pode bloquear a ponte para sempre;
- `drainTimeoutSeconds` (default 2 s): half-close permite dreno curto e depois libera o par;
- `OnBytes` passou a ser emitido durante cada chunk encaminhado, e não somente quando `io.Copy` termina;
- escrita usa loop completo para não perder bytes em `Write` parcial;
- listener passa a respeitar deadline de formação do par sem destruir o listener para o próximo ciclo;
- métrica `rc_gateway_pair_wait_timeouts_total` e métrica por túnel;
- `/sessions` passa a separar `bytesFieldToConsumer` e `bytesConsumerToField` em tempo real;
- exemplo de configuração agora usa `requireAllowlist=true` e timeouts explícitos.

Testes adicionados:

- atualização de métricas antes do fechamento da sessão;
- peer lento com timeout de escrita;
- timeout de pairing sem inutilizar o listener;
- 50 ciclos seguidos de reconnect/churn preservando bytes;
- permanecem testes de sockets TCP reais `listen↔listen` e `connect↔listen` e byte-for-byte nos dois sentidos.

A reprodução local isolada do core passou `go test -race ./...`. **O CI do repositório para o HEAD desta alteração ainda deve ser consultado antes de declarar este novo checkpoint verde.**

# 5. O que continua deliberadamente fora do core

- banco de registradores/mapas ComAp/DSE/PLC/IHM;
- polling e normalização de telemetria;
- historian/spool de telemetria;
- Command Plane;
- readers semânticos OPC UA/SNMP/CoAP/MQTT.

Novos meios devem voltar apenas como endpoints/bridges duplex quando tecnicamente possível.

# 6. Próximos passos obrigatórios para software field-test-ready

1. confirmar CI do endurecimento TCP;
2. adicionar teste de TCP RST e teste explícito de half-close em sockets reais;
3. adicionar teste de leak de goroutines/sockets e carga/concurrency;
4. implementar TLS/mTLS como endpoint duplex raw;
5. implementar Unix socket como endpoint duplex local;
6. implementar Serial RS232/422/485 como endpoint duplex;
7. implementar UDP como bridge datagram/session-aware;
8. implementar WebSocket/WSS como transporte de stream/mensagem com contrato explícito;
9. classificar CAN/SocketCAN e MQTT como transports message-oriented, sem fingir semântica de TCP;
10. criar suíte de impairment/soak e pacote de instalação/rollback para homologação em campo.

# 7. Regra de produção

O software só fica pronto para homologação em campo quando todos os gates automatizáveis estão verdes. Produção real só pode ser declarada após HIL/soak físico. A invariável central permanece:

```text
bytes enviados A == bytes recebidos B
bytes enviados B == bytes recebidos A
```

sem mutação de payload, mistura de consumidores, leak contínuo de recursos ou armazenamento semântico no core.
