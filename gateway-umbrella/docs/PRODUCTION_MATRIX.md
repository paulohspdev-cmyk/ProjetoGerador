# Production Readiness Matrix — Bridge First

> Estado/handoff canônico: [`PROJECT_STATE.md`](./PROJECT_STATE.md). Toda mudança no Gateway deve atualizar esse documento.

Nenhum transporte, bridge, connector ou integração vira `production` só porque compila.

## Escopo de produção

O RC Universal Gateway é uma ponte universal de conectividade.

A validação de produção mede:

- estabilidade da conexão;
- integridade dos bytes;
- reconnect;
- timeout;
- roteamento;
- multiplexação;
- segurança;
- limites de memória;
- observabilidade;
- comportamento sob perda/jitter/reordenação;
- compatibilidade com o sistema de destino.

Não mede se o Gateway sabe interpretar mapas de memória de cada fabricante, porque isso não pertence ao core.

## Gates obrigatórios

- unit e negative tests;
- race detector;
- fuzz de parsers/framing usados pelo bridge;
- malformed input / memory-bound tests;
- churn/reconnect;
- timeout, fragmentação e coalescência TCP;
- soak mínimo de 24 h em bancada; alvo de 7 dias antes de rollout amplo;
- hardware-in-the-loop para mídia física;
- validação com modem/conversor/equipamento real quando aplicável;
- métricas e diagnóstico;
- revisão de segurança, dependências e licenças;
- rollback documentado;
- Command Plane bloqueado salvo homologação separada;
- atualização obrigatória de `PROJECT_STATE.md`.

## Transportes / bridge Southbound

| Família | Papel no Gateway | Estado alvo | HIL obrigatório |
|---|---|---|---|
| TCP server / reverse TCP | receber modems/dispositivos que iniciam conexão | production | modem real + impairment de rede |
| TCP client | alcançar equipamentos por LAN/VPN/IP | production | equipamento real + perda/reconnect |
| UDP | bridge datagram | production quando houver caso real | perda/reordenação/duplicação |
| TLS/mTLS | proteger transporte | production | rotação/revogação/expiração |
| RS232/422/485 | bridge serial local/remota | production | conversores reais + matriz baud/paridade |
| RTU-over-TCP | transportar serial transparente em TCP | production | modem/DTU real + fragmentação/coalescência |
| Modbus TCP framing | auxiliar de framing/multiplexação, não mapa de memória | production | múltiplos Units + MBAP fragmentado |
| Modbus RTU framing | auxiliar de framing/CRC, não leitura semântica | production | CRC/timeout/múltiplos Units |
| MQTT | transporte/bridge quando a origem/destino usa broker | production por caso | broker restart/QoS/session/TLS |
| WebSocket/WSS | transporte/bridge | production por caso | reconnect/slow-client/TLS |
| SocketCAN/CAN | transporte de frames | production por caso | barramento físico |
| CAN-FD/J1939 | transporte/framing especializado | futuro | barramento físico |
| protocolo proprietário raw | byte-transparent bridge | production por rota | software de destino + equipamento real |

## Destinos / Northbound

O destino é o sistema que realmente entende ou utiliza a conexão.

| Destino | Papel do Gateway | Objetivo |
|---|---|---|
| Rapid SCADA | apresentar endpoint/conexão estável | Rapid continua responsável por driver, polling, canais, histórico e interpretação |
| FUXA | encaminhar protocolo/conexão suportada | FUXA interpreta os pontos conforme sua configuração |
| ThingsBoard | bridge por MQTT/HTTP/socket ou connector apropriado | ThingsBoard faz modelagem/telemetria conforme sua arquitetura |
| Node-RED | bridge por MQTT/HTTP/WebSocket/TCP | fluxo Node-RED interpreta/processa |
| software do fabricante | transporte transparente | software entende protocolo proprietário |
| outro SCADA | endpoint/bridge | SCADA/driver interpreta o equipamento |
| RC Geradores | normalmente através do Rapid/backend ou contrato específico | Gateway não contém mapas ComAp/DSE |

## Componentes fora do escopo do core

Os itens abaixo **não devem receber status de produção como funções do core**:

- banco de telemetria;
- SQLite/TSDB para dados de processo;
- spool persistente de telemetria;
- mapa de registradores ComAp;
- mapa de registradores DSE;
- mapa de PLC/IHM;
- leitura semântica de RPM/pressão/tensão;
- converters de pontos;
- historian;
- dashboards;
- alarm engine.

Se algum desses recursos for necessário, deve existir no consumidor ou em plugin externo claramente separado do bridge.

## Componentes experimentais existentes

A branch atualmente contém adapters/readers criados durante a fase em que o Gateway estava sendo desenhado como motor de dados, incluindo OPC UA client/read, SNMP read, CoAP GET e outros.

Eles devem ser classificados antes do merge:

- se servem como **transporte/bridge**, podem permanecer após simplificação;
- se fazem **polling/conversão semântica**, devem sair do core, ser movidos para plugin opcional externo ou ser removidos;
- sua existência no repositório não muda a decisão arquitetural bridge-first.

## Aceitação de escala

Antes de substituir o bridge legado:

- >= 1.000 sessões TCP concorrentes em teste sintético;
- nenhuma corrupção de payload em fragmentação/coalescência;
- memória limitada sob tráfego malformado/slow-client;
- reconnect automático após queda de modem/rede;
- múltiplas sessões e Units sem cross-talk;
- destino indisponível não pode causar crescimento ilimitado de memória;
- backpressure deve ser explícito;
- nenhuma dependência de banco de telemetria;
- nenhum mapa de memória necessário para criar uma rota;
- restart gracioso restaura listeners/rotas;
- software de destino consegue conversar com o equipamento através do Gateway como se tivesse a conexão esperada;
- migração deve ter rollback simples para o bridge legado.

## Critério 10/10

Um equipamento com protocolo desconhecido para o Gateway, mas conhecido pelo software de destino, deve poder funcionar por uma rota transparente sem exigir código novo de telemetria.

Esse é o principal critério de universalidade do produto.
