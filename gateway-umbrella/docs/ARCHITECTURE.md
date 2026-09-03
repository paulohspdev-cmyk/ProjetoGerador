# Arquitetura do RC Gateway Umbrella

## Camadas

```text
CAMPO
  |
  v
Transport adapters
TCP | UDP | Serial | MQTT | TLS | CAN | HTTP | ...
  |
  v
Session + Identity
  |
  v
Framing / protocol adapters
Modbus | MQTT payload | OPC UA | DNP3 | IEC104 | J1939 | ...
  |
  v
Normalized Device Events
  |
  +------------------+
  |                  |
  v                  v
Rapid adapter     Backend/event adapter
```

## Regra de ouro

O Gateway não deve assumir que `porta = controladora`. A identidade final é composta e pode usar peer, certificado, modem/IMEI, VPN identity, registration packet, Unit ID, serial number e fingerprints de protocolo.

## Southbound x Northbound

Southbound é tudo que fala com o campo. Northbound é tudo que entrega dados normalizados para os consumidores internos.

O núcleo não deve depender do Rapid SCADA. Rapid será um adapter northbound, assim como o backend RC.

## Command Plane

Comandos industriais não compartilham o mesmo caminho permissivo da telemetria. O command plane deverá exigir:

1. equipamento identificado;
2. controller pack exato;
3. comando homologado;
4. estado/permissivos válidos;
5. autorização do operador;
6. trilha de auditoria;
7. retorno/feedback quando o protocolo oferecer.

## Fases

1. Core + TCP/UDP + sessão + observabilidade.
2. Modbus TCP/RTU stream decoder e proxy compatível com o bridge atual.
3. TCP direct e serial local.
4. MQTT/MQTTS + broker/client adapters.
5. mTLS e identidade de modem/dispositivo.
6. CAN/J1939/SocketCAN.
7. OPC UA, DNP3, IEC-104 e adapters adicionais.
8. northbound Rapid + backend em paralelo.
9. migração controlada por gerador, nunca big-bang.
