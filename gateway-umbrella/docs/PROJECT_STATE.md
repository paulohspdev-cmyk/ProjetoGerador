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
- `0016e2a629e2169024bfea8fd1fb66d7ec0fe1f4`: SocketCAN/CAN-FD software checkpoint; Gateway CI, CI geral e Quality/Security passaram. O runner GitHub não possui módulo `vcan`, então o round-trip kernel permanece gate da VM/HIL.

## Transportes validados em software

- TCP listen/connect, TLS 1.3/mTLS e Unix sockets;
- Serial RS232/RS422/RS485 raw;
- UDP preservando datagramas e sessões por peer;
- SocketCAN/CAN-FD preservando frames do ABI Linux; J1939/CANopen continuam no consumidor;
- CAN TX bloqueado por padrão (`allowTransmit=false`);
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e CIDR allowlist;
- métricas/sessões por transporte e direção;
- churn/reconnect, RST e half-close testados.

## Em validação neste HEAD — carga/leak/concurrency

Foi adicionado gate de stress separado do job funcional:

- 1.000 pares duplex simultâneos usando o mesmo `copyDuplex` do core;
- payload binário validado nos dois sentidos em todos os pares;
- 1.000 ciclos reais de conexão/desconexão TCP usando `acquirePair` e sockets reais;
- contagem de `/proc/self/fd` antes/depois para detectar vazamento de descritores;
- contagem de goroutines antes/depois para detectar leak;
- limites de entrada para impedir configuração acidental de stress não limitado;
- job `Stress and leak gate` com timeout próprio.

**Consultar o CI deste HEAD antes de declarar stress/leak verde.**

## Protocolos cobertos sem adapter semântico

Qualquer protocolo transportável byte-transparent por TCP/TLS atravessa o core sem biblioteca específica: Modbus TCP, MQTT, OPC UA, IEC-104, DNP3/TCP, HTTP(S), WebSocket e protocolos proprietários. Serial transporta Modbus RTU/ASCII, IEC-101, DNP3 serial, NMEA e protocolos proprietários. UDP preserva datagramas. CAN preserva frames.

## Ainda falta para software field-test-ready universal

1. validar carga/leak/concurrency no CI;
2. impairment de rede e soak automatizado;
3. `--check-config` e validação estrita/conflitos;
4. instalação standalone, release e rollback atômicos;
5. checksums/SBOM/vulnerability/release gates;
6. documentação operacional final e matriz de compatibilidade;
7. HIL físico para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
