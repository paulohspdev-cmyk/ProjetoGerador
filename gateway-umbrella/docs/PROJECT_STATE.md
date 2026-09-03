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

A função principal é:

1. abrir/aceitar a conexão de campo;
2. abrir/aceitar a conexão do software consumidor;
3. parear os dois lados;
4. transportar bytes nos dois sentidos sem modificação;
5. fechar/reconectar pares de forma limpa;
6. expor somente observabilidade operacional.

Não pertence ao core:

- banco de registradores;
- mapas de memória ComAp/DSE/PLC/IHM;
- polling para descobrir RPM/tensão/pressão/alarmes;
- normalização de telemetria de processo;
- historian/spool de telemetria;
- engine de alarmes/dashboards.

O Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver é quem interpreta o equipamento.

---

# 2. Arquitetura runtime atual

O schema ativo passou para **3** e usa `tunnels`.

Cada Tunnel possui:

```text
FIELD ENDPOINT <====== raw duplex bytes ======> CONSUMER ENDPOINT
```

Cada endpoint pode ser:

- `listen` — aguarda peer;
- `connect` — inicia conexão.

No milestone atual o core Tunnel suporta `network=tcp`.

## Exemplo PUSR reverso + Rapid

```text
Controladora -> PUSR -> Internet -> MikroTik -> Gateway :15003
                                              ||
                                          raw tunnel
                                              ||
Rapid SCADA ------------------------------> Gateway :25003
```

Config:

```json
{
  "id": "pusr-15003-to-rapid",
  "field": {"mode": "listen", "bind": "0.0.0.0:15003"},
  "consumer": {"mode": "listen", "bind": "127.0.0.1:25003"}
}
```

O Rapid envia a requisição; o Gateway encaminha; a resposta retorna byte-for-byte.

## Exemplo equipamento direto por VPN/IP

```text
Gateway field connect -> 10.60.20.222:502
         ||
     raw tunnel
         ||
Gateway :25020 <- Rapid SCADA
```

---

# 3. Regra importante: sem fan-out raw cego

Um Tunnel raw possui **um consumidor ativo por vez**.

Não copiar simultaneamente uma conexão request/response para Rapid + FUXA + outro master. Isso pode misturar transações e corromper protocolos.

Se vários sistemas precisarem dos mesmos dados, o fan-out acontece depois do SCADA/driver, por broker, ou por plugin protocol-aware com arbitragem explícita.

---

# 4. O que mudou no refactor bridge-first de 2026-09-03

Código alterado até o commit de implementação `fee74de9ff0d4e29fd6cfa926bee144086eb6c5a`:

- criado `internal/bridge/tunnel.go`;
- criado teste byte-for-byte duplex `internal/bridge/tunnel_test.go`;
- `Gateway.Run` deixou de produzir Records e passou a subir Túneis raw;
- schema de configuração mudou de 2 para 3;
- `field` e `consumer` são endpoints simétricos `listen/connect`;
- `TCP_NODELAY`, keepalive, reconnect e allowlist CIDR entram no Tunnel;
- sessões/admin/métricas agora representam **pares de bridge**, não telemetria;
- removido runtime de spool;
- removido sink HTTP de Records normalizados;
- removido inventário/registry de identidade de dispositivos do core;
- removido `configs/identity.example.json`;
- removida permissão systemd de escrita em `/var/lib/rc-gateway-umbrella`;
- README, arquitetura, plugin contract e matriz de produção foram realinhados.

## Segurança

`commandPlaneEnabled=true` continua rejeitado.

Allowlist CIDR continua disponível para endpoints `listen`. TLS/mTLS deverá voltar como **tipo/camada de endpoint raw**, não como motor de telemetria.

---

# 5. Código legado/experimental ainda presente

Alguns packages/adapters da fase anterior continuam no repositório para não jogar fora experimentos de bibliotecas:

- adapters MQTT/MQTT5;
- serial;
- SocketCAN/J1939;
- OPC UA read;
- SNMP read;
- CoAP GET;
- WebSocket/WSS;
- event bus/protocol helpers antigos.

**Eles não são iniciados pelo runtime schema 3 e não definem o produto.**

Próxima revisão deve classificar cada um:

1. refatorar para endpoint raw/provider;
2. mover para experimental externo;
3. remover se for apenas leitor/converter semântico.

Não reintroduzir storage/Record/polling no core para aproveitar esses adapters.

---

# 6. Referência ThingsBoard Gateway

Foi estudado `thingsboard/thingsboard-gateway`.

Aproveitar como referência:

- modularidade de connectors;
- reconnect;
- supervisão;
- configuração declarativa;
- extensibilidade;
- métricas.

Não copiar para o core:

- converters de telemetria;
- storage de eventos/telemetria;
- mapas de registradores;
- polling semântico por dispositivo.

Detalhes: [`THINGSBOARD_REFERENCE.md`](./THINGSBOARD_REFERENCE.md).

---

# 7. Estado de validação deste checkpoint

Último HEAD antes deste handoff: `fee74de9ff0d4e29fd6cfa926bee144086eb6c5a`.

As mudanças de runtime bridge-first foram gravadas, porém **o CI do novo conjunto ainda deve ser consultado depois deste commit de handoff antes de afirmar que está verde**.

O último checkpoint anterior à refatoração bridge-first estava verde em Gateway Umbrella, CI geral e Quality/Security, mas isso não substitui a validação do novo Tunnel.

---

# 8. Próximos passos recomendados

Ordem:

1. zerar `gofmt`, `go vet`, unit tests, race e build do novo core;
2. corrigir qualquer regressão encontrada pelo CI;
3. adicionar teste de integração `listen ↔ listen` real em loopback;
4. adicionar teste `connect ↔ listen`;
5. validar PUSR real ↔ Gateway ↔ Rapid em uma porta de laboratório sem tocar o bridge legado;
6. implementar TLS/mTLS como endpoint raw;
7. implementar Serial RS232/422/485 como endpoint raw;
8. implementar UDP bridge com política explícita de sessão;
9. refatorar/remover adapters experimentais antigos;
10. HIL, impairment de rede e soak antes de qualquer produção.

---

# 9. Regra para produção

O Gateway só será considerado production quando provar:

```text
bytes enviados pelo lado A == bytes recebidos no lado B
bytes enviados pelo lado B == bytes recebidos no lado A
```

sob reconnect, fragmentação TCP, latência, perda de link, resets, slow peer e execução prolongada, sem alterar payload e sem vazar sessões/goroutines/memória.
