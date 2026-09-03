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
- `52b2d76665fb73ac212e5cf085551aa7c658c2e1`: TLS/mTLS + Unix + RST/half-close; workflow Gateway Umbrella passou format, vet, testes, race e build.

## Transportes stream implementados

- TCP listen/connect;
- TLS 1.3 e mTLS sobre TCP;
- Unix socket listen/connect;
- Serial RS232/RS422/RS485 por `serialProviders`, exposto internamente como Unix socket raw;
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e allowlist CIDR;
- métricas por chunk e bytes por direção;
- 50 ciclos de churn/reconnect, RST e half-close testados.

O provider serial usa `go.bug.st/serial v1.8.0`, abre a porta física somente quando o túnel/consumidor precisa dela e nunca interpreta Modbus/IEC/DNP3/NMEA. RS485 com adaptadores que fazem direção automática funciona como stream serial comum; hardware que exija controle kernel/vendor específico de direção deve ser homologado em HIL antes de produção.

## Protocolos cobertos sem adapter semântico

Qualquer protocolo que já seja transportável byte-transparent por TCP/TLS atravessa o core sem biblioteca específica: Modbus TCP, MQTT, OPC UA, IEC-104, DNP3/TCP, HTTP(S), WebSocket, protocolos proprietários e outros. Serial transporta Modbus RTU/ASCII, IEC-101, DNP3 serial, NMEA e protocolos proprietários sem conhecer seu significado.

## Em validação neste HEAD

- dependência serial integrada ao módulo principal;
- configuração `serialProviders`;
- provider RS232/422/485 duplex;
- systemd com `RuntimeDirectory=rc-gateway` e grupo suplementar `dialout`;
- exemplo `gateway.serial.example.json`;
- testes de validação serial sem exigir hardware no CI.

**Consultar o CI deste HEAD antes de declarar serial verde.**

## Ainda falta para software field-test-ready universal

1. UDP datagram/session bridge;
2. carga/leak/concurrency;
3. impairment de rede e soak automatizado;
4. SocketCAN/CAN-FD/J1939/CANopen como frame transport, sem mapa de sinais;
5. instalação, validação de config, release e rollback atômicos;
6. documentação operacional final e matriz de compatibilidade;
7. HIL físico continua sendo o passo posterior para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core.

- Autoformat aplicado ao checkpoint Serial antes da validacao completa.

- `go mod tidy` aplicado ao checkpoint Serial com Go 1.27.1.
