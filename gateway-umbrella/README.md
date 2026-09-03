# RC Gateway Umbrella

Novo núcleo de conectividade industrial da RC Geradores, deliberadamente isolado do bridge legado, backend, frontend e Rapid SCADA.

## Runtime já implementado na branch

- TCP server / reverse TCP;
- TCP client para controladoras acessíveis por IP/VPN;
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
- supervisor de sidecars para stacks MQTT, serial, CAN/J1939, OPC UA, BACnet, DNP3, IEC-104 etc.;
- Command Plane explicitamente bloqueado.

Isso **não significa** que todos os protocolos do catálogo estejam `production`. O lifecycle é explícito e exige HIL, soak, segurança e campo.

## Princípios

- fail-closed;
- nenhuma escrita industrial por padrão;
- transporte, framing, protocolo e controladora são camadas diferentes;
- TCP não é tratado como `um read = um frame`;
- dispositivo desconhecido permanece desconhecido;
- adapter não recebe permissão de comando por estar instalado;
- aquisição não depende do frontend;
- Rapid/backend são consumidores;
- observabilidade e persistência pertencem ao runtime.

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
