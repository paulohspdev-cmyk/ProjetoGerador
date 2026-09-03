# Production Readiness Matrix — RC Universal Gateway

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md).

O critério de produção agora é **qualidade da ponte**, não quantidade de protocolos interpretados.

## Gates obrigatórios

- `gofmt`, `go vet`, unit tests e race detector;
- teste byte-for-byte nos dois sentidos;
- fragmentação/coalescência TCP sem alteração do payload;
- reconnect e churn;
- half-close/close/reset de qualquer lado;
- slow peer/backpressure;
- limites de memória e goroutines;
- soak mínimo de 24 h em bancada, alvo de 7 dias;
- perda/jitter/latência em rede celular simulada;
- HIL com modem/controladora/software real;
- segurança/allowlist/TLS conforme o endpoint;
- rollback documentado;
- Command Plane fora do core;
- atualização de `PROJECT_STATE.md`.

## Core bridge

| Capacidade | Estado | Para production |
|---|---|---|
| Tunnel raw duplex | implementado | CI + soak + HIL |
| endpoint TCP `listen` | implementado | churn/DoS/backlog/allowlist |
| endpoint TCP `connect` | implementado | reconnect/jitter/DNS/IP failure |
| listen ↔ listen | implementado | validar PUSR ↔ Rapid real |
| connect ↔ listen | implementado | validar IP/VPN ↔ Rapid real |
| connect ↔ connect | suportado pelo modelo | teste de integração |
| allowlist CIDR | implementado em `listen` | política de produção |
| TCP keepalive / NODELAY | implementado | matriz Linux/celular |
| métricas operacionais | implementado | cardinalidade e alertas |
| health/readiness/sessions | implementado | operação/systemd |
| banco de telemetria | **não faz parte do produto** | n/a |
| mapas de memória | **não fazem parte do produto** | n/a |
| polling de registradores | **não faz parte do core** | n/a |

## Próximos endpoint providers

| Meio | Direção | Objetivo |
|---|---|---|
| TLS/mTLS | listen/connect | túnel criptografado |
| Serial RS232/422/485 | local endpoint | serial ↔ TCP/IPC sem semântica |
| UDP | session/datagram bridge | encaminhamento com política de sessão |
| WebSocket/WSS | listen/connect | transporte raw/message-preserving |
| Unix socket | listen/connect | integração local eficiente |
| SocketCAN | local endpoint | CAN frames sem mapa de sinais no core |
| MQTT | connector especializado | somente quando houver contrato de mensagens, sem mapas do equipamento |

OPC UA, SNMP, CoAP, BACnet, IEC, DNP3 e outros **não precisam ser implementados no core para o Gateway ser universal**. Se o software de destino fala o protocolo, o Gateway pode apenas transportar a conexão. Um adapter protocol-aware só deve existir quando houver necessidade real de mediação de transporte.

## Regra de consumidor raw

Um túnel raw possui **um consumidor ativo por vez**. Não existe fan-out byte-transparent cego para múltiplos mestres.

Se Rapid, FUXA, ThingsBoard e outros precisarem simultaneamente dos mesmos dados, o fan-out deve ocorrer:

- depois do SCADA/driver;
- por broker apropriado;
- ou por plugin protocol-aware com arbitragem explícita.

## Aceitação de escala

Antes de substituir o bridge legado:

- >= 1.000 túneis/sessões sintéticas conforme recursos da VM;
- tráfego sustentado sem crescimento contínuo de memória/goroutines;
- bytes de entrada = bytes encaminhados quando não há erro de conexão;
- reconnect repetido sem session leak;
- consumidor ausente não corrompe sessão de campo;
- field ausente não deixa conexão consumer em estado enganoso;
- fechamento de um lado encerra o par e permite novo pareamento limpo;
- nenhuma interpretação ou mutação de payload no caminho raw.
