# Production Readiness Matrix

Nenhum adapter vira `production` só porque compila.

## Gates obrigatórios

- unit e negative tests
- race detector
- fuzz de parsers
- malformed input / memory-bound tests
- churn/reconnect
- timeout, fragmentação e coalescência TCP
- soak mínimo de 24 h em bancada; alvo de 7 dias antes de rollout amplo
- hardware-in-the-loop para mídia física
- validação em pelo menos um equipamento conhecido
- métricas e diagnóstico
- revisão de segurança, dependências e licenças
- rollback documentado
- Command Plane desabilitado salvo homologação separada

## Cobertura alvo

| Família | Implementação alvo | HIL obrigatório |
|---|---|---|
| TCP server/client | Go nativo | impairment de rede |
| UDP | Go nativo | perda/reordenação/duplicação |
| TLS/mTLS | crypto/tls | rotação/revogação/expiração |
| RS232/422/485 | adapter nativo ou sidecar | conversores reais + matriz baud/paridade |
| Modbus TCP/RTU/ASCII | framing nativo + adapter | ComAp/DSE reais + simuladores |
| MQTT/MQTTS | Eclipse Paho sidecar/native | restart broker/QoS/session |
| OPC UA | gopcua adapter | security modes/certificados |
| CAN/CAN-FD/J1939 | SocketCAN | barramento físico |
| CANopen | SocketCAN + adapter | device profiles |
| NMEA/GNSS | nativo/adapter | GNSS real |
| SNMP | adapter | v2c/v3 |
| BACnet | stack maduro em sidecar | BACnet/IP + casos BTL |
| IEC 101/104 | lib60870 sidecar | serial/TCP/TLS |
| DNP3 | stack mantido/comercial | master/outstation + security |
| CoAP/LwM2M | adapter | DTLS/reconnect |
| LoRaWAN | ChirpStack -> MQTT | outage/replay |
| M-Bus/W-MBus | sidecar | barramento físico |

## Aceitação de escala antes de substituir o bridge legado

- >= 1.000 sessões TCP concorrentes em teste sintético
- >= 10.000 records/s em burst sem crash
- memória limitada sob tráfego malformado/slow-client
- spool íntegro após restart abrupto
- nenhum caminho de comando a partir dos listeners de telemetria
- restart gracioso restaura connectors e sidecars
