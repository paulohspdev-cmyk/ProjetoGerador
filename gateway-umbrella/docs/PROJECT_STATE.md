# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.** Toda alteração no Gateway deve atualizar este arquivo no mesmo ciclo.

## Decisão fixa

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O Gateway é uma ponte universal de conectividade. Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver interpreta registradores e protocolos de aplicação.

## Checkpoints verdes

- `249a7f0d55c840e5e95764468a6400db8a401fea`: limpeza bridge-first.
- `9dc17491e370a59926d9069c898c0e3bba8b8171`: hardening TCP.
- `52b2d76665fb73ac212e5cf085551aa7c658c2e1`: TLS/mTLS + Unix + RST/half-close; Gateway CI passou format, vet, testes, race e build.
- `ffa2d548fb14899aad4052cc17dbe1c9d53dab92`: Serial RS232/RS422/RS485 integrado; Gateway CI, CI geral e Quality/Security passaram.
- `905f82c7036bb00c7539c26ce12ad0f55db5ba48`: UDP datagram/session bridge; Gateway CI, CI geral e Quality/Security passaram, incluindo race detector.

## Transportes validados em software

### Stream

- TCP listen/connect;
- TLS 1.3 e mTLS sobre TCP;
- Unix socket listen/connect;
- Serial RS232/RS422/RS485 por `serialProviders`, exposto internamente como Unix socket raw;
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e allowlist CIDR;
- métricas por chunk e bytes por direção;
- churn/reconnect, RST e half-close testados.

### Datagram

- UDP com exatamente um lado `listen` e um lado `connect`;
- sessão independente por peer remoto;
- preservação dos limites de cada datagrama;
- idle timeout, limites de sessão/payload, allowlist e métricas;
- testes com múltiplos peers, expiração, oversize e session limit.

## Em validação neste HEAD — SocketCAN/CAN-FD

O provider Linux SocketCAN é orientado a frame e exposto por Unix `SOCK_SEQPACKET`. Ele preserva o ABI do kernel: 16 bytes para CAN clássico e 72 bytes para CAN-FD.

Regras:

- J1939, CANopen e mapas de sinais ficam fora do core;
- `allowTransmit` é `false` por padrão;
- IDs/sockets de providers Serial/CAN não podem colidir;
- métricas e sessões CAN são registradas;
- systemd permite apenas AF_UNIX/AF_INET/AF_INET6/AF_NETLINK/AF_CAN;
- testes unitários preservam frames clássico/FD e validam bloqueio de TX;
- existe teste real `vcan0` de round-trip clássico + FD.

No GitHub-hosted runner atual, o kernel Azure não possui o módulo `vcan`; portanto o workflow executa o teste kernel quando o host oferecer `vcan` e registra notice quando não oferecer. O teste `vcan0` permanece gate obrigatório na VM/HIL antes de declarar CAN validado fisicamente.

**Consultar o CI deste HEAD antes de declarar o checkpoint de software CAN verde.**

## Ainda falta para software field-test-ready universal

1. fechar CI CAN (format/vet/unit/race/build; `vcan` quando disponível);
2. carga/leak/concurrency;
3. impairment de rede e soak automatizado;
4. `--check-config`, instalação, release e rollback atômicos;
5. checksums/SBOM e gates de release;
6. documentação operacional final e matriz de compatibilidade;
7. HIL físico para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
