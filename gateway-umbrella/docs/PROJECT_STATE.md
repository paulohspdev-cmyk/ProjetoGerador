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
- `5dc90212cb6f72138b25e51aedf30a6dcf5f150f`: impairment + mini-soak; bridge, stress e `Impairment and mini-soak gate` passaram no mesmo HEAD, incluindo fragmentação extrema, latência/jitter determinísticos, flapping/reconnect e verificação de goroutines.

## Transportes validados em software

- TCP listen/connect, TLS 1.3/mTLS e Unix sockets;
- Serial RS232/RS422/RS485 raw;
- UDP preservando datagramas e sessões por peer;
- SocketCAN/CAN-FD preservando frames do ABI Linux; J1939/CANopen continuam no consumidor;
- CAN TX bloqueado por padrão (`allowTransmit=false`);
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e CIDR allowlist;
- métricas/sessões por transporte e direção;
- churn/reconnect, RST, half-close, concorrência, leak, impairment e mini-soak automatizados.

## Soak prolongado

`scripts/run-soak.sh` executa o mesmo cenário de impairment/reconnect usado no CI e aceita de 1 segundo a 604800 segundos (7 dias). O mini-soak CI é gate de regressão; 24h/7d na VM e `tc netem` continuam parte da homologação HIL física.

## Em validação neste HEAD — configuração de produção

Este ciclo adiciona um entrypoint de configuração estrita usado pelo daemon e pelo novo `--check-config`:

- rejeição de campos JSON desconhecidos;
- rejeição de valores JSON extras após o documento principal;
- IDs de recursos únicos entre providers/túneis;
- detecção antecipada de colisão de binds TCP, incluindo wildcard e porta administrativa;
- detecção antecipada de colisão de binds UDP;
- rejeição de listener Unix sobre socket pertencente a provider;
- no máximo um túnel consumidor por socket de provider físico;
- rejeição de porta serial física duplicada;
- `--check-config` valida sem abrir transports;
- `--version` expõe versão/commit/build para releases;
- CI valida todos os exemplos `configs/*.json` pelo binário real.

**Consultar o CI deste HEAD antes de declarar este checkpoint verde.**

## Ainda falta para software field-test-ready universal

1. validar configuração estrita/`--check-config` no CI;
2. instalação standalone, release e rollback atômicos;
3. checksums/SBOM/vulnerability/release gates;
4. documentação operacional final e matriz de compatibilidade;
5. HIL físico para declarar produção validada.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
