# Production Readiness Matrix — RC Universal Gateway

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md).

O critério de produção é **qualidade da ponte**, não quantidade de protocolos interpretados.

## Core bridge TCP

| Capacidade | Estado |
|---|---|
| Tunnel raw duplex | implementado |
| TCP listen/connect | implementado |
| listen ↔ listen | testado com sockets reais |
| connect ↔ listen | testado com sockets reais |
| byte-for-byte bidirecional | testado |
| reconnect/churn repetido | teste de 50 ciclos implementado |
| pair establishment timeout | implementado |
| slow peer/write timeout | implementado |
| half-close drain | implementado; falta teste TCP explícito |
| métricas durante sessão longa | implementado por chunk |
| bytes separados por direção em `/sessions` | implementado |
| allowlist CIDR | implementado |
| TCP keepalive/NODELAY | implementado |
| race detector | gate CI |
| RST/queda abrupta | falta teste explícito |
| leak de sockets/goroutines | falta teste de carga |
| escala/concurrency | falta benchmark/carga |
| impairment celular | falta suíte |
| HIL/soak físico | obrigatório antes de produção real |

## Segurança

- `commandPlaneEnabled=true` continua rejeitado;
- configuração exemplo passa a usar `requireAllowlist=true`;
- portas públicas devem ser protegidas também por firewall/VPN quando disponível;
- TLS/mTLS será endpoint de transporte, não motor de telemetria.

## Próximos endpoint providers

| Meio | Objetivo |
|---|---|
| TLS/mTLS | túnel criptografado listen/connect |
| Unix socket | integração local eficiente |
| Serial RS232/422/485 | serial ↔ stream sem semântica |
| UDP | datagram bridge com sessão explícita |
| WebSocket/WSS | transporte com contrato de framing explícito |
| SocketCAN | frames CAN com contrato de encapsulamento explícito |
| MQTT | connector message-oriented somente com contrato explícito |

OPC UA, SNMP, CoAP, BACnet, IEC e DNP3 não precisam ser interpretados pelo core se o software de destino já fala o protocolo.

## Gate final de software antes do primeiro campo

- todos os workflows verdes;
- RST/half-close/churn/slow-peer/pair-timeout verdes;
- teste de leak e carga concluído;
- endpoints previstos para a primeira homologação implementados;
- pacote systemd/config/rollback validado;
- `PROJECT_STATE.md` atualizado.

Depois disso começa HIL/soak com hardware real; só HIL pode transformar “field-test-ready” em “production validated”.
