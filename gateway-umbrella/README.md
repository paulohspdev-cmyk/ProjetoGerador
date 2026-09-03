# RC Universal Gateway — Gateway Umbrella

> **Antes de alterar este projeto:** leia [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md). O handoff é obrigatório e deve ser atualizado em toda mudança.

`gateway-umbrella/` é um **gateway universal de conectividade industrial/IoT**. O objetivo principal é ser uma ponte entre o campo e o software que realmente entende o equipamento.

## Regra central

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O core não contém mapas de memória de ComAp, DSE, PLC, IHM ou qualquer fabricante. Ele não faz polling de registradores para descobrir RPM, tensão ou alarmes e não mantém histórico de telemetria.

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

O destino envia as requisições. O Gateway encaminha os bytes até o equipamento e devolve a resposta sem alterar o payload.

## Runtime bridge-first atual

O schema atual é `3` e usa `tunnels`.

Cada túnel possui dois lados simétricos:

- `field`: lado do equipamento/modem;
- `consumer`: lado do SCADA/software.

Cada lado pode operar em:

- `listen`: aguarda conexão;
- `connect`: inicia conexão.

### PUSR reverso + Rapid SCADA

```text
PUSR ----TCP----> :15003  Gateway  :25003 <----TCP---- Rapid
```

Configuração:

```json
{
  "id": "pusr-15003-to-rapid",
  "field": {"mode": "listen", "bind": "0.0.0.0:15003"},
  "consumer": {"mode": "listen", "bind": "127.0.0.1:25003"}
}
```

### Controladora acessível diretamente por IP/VPN

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

## Importante: uma conexão raw não pode ser fan-out cego

O core não replica uma mesma sessão raw simultaneamente para Rapid, FUXA e outros mestres. Isso corromperia protocolos request/response e poderia misturar transações.

**Um túnel raw tem um consumidor ativo por vez.** Se vários sistemas precisarem dos mesmos dados, o fan-out deve acontecer depois do driver/SCADA ou por um plugin protocol-aware explicitamente projetado para multiplexação.

## O que permanece no core

- túnel TCP duplex byte-transparent;
- TCP `listen` e `connect` nos dois lados;
- allowlist CIDR opcional em endpoints `listen`;
- TCP keepalive e `TCP_NODELAY`;
- reconnect para endpoints `connect`;
- sessões de pares ativos;
- métricas somente operacionais de bytes/sessões/erros;
- `/healthz`, `/readyz`, `/status`, `/sessions`, `/metrics`;
- Command Plane desabilitado.

## O que saiu do core

- spool/histórico de telemetria;
- HTTP sink de Records normalizados;
- inventário/banco de identidade de dispositivos;
- obrigação de interpretar Modbus/OPC UA/SNMP/CoAP;
- obrigação de conhecer registradores/controladoras.

Os adapters antigos permanecem temporariamente como **experimentos de bibliotecas**, não são iniciados pelo runtime bridge-first e não definem a arquitetura final.

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
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitetura bridge-first;
- [`docs/THINGSBOARD_REFERENCE.md`](./docs/THINGSBOARD_REFERENCE.md) — comparação com ThingsBoard Gateway;
- [`docs/PRODUCTION_MATRIX.md`](./docs/PRODUCTION_MATRIX.md) — validação e roadmap;
- [`docs/PLUGIN_CONTRACT.md`](./docs/PLUGIN_CONTRACT.md) — direção de plugins de transporte.
