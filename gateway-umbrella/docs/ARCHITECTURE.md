# RC Universal Gateway — Architecture

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md). Toda mudança no Gateway deve atualizar esse documento.

`gateway-umbrella/` é independente do bridge, backend, frontend, Rapid SCADA e de qualquer SCADA/plataforma específica.

O produto é um **Gateway industrial/IoT universal**. Geradores são apenas um caso de uso.

## Planos do core

O core possui sete planos conceituais:

1. **Transport Plane** — conectividade física/lógica: TCP, UDP, TLS/mTLS, HTTP, serial, CAN, MQTT, WebSocket e adapters futuros.
2. **Protocol Plane** — framing, classificação, parsing e adapters de protocolo.
3. **Identity Plane** — enrollment, resolução de dispositivo e quarentena.
4. **Telemetry Plane** — records normalizados, qualidade, metadata e preservação de payload.
5. **Durability Plane** — spool, replay futuro, filas e backpressure.
6. **Northbound Plane** — distribuição para múltiplos consumidores independentes.
7. **Command Plane** — deliberadamente desabilitado nesta fase.

```text
FIELD / PLC / RTU / IED / MODEM / VPN / SERIAL / CAN / IoT
                         |
                         v
                 transport adapter
                         |
                         v
                   core event bus
                         |
                         v
              stream/framing/protocol
                         |
                         v
               identity resolution
                         |
                         v
                 normalized Record
                    /     |      \
                   v      v       v
                spool   metrics   routing
                                  |
             +--------------------+--------------------+
             |          |         |        |           |
             v          v         v        v           v
          Rapid       FUXA   ThingsBoard Node-RED  RC Geradores
             |
             +--> MQTT/HTTP/API/TSDB/Prometheus -> Grafana/outros
```

## Universalidade e desacoplamento

O core não deve conter regras de negócio específicas de geradores e não deve depender de Rapid SCADA, FUXA, ThingsBoard, Node-RED, Grafana ou RC Geradores para adquirir dados.

Um novo protocolo Southbound deve poder ser adicionado sem modificar cada consumidor Northbound. Um novo consumidor deve poder ser adicionado sem modificar os transportes/protocolos de campo.

O mesmo `Record` pode ser enviado para vários consumidores simultaneamente.

## Northbound

Northbound é uma camada de sinks/connectors/adapters. Alvos previstos incluem:

- HTTP/HTTPS JSON;
- MQTT publish;
- WebSocket;
- Rapid SCADA;
- FUXA;
- ThingsBoard;
- Node-RED;
- RC Geradores;
- OPC UA server/exposure quando implementado;
- Modbus TCP server/virtual mapping quando apropriado;
- bancos/TSDB;
- Prometheus/OpenMetrics;
- integrações customizadas.

Grafana é tratado normalmente como camada de visualização sobre uma fonte de dados (Prometheus/InfluxDB/Timescale/PostgreSQL etc.), não como dependência do core.

## Identity / enrollment

A identidade do equipamento não pode ser definida apenas por porta/IP.

Estados:

- `enrolled`;
- `quarantined`;
- `unknown`;
- `revoked`.

Evidências fortes incluem certificado/fingerprint, MQTT Client ID, IMEI, ICCID, serial e VPN peer quando disponíveis. CIDR, IP, porta e Unit ID são evidências auxiliares/fracas.

A telemetria de origem ainda não confiável pode ser preservada para diagnóstico, mas não recebe confiança de dispositivo `enrolled` sem evidência suficiente.

## Fail closed

- allowlist pode ser obrigatória;
- TLS mínimo 1.3;
- mTLS em listeners;
- HTTP ingest pode exigir bearer token por env;
- `commandPlaneEnabled=true` é rejeitado pela configuração;
- payload desconhecido vira `raw/UNKNOWN`, nunca telemetria inventada;
- identidade fraca/ambígua permanece em quarentena;
- consumidor indisponível não deve forçar descarte silencioso de dados.

## TCP stream

TCP não preserva mensagens. O engine mantém buffer por sessão, suporta MBAP fragmentado e múltiplos frames no mesmo read. RTU é conservador e exige CRC válido.

## Persistência

Records normalizados podem ser gravados em segmentos JSONL rotativos com `fsync` antes do northbound. Isso cria base para replay/auditoria mesmo com consumidores indisponíveis.

A evolução planejada inclui ACK/checkpoint, replay, retenção e backpressure explícito.

## Operação

Admin em loopback por padrão:

- `/healthz`
- `/readyz`
- `/status`
- `/sessions`
- `/metrics`

## Migração e uso de campo

Nenhum equipamento crítico sai de uma integração já homologada antes de transporte + protocolo + identidade + destino chegarem ao lifecycle requerido, passarem HIL/soak e terem rollback.

No caso do sistema RC Geradores, nenhum gerador sai do bridge legado apenas porque o Gateway Umbrella consegue abrir uma conexão. Migração exige telemetria real equivalente, identidade adequada, comportamento offline e validação de campo.
