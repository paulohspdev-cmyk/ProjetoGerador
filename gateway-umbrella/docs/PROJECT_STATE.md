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
- `52b2d76665fb73ac212e5cf085551aa7c658c2e1`: TLS/mTLS + Unix + RST/half-close.
- `ffa2d548fb14899aad4052cc17dbe1c9d53dab92`: Serial RS232/RS422/RS485.
- `905f82c7036bb00c7539c26ce12ad0f55db5ba48`: UDP datagram/session bridge.
- `0016e2a629e2169024bfea8fd1fb66d7ec0fe1f4`: SocketCAN/CAN-FD software checkpoint; Gateway CI, CI geral e Quality/Security passaram. `vcan` kernel permanece gate da VM/HIL quando o host suporta o módulo.
- `5aa5eb721c76d611f25aac8d3479b336e7475ce4`: stress/leak checkpoint; 1.000 pares duplex simultâneos + 1.000 ciclos TCP churn passaram no job `Stress and leak gate`, com limites de FD/goroutines respeitados.

## Transportes validados em software

- TCP listen/connect, TLS 1.3/mTLS e Unix sockets;
- Serial RS232/RS422/RS485 raw;
- UDP preservando datagramas e sessões por peer;
- SocketCAN/CAN-FD preservando frames do ABI Linux; J1939/CANopen continuam no consumidor;
- CAN TX bloqueado por padrão (`allowTransmit=false`);
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e CIDR allowlist;
- métricas/sessões por transporte e direção;
- churn/reconnect, RST, half-close, concorrência e leak gates automatizados.

## Em validação neste HEAD — impairment e soak

Foi adicionado impairment reproduzível em user-space, sem depender de privilégios `tc/netem` do runner:

- fragmentação agressiva de reads/writes;
- latência e jitter determinísticos por operação;
- preservação byte-a-byte sob fragmentação extrema;
- recriação contínua de pares para simular flapping/reconexões;
- mini-soak CI de 20 segundos com payload variável nos dois sentidos;
- verificação de goroutines após soak;
- `scripts/run-soak.sh` usa exatamente o mesmo teste e aceita de 1 segundo a 604800 segundos (7 dias), permitindo 24h/7d na VM.

O mini-soak CI é gate de regressão, não substitui soak físico de 24h/7d nem `tc netem` na VM/HIL.

**Consultar o CI deste HEAD antes de declarar impairment/mini-soak verde.**

## Ainda falta para software field-test-ready universal

1. validar impairment/mini-soak no CI;
2. `--check-config` e validação JSON estrita/conflitos;
3. instalação standalone, release e rollback atômicos;
4. checksums/SBOM/vulnerability/release gates;
5. documentação operacional final e matriz de compatibilidade;
6. HIL físico para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
