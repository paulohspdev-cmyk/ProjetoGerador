# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.**
>
> Este é o documento canônico de continuidade. Qualquer novo chat, agente, desenvolvedor ou operador deve começar por ele.

## Regra obrigatória

Toda modificação no Gateway **DEVE atualizar este arquivo** no mesmo ciclo de trabalho. O workflow `.github/workflows/gateway-umbrella.yml` executa `gateway-umbrella/scripts/check-project-state-updated.sh` para impedir handoff desatualizado.

---

# 1. Decisão arquitetural vigente

O produto é um **Gateway industrial/IoT universal de conectividade e ponte**.

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O Gateway deve funcionar mesmo sem entender semanticamente o protocolo do equipamento.

A função principal é abrir/aceitar os dois lados, parear as conexões, transportar bytes sem modificação, reconectar de forma limpa e expor apenas observabilidade operacional.

Não pertence ao core: banco de registradores, mapas ComAp/DSE/PLC/IHM, polling de pontos, normalização de processo, historian, spool de telemetria, alarmes ou dashboards.

Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver é quem interpreta o equipamento.

---

# 2. Arquitetura runtime atual

Schema ativo: **3**, baseado em `tunnels`.

```text
FIELD ENDPOINT <====== raw duplex bytes ======> CONSUMER ENDPOINT
```

Cada endpoint pode ser:

- `listen` — aguarda peer;
- `connect` — inicia conexão.

No milestone atual o core Tunnel suporta `network=tcp`.

## PUSR reverso + Rapid

```text
Controladora -> PUSR -> Internet -> MikroTik -> Gateway :15003
                                              ||
                                          raw tunnel
                                              ||
Rapid SCADA ------------------------------> Gateway :25003
```

```json
{
  "id": "pusr-15003-to-rapid",
  "field": {"mode": "listen", "bind": "0.0.0.0:15003"},
  "consumer": {"mode": "listen", "bind": "127.0.0.1:25003"}
}
```

## Equipamento direto por VPN/IP

```text
Gateway field connect -> 10.60.20.222:502
         ||
     raw tunnel
         ||
Gateway :25020 <- Rapid SCADA
```

Quando um lado é `listen` e o outro `connect`, o endpoint `listen` agora atua como **trigger**: o Gateway só abre a conexão outbound depois que o peer inbound existir. Isso evita manter conexão ociosa com controladora ou consumidor antes de haver quem a utilize.

---

# 3. Regra de multiplexação

Um Tunnel raw possui **um consumidor ativo por vez**.

Não copiar uma conexão request/response simultaneamente para Rapid + FUXA + outro master. Isso pode misturar transações e corromper protocolos.

Fan-out de dados deve ocorrer depois do SCADA/driver, por broker, ou por plugin protocol-aware com arbitragem explícita.

---

# 4. Refactor bridge-first realizado em 2026-09-03

Implementado:

- `internal/bridge/tunnel.go` com cópia duplex byte-transparent;
- schema 3 com `field`/`consumer` simétricos `listen/connect`;
- `Gateway.Run` sobe Túneis raw e não produz telemetria;
- `TCP_NODELAY`, keepalive, reconnect e allowlist CIDR;
- sessões/admin/métricas representam pares de bridge;
- removidos spool, HTTP sink de Records e inventário de dispositivos do core;
- removido `configs/identity.example.json`;
- removida necessidade de storage gravável no systemd;
- documentação realinhada para bridge-first.

Correções/fortalecimento:

- `0650d31ba9ec882c58c3870e1bf6ff661d6a6e1f`: `io.ErrClosedPipe` tratado como fechamento normal do par;
- `7e93a54b5bfba3f8f53c18c915dc0e7523d411c6`: pairing `listen ↔ connect` passou a aguardar primeiro o peer inbound;
- `a8156af6025d5c796bd8ac23beec79f1cbb2d87e`: adicionados testes com sockets TCP reais para `listen ↔ listen` e `connect ↔ listen`, além do teste binário duplex via `net.Pipe`.

`commandPlaneEnabled=true` continua rejeitado.

---

# 5. Código experimental ainda presente

Adapters da fase anterior permanecem temporariamente no repositório como experimentos de biblioteca/conectividade, mas **não são iniciados pelo runtime schema 3**:

- MQTT/MQTT5;
- serial;
- SocketCAN/J1939;
- OPC UA read;
- SNMP read;
- CoAP GET;
- WebSocket/WSS;
- event bus/protocol helpers antigos.

Cada um deve ser futuramente refatorado para endpoint raw/provider, movido para experimental externo ou removido se for apenas leitor/converter semântico.

---

# 6. Referência ThingsBoard Gateway

Foi estudado `thingsboard/thingsboard-gateway`.

Aproveitar: modularidade de connectors, reconnect, supervisão, configuração declarativa, extensibilidade e métricas.

Não copiar para o core: converters de telemetria, storage, mapas de registradores e polling semântico.

Detalhes: [`THINGSBOARD_REFERENCE.md`](./THINGSBOARD_REFERENCE.md).

---

# 7. Estado de validação

## Checkpoint verde anterior

No HEAD `c23aa90f759499f92b51cba491d9d9f9544d5ef0`, o workflow próprio **Gateway Umbrella** passou completamente:

- Canonical project state: `success`;
- `gofmt`: `success`;
- `go vet`: `success`;
- unit tests: `success`;
- race detector: `success`;
- build do core: `success`;
- adapters experimentais: format/vet/tests/build `success`.

Esse foi o primeiro checkpoint totalmente verde do novo runtime bridge-first.

## Alterações posteriores ainda em validação

Depois desse checkpoint foram adicionados:

- pairing acionado pelo endpoint `listen` quando o outro lado é `connect`;
- teste TCP real `listen ↔ listen`;
- teste TCP real `connect ↔ listen` verificando inclusive que o dispositivo outbound não é discado antes da conexão do consumidor.

**O CI do HEAD após este handoff deve ser consultado antes de afirmar que esses novos testes estão verdes.**

---

# 8. Próximos passos recomendados

1. confirmar novo ciclo `gofmt`/`vet`/tests/race/build;
2. corrigir qualquer falha dos testes TCP reais;
3. adicionar testes de reconnect/reset/half-close e slow peer;
4. validar PUSR real ↔ Gateway ↔ Rapid em porta de laboratório sem tocar o bridge legado;
5. implementar TLS/mTLS como endpoint raw;
6. implementar Serial RS232/422/485 como endpoint raw;
7. implementar UDP bridge com política explícita de sessão;
8. refatorar/remover adapters experimentais antigos;
9. HIL, impairment de rede e soak antes de produção.

---

# 9. Regra para produção

O Gateway só será considerado production quando provar continuamente:

```text
bytes enviados pelo lado A == bytes recebidos no lado B
bytes enviados pelo lado B == bytes recebidos no lado A
```

sob reconnect, fragmentação TCP, latência, perda de link, resets, slow peer e execução prolongada, sem alterar payload e sem vazar sessões/goroutines/memória.
