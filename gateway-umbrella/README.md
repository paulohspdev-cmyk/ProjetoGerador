# RC Universal Gateway — Gateway Umbrella

> **ANTES DE ALTERAR ESTE PROJETO:** leia [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md). Esse arquivo é o handoff canônico, registra onde o desenvolvimento parou e deve ser atualizado após toda mudança no Gateway.

`gateway-umbrella/` é o novo núcleo universal de conectividade industrial/IoT. Ele é deliberadamente isolado do bridge legado, backend, frontend e Rapid SCADA atuais.

O Gateway **não é exclusivo para geradores**. Grupos geradores são um dos casos de uso. A arquitetura deve atender equipamentos industriais/IoT em geral e distribuir os dados para múltiplos consumidores.

## Objetivo

```text
EQUIPAMENTOS / PLC / RTU / IED / MEDIDORES / GERADORES / IoT
                         |
                         v
               RC UNIVERSAL GATEWAY
       transporte -> protocolo -> identidade
        -> normalização -> spool -> roteamento
                         |
          +--------------+--------------+----------------+
          |              |              |                |
          v              v              v                v
    Rapid SCADA         FUXA       ThingsBoard       Node-RED
          |                                                |
          +--------------+---------------+----------------+
                                         |
                                         +--> RC Geradores
                                         +--> MQTT/HTTP/API
                                         +--> TSDB -> Grafana
                                         +--> outros SCADA/IoT
```

Rapid SCADA, FUXA, ThingsBoard, Node-RED, Grafana/TSDB e RC Geradores são **consumidores Northbound**, não dependências obrigatórias do core.

## Runtime já implementado na branch

- TCP server / reverse TCP;
- TCP client para equipamentos acessíveis por IP/VPN;
- UDP server;
- TLS 1.3 e mTLS server;
- TLS client;
- HTTP ingest;
- allowlist CIDR e limite de conexões;
- sessões connect/data/disconnect;
- event bus;
- reassembly de Modbus TCP em stream;
- detecção conservadora Modbus TCP/RTU e CRC16;
- detecção NMEA 0183 e JSON;
- records normalizados com qualidade SCADA;
- spool persistente JSONL com fsync/rotação;
- health/readiness/status/sessions/metrics;
- northbound HTTP JSON;
- supervisor de sidecars/adapters;
- identidade/enrollment com `enrolled`, `quarantined`, `unknown` e `revoked`;
- fingerprint SHA-256 de certificado mTLS como evidência forte;
- adapters serial, MQTT, MQTT v5, SocketCAN/J1939, OPC UA, SNMP, CoAP e WebSocket/WSS;
- Command Plane explicitamente bloqueado.

Isso **não significa** que todos os protocolos/adapters estejam `production`. O lifecycle é explícito e exige HIL, soak, segurança e validação de campo.

## Princípios

- universalidade: nenhum SCADA, protocolo ou domínio de negócio controla o core;
- fail-closed;
- nenhuma escrita industrial por padrão;
- transporte, framing, protocolo, identidade, equipamento e consumidor são camadas diferentes;
- TCP não é tratado como `um read = um frame`;
- dispositivo desconhecido permanece desconhecido/quarentenado;
- IP/porta não são identidade forte;
- adapter não recebe permissão de comando por estar instalado;
- aquisição não depende de frontend ou consumidor Northbound;
- consumidores podem ficar offline sem derrubar aquisição;
- observabilidade e persistência pertencem ao runtime;
- nenhum valor de telemetria é inventado.

## Executar

```bash
cd gateway-umbrella
go test ./...
go vet ./...
go build ./cmd/rc-gateway
go run ./cmd/rc-gateway -config ./configs/gateway.example.json
```

Admin padrão: `127.0.0.1:18080` com `/healthz`, `/readyz`, `/status`, `/sessions` e `/metrics`.

Lifecycle: `experimental -> lab_validated -> field_validated -> production`.

## Documentação essencial

- [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) — **fonte canônica para retomar o trabalho**;
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitetura;
- [`docs/PRODUCTION_MATRIX.md`](./docs/PRODUCTION_MATRIX.md) — lifecycle/cobertura;
- [`docs/PLUGIN_CONTRACT.md`](./docs/PLUGIN_CONTRACT.md) — contrato de adapters/sidecars;
- [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md) — toolchain.
