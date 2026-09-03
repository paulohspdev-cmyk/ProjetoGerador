# RC Universal Gateway — Gateway Umbrella

> **Antes de alterar este projeto:** leia [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md). O handoff é obrigatório e deve ser atualizado em toda mudança.

`gateway-umbrella/` é um **gateway universal de conectividade industrial/IoT**. Seu core é uma ponte byte-transparent entre o campo e o software que realmente entende o equipamento.

## Regra central

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O core não contém mapas de memória de ComAp, DSE, PLC, IHM ou qualquer fabricante. Não faz polling de registradores, não converte RPM/tensão/alarmes e não mantém histórico de telemetria.

## Fluxo principal

```text
Controladora
   |
RS232 / RS485 / Ethernet
   |
PUSR / Teltonika / Robustel / outro modem
   |
Internet / VPN
   |
MikroTik / NAT
   |
RC UNIVERSAL GATEWAY
   |
raw byte tunnel
   |
Rapid SCADA / FUXA / software do fabricante / outro destino
```

O destino envia as requisições. O Gateway encaminha bytes até o equipamento e devolve a resposta sem interpretar ou alterar o payload.

## Runtime atual

Schema `3`, baseado em `tunnels`. Cada túnel tem `field` e `consumer`; cada lado pode ser `listen` ou `connect`.

### PUSR reverso + Rapid

```text
PUSR ----TCP----> :15003  Gateway  :25003 <----TCP---- Rapid
```

```json
{
  "id": "pusr-15003-to-rapid",
  "field": {"mode": "listen", "bind": "0.0.0.0:15003"},
  "consumer": {"mode": "listen", "bind": "127.0.0.1:25003"}
}
```

### Equipamento direto por IP/VPN

```text
10.60.20.222:502 <---- Gateway :25020 <---- Rapid
```

```json
{
  "id": "direct-device-to-rapid",
  "field": {"mode": "connect", "address": "10.60.20.222:502"},
  "consumer": {"mode": "listen", "bind": "127.0.0.1:25020"}
}
```

Quando um lado é `listen` e o outro `connect`, a conexão inbound é o trigger; o Gateway só disca o endpoint outbound quando existe peer para usar o túnel.

## Sem fan-out raw cego

Um túnel request/response tem **um consumidor ativo por vez**. Replicar bytes simultaneamente para vários mestres pode misturar transações. Fan-out de dados pertence ao SCADA/driver/broker ou a um componente protocol-aware com arbitragem explícita.

## Core mantido propositalmente pequeno

- `internal/bridge` — pairing e forwarding duplex;
- `internal/config` — schema declarativo dos túneis;
- `internal/core/session.go` — pares/sessões operacionais;
- `internal/gateway` — lifecycle;
- `internal/admin` — health/readiness/status/sessions/metrics;
- `internal/metrics` — métricas operacionais;
- `internal/transport/netutil` — helpers de rede/allowlist.

O código experimental da antiga arquitetura de telemetria foi removido. Novos meios (TLS, serial, UDP, CAN, WebSocket etc.) só entram quando implementados como **endpoint duplex de ponte**, com testes byte-for-byte.

## Executar

```bash
cd gateway-umbrella
go test ./...
go vet ./...
go build ./cmd/rc-gateway
go run ./cmd/rc-gateway -config ./configs/gateway.example.json
```

Admin padrão: `127.0.0.1:18080`.

## Documentos

- [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) — handoff canônico;
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitetura;
- [`docs/THINGSBOARD_REFERENCE.md`](./docs/THINGSBOARD_REFERENCE.md) — referência comparativa;
- [`docs/PRODUCTION_MATRIX.md`](./docs/PRODUCTION_MATRIX.md) — gates de produção;
- [`docs/PLUGIN_CONTRACT.md`](./docs/PLUGIN_CONTRACT.md) — direção de endpoint providers.
