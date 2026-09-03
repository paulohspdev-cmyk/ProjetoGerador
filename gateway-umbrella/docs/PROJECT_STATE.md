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
- `ffa2d548fb14899aad4052cc17dbe1c9d53dab92`: Serial RS232/RS422/RS485 integrado; Gateway CI, CI geral e Quality/Security passaram. `go mod tidy` aplicado com Go 1.27.1.
- `905f82c7036bb00c7539c26ce12ad0f55db5ba48`: UDP datagram/session bridge; Gateway CI, CI geral e Quality/Security passaram, incluindo race detector.

## Transportes validados em software

### Stream

- TCP listen/connect;
- TLS 1.3 e mTLS sobre TCP;
- Unix socket listen/connect;
- Serial RS232/RS422/RS485 por `serialProviders`, exposto internamente como Unix socket raw;
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e allowlist CIDR;
- métricas por chunk e bytes por direção;
- 50 ciclos de churn/reconnect, RST e half-close testados.

### Datagram

- UDP com exatamente um lado `listen` e um lado `connect`;
- sessão independente por peer remoto;
- preservação dos limites de cada datagrama;
- idle timeout;
- limite de sessões simultâneas;
- limite de payload;
- allowlist CIDR;
- métricas de sessões, datagramas, bytes e drops;
- testes com múltiplos peers, expiração, oversize e session limit.

O provider serial usa `go.bug.st/serial v1.8.0`, abre a porta física somente quando o túnel/consumidor precisa dela e nunca interpreta Modbus/IEC/DNP3/NMEA. RS485 com adaptadores que fazem direção automática funciona como stream serial comum; hardware que exija controle kernel/vendor específico de direção deve ser homologado em HIL antes de produção.

## Protocolos cobertos sem adapter semântico

Qualquer protocolo que já seja transportável byte-transparent por TCP/TLS atravessa o core sem biblioteca específica: Modbus TCP, MQTT, OPC UA, IEC-104, DNP3/TCP, HTTP(S), WebSocket, protocolos proprietários e outros. Serial transporta Modbus RTU/ASCII, IEC-101, DNP3 serial, NMEA e protocolos proprietários sem conhecer seu significado. UDP transporta protocolos orientados a datagrama sem alterar os limites dos pacotes.

## Próximo checkpoint — CAN

Implementar SocketCAN/CAN-FD como transporte orientado a frame. O Gateway deve preservar ID, formato standard/extended, RTR/error quando aplicável, tamanho, dados e flags CAN-FD/BRS/ESI. J1939 e CANopen continuam sendo semântica do consumidor, nunca banco de sinais no Gateway.

## Ainda falta para software field-test-ready universal

1. SocketCAN/CAN-FD frame transport;
2. carga/leak/concurrency;
3. impairment de rede e soak automatizado;
4. validação de config/dry-run, instalação, release e rollback atômicos;
5. documentação operacional final e matriz de compatibilidade;
6. HIL físico continua sendo o passo posterior para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
