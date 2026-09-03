# RC Gateway Umbrella Architecture

`gateway-umbrella/` é independente do bridge, backend, frontend e Rapid atuais.

O core possui quatro planos:

1. **Transport Plane** — TCP/UDP/TLS/HTTP e adapters futuros serial/CAN/MQTT.
2. **Protocol Plane** — framing, classificação e adapters de protocolo.
3. **Telemetry Plane** — records normalizados, spool, métricas e northbound.
4. **Command Plane** — deliberadamente desabilitado nesta fase.

```text
FIELD / MODEM / VPN / DIRECT IP / SIDECAR
                 |
                 v
       transport adapter
                 |
                 v
          core event bus
                 |
                 v
      stream/framing engine
                 |
                 v
        normalized Record
           /     |      \
          v      v       v
        spool  metrics  northbound
```

## Fail closed

- allowlist pode ser obrigatória;
- TLS mínimo 1.3;
- mTLS em listeners;
- HTTP ingest pode exigir bearer token por env;
- `commandPlaneEnabled=true` é rejeitado pela configuração;
- payload desconhecido vira `raw/UNKNOWN`, nunca telemetria inventada.

## TCP stream

TCP não preserva mensagens. O engine mantém buffer por sessão, suporta MBAP fragmentado e múltiplos frames no mesmo read. RTU é conservador e exige CRC válido.

## Persistência

Records normalizados podem ser gravados em segmentos JSONL rotativos com `fsync` antes do northbound. Isso cria fonte de replay/auditoria mesmo com consumidores indisponíveis.

## Operação

Admin em loopback por padrão:

- `/healthz`
- `/readyz`
- `/status`
- `/sessions`
- `/metrics`

## Migração

Nenhum gerador sai do bridge legado antes de transporte + protocolo chegarem a `field_validated`, passarem HIL/soak e terem rollback.
