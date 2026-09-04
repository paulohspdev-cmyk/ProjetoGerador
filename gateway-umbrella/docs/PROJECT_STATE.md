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

## Checkpoints verdes anteriores

- `249a7f0d55c840e5e95764468a6400db8a401fea`: limpeza bridge-first.
- `9dc17491e370a59926d9069c898c0e3bba8b8171`: hardening TCP.
- `52b2d76665fb73ac212e5cf085551aa7c658c2e1`: TLS/mTLS + Unix + RST/half-close.
- `ffa2d548fb14899aad4052cc17dbe1c9d53dab92`: Serial RS232/RS422/RS485.
- `905f82c7036bb00c7539c26ce12ad0f55db5ba48`: UDP datagram/session bridge.
- `0016e2a629e2169024bfea8fd1fb66d7ec0fe1f4`: SocketCAN/CAN-FD software checkpoint; Gateway CI, CI geral e Quality/Security passaram. `vcan` kernel permanece gate da VM/HIL quando o host suporta o módulo.
- `5aa5eb721c76d611f25aac8d3479b336e7475ce4`: stress/leak; 1.000 pares duplex simultâneos + 1.000 ciclos TCP churn.
- `5dc90212cb6f72138b25e51aedf30a6dcf5f150f`: impairment + mini-soak; bridge, stress e soak passaram no mesmo HEAD.
- `a81db7e9cce5db4f4c3107b9ff7ec76ca76678db`: configuração estrita/`--check-config`; Gateway Umbrella, CI geral e Quality/Security passaram.

## Transportes validados em software

- TCP listen/connect, TLS 1.3/mTLS e Unix sockets;
- Serial RS232/RS422/RS485 raw;
- UDP preservando datagramas e sessões por peer;
- SocketCAN/CAN-FD preservando frames do ABI Linux; J1939/CANopen continuam no consumidor;
- CAN TX bloqueado por padrão (`allowTransmit=false`);
- pair timeout, slow-peer/write timeout, half-close drain, keepalive, NODELAY e CIDR allowlist;
- métricas/sessões por transporte e direção;
- churn/reconnect, RST, half-close, concorrência, leak, impairment e mini-soak automatizados.

## Configuração de produção validada

- rejeição de campos JSON desconhecidos;
- rejeição de valores JSON extras após o documento principal;
- IDs de recursos únicos entre providers/túneis;
- detecção antecipada de colisão de binds TCP, incluindo wildcard e porta administrativa;
- detecção antecipada de colisão de binds UDP;
- rejeição de listener Unix sobre socket pertencente a provider;
- no máximo um túnel consumidor por socket de provider físico;
- rejeição de porta serial física duplicada;
- `--check-config` valida sem abrir transports;
- `--version` expõe versão/commit/build;
- CI valida todos os exemplos `configs/*.json`.

## Este ciclo — release industrial standalone em validação

Este ciclo adiciona os últimos gates automatizáveis:

- raiz standalone `/opt/rc-gateway-umbrella`, sem dependência de `/opt/rc-geradores`;
- releases imutáveis em `releases/<versão>` com symlinks `current` e `previous`;
- unit systemd com `ExecStartPre --check-config`;
- build Linux amd64/arm64 com `-trimpath`, versão/commit/build embutidos;
- build determinística com timestamp do commit e tar/gzip reproduzíveis;
- SHA256 por artefato;
- SBOM CycloneDX por arquitetura usando `cyclonedx-gomod v1.12.0`;
- `govulncheck v1.1.4` como gate;
- instalador transacional: verifica checksum/path traversal/estrutura/config, troca release atomicamente e exige readiness;
- rollback automático de release + configuração em falha;
- rollback manual que também exige readiness e reverte a própria tentativa se necessário;
- dry-run do instalador contra o pacote real no CI;
- comparação byte-a-byte de duas builds idênticas para provar reprodutibilidade;
- artifact CI de release candidate;
- runbook operacional e matriz de compatibilidade atualizados.

**Consultar o CI deste HEAD antes de declarar este checkpoint e o estado `software field-test-ready` verdes.**

## Soak prolongado e HIL

`scripts/run-soak.sh` aceita de 1 segundo a 604800 segundos (7 dias). O mini-soak CI é gate de regressão; 24 h/7 d na VM, `tc netem`, PUSR/USR real, serial real, CAN/CAN-FD físico, VPN/4G/MikroTik e consumidor real continuam gates HIL.

## Regra de produção

- **software field-test-ready** = todos os gates automatizáveis, release/supply-chain e documentação verdes no mesmo HEAD;
- **production validated** = somente após HIL/soak físico da topologia real.

Não reintroduzir polling, mapas de memória ou historian no core. Nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite. Suporte a transporte nunca libera automaticamente o Command Plane.
