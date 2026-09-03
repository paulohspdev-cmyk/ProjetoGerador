# RC Gateway Umbrella

Novo núcleo de conectividade industrial da RC Geradores.

Este diretório é deliberadamente independente do bridge legado, do backend web, do frontend e do Rapid SCADA. A migração só deve ocorrer depois de testes de bancada e campo.

## Objetivo

Receber conexões heterogêneas de campo, manter identidade e saúde das sessões, detectar/decodificar protocolos através de adapters e entregar uma interface normalizada para consumidores como Rapid SCADA e backend RC.

## Princípios

- fail-closed: nenhuma escrita industrial é habilitada por padrão;
- uma sessão de campo não é confiável apenas porque conseguiu abrir TCP;
- transporte, framing, protocolo e modelo de controladora são camadas diferentes;
- nenhum driver conhece frontend ou regras de UI;
- observabilidade e auditoria fazem parte do núcleo;
- backpressure, timeout e isolamento por sessão/dispositivo são obrigatórios;
- adapters novos entram sem alterar o core.

## Estado desta fundação

Implementado nesta primeira base:

- daemon Go independente;
- listeners TCP server/reverse TCP;
- listener UDP;
- allowlist CIDR para TCP;
- registro de sessão connect/data/disconnect;
- event bus interno;
- detecção conservadora de frame Modbus TCP completo;
- detecção/CRC de frame Modbus RTU completo;
- logs estruturados JSON;
- testes do detector Modbus.

Ainda **não** significa suporte de produção para MQTT, serial, CAN, OPC UA, DNP3, IEC-104 etc. Esses entram como adapters independentes e só recebem status `production` após testes próprios.

## Famílias previstas

### Transportes

- TCP server / reverse TCP
- TCP client / direct TCP
- UDP server/client
- TLS/mTLS
- serial local RS232/RS422/RS485
- serial transparente sobre TCP/UDP
- MQTT/MQTTS
- HTTP/HTTPS ingest
- WebSocket
- VPN-reachable endpoints
- CAN/CAN-FD via SocketCAN
- UNIX sockets/local IPC

### Protocolos/adapters

- raw bytes
- Modbus TCP
- Modbus RTU
- Modbus ASCII
- RTU-over-TCP
- MQTT/Sparkplug-style payloads
- OPC UA
- BACnet/IP
- DNP3
- IEC 60870-5-101/104
- CAN/J1939/CANopen
- NMEA/GNSS
- SNMP
- CoAP/LwM2M
- M-Bus/Wireless M-Bus
- LoRaWAN integrations
- vendor-specific drivers

## Segurança

O core nasce somente em recepção/observação. Escritas e comandos devem passar por um Command Plane separado, com identidade forte do dispositivo, ACL, permissivos, confirmação, auditoria e adapter explicitamente homologado.

## Executar

```bash
go test ./...
go run ./cmd/rc-gateway -config ./configs/gateway.example.json
```
