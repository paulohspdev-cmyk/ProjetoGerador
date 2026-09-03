# Production Readiness Matrix

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md). Toda mudança no Gateway deve atualizar esse documento.

Nenhum adapter ou integração vira `production` só porque compila.

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
- atualização obrigatória de `PROJECT_STATE.md`

## Cobertura Southbound / aquisição

| Família | Implementação alvo | HIL obrigatório |
|---|---|---|
| TCP server/client | Go nativo | impairment de rede |
| UDP | Go nativo | perda/reordenação/duplicação |
| TLS/mTLS | crypto/tls | rotação/revogação/expiração |
| RS232/422/485 | adapter nativo ou sidecar | conversores reais + matriz baud/paridade |
| Modbus TCP/RTU/ASCII | framing nativo + adapter | equipamentos reais + simuladores |
| MQTT/MQTTS inbound | Eclipse Paho sidecar/native | restart broker/QoS/session |
| OPC UA client/read | gopcua adapter | security modes/certificados |
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

## Cobertura Northbound / consumidores

Northbound é multi-consumidor. Um mesmo `Record` pode alimentar vários destinos. O status abaixo é propositalmente conservador.

| Destino / interface | Estado atual | Caminho alvo | Condição para `production` |
|---|---|---|---|
| HTTP/HTTPS JSON genérico | implementado no core, ainda em evolução | sink assíncrono com fila, retry, replay/ACK e auth | soak + outage/replay + limites de fila |
| MQTT publish genérico | planejado | publisher Northbound separado dos adapters MQTT inbound | QoS/session/reconnect + credenciais/TLS + replay |
| RC Geradores | planejado no Umbrella | consumer/adapter por contrato estável | equivalência de telemetria + soak + rollback |
| Rapid SCADA | planejado como consumer independente | adapter Northbound; não dependência do core | equivalência de canais/qualidade + restart/replay + HIL |
| FUXA | planejado | OPC UA/Modbus TCP/MQTT ou contrato homologado | interoperabilidade real + reconexão + qualidade |
| ThingsBoard | planejado | MQTT/HTTP Northbound | device identity + auth/TLS + outage/replay |
| Node-RED | planejado | MQTT/HTTP/WebSocket | contrato estável + backpressure/reconnect |
| Prometheus/OpenMetrics | métricas operacionais já existem; telemetria geral ainda não | exporter separado quando apropriado | cardinalidade/escala/retention validados |
| TSDB (InfluxDB/Timescale/PostgreSQL etc.) | planejado | sink dedicado/batch | retenção + retry + idempotência + carga |
| Grafana | não é sink direto obrigatório | consulta Prometheus/TSDB alimentada pelo Gateway | depende do pipeline de dados escolhido |
| OPC UA server/exposure | planejado | Northbound server isolado | security modes/certificados + namespace versionado |
| Modbus TCP virtual server | planejado quando necessário | mapa virtual derivado de Records | mapa/versionamento + limites + read-only inicial |
| WebSocket outbound | planejado | stream de Records/telemetria | auth + reconnect + slow-client/backpressure |
| Outros SCADA/IoT/MES/BMS | extensível | adapters/sinks por contrato | testes específicos do destino |

### Regra arquitetural

Nenhum destino Northbound pode virar dependência obrigatória da aquisição. Rapid SCADA, FUXA, ThingsBoard, Node-RED, Grafana/TSDB e RC Geradores são consumidores independentes.

O adapter MQTT existente hoje é **inbound/read-only**: ele assina tópicos e transforma mensagens recebidas em observations. Isso não deve ser confundido com o futuro MQTT publisher Northbound.

## Aceitação de escala antes de substituir integrações legadas

- >= 1.000 sessões TCP concorrentes em teste sintético
- >= 10.000 records/s em burst sem crash
- memória limitada sob tráfego malformado/slow-client
- spool íntegro após restart abrupto
- replay sem duplicação silenciosa/ordenação indefinida onde o contrato exigir
- consumidor Northbound indisponível não derruba aquisição
- backpressure e descarte, se inevitáveis, devem ser explícitos e métricos
- nenhum caminho de comando a partir dos listeners de telemetria
- restart gracioso restaura connectors e sidecars
- fan-out para múltiplos consumidores validado sem acoplamento entre destinos
