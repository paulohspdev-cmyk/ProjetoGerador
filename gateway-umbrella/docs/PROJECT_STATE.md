# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.**
>
> Este é o documento canônico de continuidade do Gateway. Ele existe para que qualquer novo chat, agente, desenvolvedor ou operador consiga entender o produto, saber exatamente onde o trabalho parou e continuar sem depender da memória de conversas anteriores.

## Regra obrigatória de manutenção

**Toda modificação, correção, melhoria, remoção, mudança de arquitetura, mudança de dependência, novo protocolo, novo transporte, novo consumidor, nova integração, alteração de segurança, alteração operacional ou mudança de status dentro do Gateway DEVE atualizar este arquivo no mesmo conjunto de mudanças.**

A atualização mínima deve registrar:

1. o que mudou;
2. por que mudou;
3. o que foi validado;
4. o estado real do CI/testes;
5. riscos ou limitações ainda existentes;
6. o próximo passo recomendado.

O workflow próprio do Gateway deve possuir uma trava para impedir alterações em `gateway-umbrella/` sem atualização deste documento.

---

## 1. O que é o Gateway

O produto é um **Gateway industrial/IoT universal**, não um gateway exclusivo para geradores.

Nome de produto/conceito: **RC Universal Gateway**.

Nome/codename atual da pasta e do núcleo em desenvolvimento: **Gateway Umbrella** (`gateway-umbrella/`).

A função do Gateway é ficar entre equipamentos/protocolos de campo e sistemas de supervisão, automação, IoT, análise e aplicações de negócio.

Ele deve receber dados de equipamentos heterogêneos, transportar esses dados com segurança, identificar a origem, interpretar protocolos quando possível, preservar o payload original, normalizar a telemetria, persistir dados quando necessário e distribuí-los para um ou vários consumidores.

**Geradores são apenas um dos casos de uso.** O sistema RC Geradores é um consumidor importante, mas não define nem limita a arquitetura do Gateway.

Exemplos de equipamentos que o Gateway deve poder atender ao longo da evolução:

- controladoras de grupos geradores;
- CLPs/PLCs;
- relés e IEDs;
- medidores de energia;
- inversores;
- UPS/nobreaks;
- sensores e transmissores;
- remotas/RTUs;
- gateways celulares e modems;
- dispositivos CAN/J1939/CANopen;
- equipamentos prediais/BACnet;
- dispositivos IoT e telemetria;
- equipamentos seriais RS-232/422/485;
- qualquer equipamento para o qual exista um transporte e um adapter/protocolo seguro.

---

## 2. Sistemas que o Gateway deve poder alimentar

O Northbound deve ser **multi-consumidor**. O mesmo dado normalizado poderá ser entregue simultaneamente para vários destinos, sem amarrar a aquisição a um SCADA específico.

Consumidores/alvos de integração incluem, entre outros:

- **Rapid SCADA**;
- **FUXA**;
- **ThingsBoard**;
- **Node-RED**;
- **Grafana**, normalmente através de uma fonte de dados apropriada (Prometheus, InfluxDB, Timescale/PostgreSQL ou outra camada de séries temporais), sem criar acoplamento artificial ao frontend Grafana;
- **sistema RC Geradores**;
- outros SCADAs;
- brokers MQTT;
- APIs HTTP/HTTPS;
- bancos de séries temporais;
- plataformas IoT;
- sistemas MES/BMS/EMS;
- integrações customizadas.

### Princípio importante

Rapid SCADA, FUXA, ThingsBoard, Grafana, Node-RED e RC Geradores são **consumidores/plugins de saída**, não o core do Gateway.

O Gateway não pode parar de adquirir dados porque um desses consumidores está indisponível.

---

## 3. Arquitetura conceitual

```text
EQUIPAMENTOS / CAMPO / INTERNET / VPN / SERIAL / CAN / IoT
                         |
                         v
                 TRANSPORT PLANE
 TCP | UDP | TLS/mTLS | HTTP | Serial | CAN | MQTT | WS | outros
                         |
                         v
                 PROTOCOL PLANE
 Modbus | NMEA | OPC UA | SNMP | CoAP | J1939 | adapters/sidecars
                         |
                         v
                 IDENTITY PLANE
 evidence -> enrolled | quarantined | unknown | revoked
                         |
                         v
                 NORMALIZATION
 Record canônico + qualidade + metadata + payload original
                         |
                         v
                DURABILITY / BUS
        spool | replay | filas | backpressure
                         |
                         v
                NORTHBOUND ROUTING
       +-----------------+-----------------+----------------+
       |                 |                 |                |
       v                 v                 v                v
 Rapid SCADA           FUXA          ThingsBoard        Node-RED
       |                                   |
       +-----------------+-----------------+
                         |
                         +--> RC Geradores
                         +--> MQTT/HTTP/API
                         +--> TSDB -> Grafana
                         +--> outros SCADA/IoT/MES/BMS
```

O desenho deve permanecer desacoplado. Adicionar um protocolo de campo não deve exigir modificar a lógica de um consumidor. Adicionar um novo consumidor não deve exigir modificar o transporte de campo.

---

## 4. Planos internos

### 4.1 Transport Plane

Responsável somente por conectividade e entrega de bytes/eventos ao core.

Exemplos: TCP servidor, TCP cliente, UDP, TLS/mTLS, HTTP ingest, serial, SocketCAN, MQTT, WebSocket.

Transporte **não deve inventar telemetria** e não deve assumir que uma leitura TCP corresponde a um frame completo.

### 4.2 Protocol Plane

Responsável por framing, detecção conservadora e interpretação do protocolo.

O sistema preserva bytes desconhecidos como `raw/UNKNOWN`; nunca transforma um payload desconhecido em telemetria falsa.

### 4.3 Identity Plane

Responsável por resolver quem realmente originou o dado.

Estados:

- `enrolled`;
- `quarantined`;
- `unknown`;
- `revoked`.

Evidências fortes previstas/implementadas incluem:

- fingerprint SHA-256 de certificado TLS/mTLS;
- MQTT Client ID;
- IMEI;
- ICCID;
- número de série;
- VPN peer;
- outras identidades específicas do protocolo/dispositivo.

IP, porta, CIDR, Unit ID ou listener isolados **não são identidade forte suficiente**.

Regra essencial: **`porta 15003 = equipamento X` nunca deve, sozinha, autenticar um dispositivo.**

### 4.4 Telemetry/Normalization Plane

Produz o `Record` canônico do Gateway.

O Record deve manter, quando disponível:

- node ID;
- sequence;
- timestamp de recebimento;
- device ID resolvido;
- transport;
- listener/session;
- remote/local address;
- protocolo;
- framing;
- qualidade;
- metadata;
- payload original preservado em Base64 quando aplicável.

### 4.5 Durability Plane

Responsável por não perder telemetria apenas porque o consumidor está fora do ar.

Já existe spool persistente básico. A evolução ainda deve incluir replay com ACK/checkpoint, política de retenção, backpressure e limites claros de disco/memória.

### 4.6 Northbound Plane

Responsável por distribuir Records/telemetria para um ou muitos consumidores.

O core não pode conter regras exclusivas de Rapid SCADA, FUXA, ThingsBoard, Grafana, Node-RED ou RC Geradores. Essas integrações devem entrar como sinks/connectors/adapters claramente isolados.

### 4.7 Command Plane

**Desabilitado nesta fase.**

A configuração rejeita `commandPlaneEnabled=true`.

Nenhum adapter recebe direito de escrita apenas porque está instalado. Futuro comando industrial exigirá projeto separado de autorização, interlocks, identidade forte, auditoria, confirmação, timeout, feedback real e homologação de campo.

---

## 5. Estado atual do desenvolvimento

Repositório: `paulohspdev-cmyk/ProjetoGerador`

Pasta: `gateway-umbrella/`

Branch ativa deste trabalho: `feat/gateway-umbrella-foundation`

Pull Request: **#62** — mantido isolado do runtime de produção enquanto a fundação é construída e validada.

### Último checkpoint de código confirmado antes da criação deste documento

SHA: `489c72e01a4f6a157a8699c01f38908f45c1e6c0`

Em 2026-09-03, para esse SHA:

- workflow **Gateway Umbrella**: `success`;
- workflow **CI** do repositório: `success`;
- workflow **Quality and Security**: `success`.

No workflow próprio do Gateway passaram:

- `gofmt`;
- `go vet`;
- testes unitários;
- race detector do core;
- build do core;
- download/verificação das dependências dos adapters;
- testes dos adapters;
- build de todos os adapters.

**Não considerar um commit posterior validado apenas porque aparece neste documento. Sempre conferir o CI do HEAD atual.**

---

## 6. O que já existe no código

### Core/runtime

- Go 1.27.1 no CI;
- event bus;
- session registry;
- `Record` normalizado;
- métricas;
- health/readiness/status/sessions;
- spool persistente JSONL;
- northbound HTTP JSON;
- supervisor de sidecars;
- config schema v2;
- Command Plane bloqueado.

### Transportes core

- TCP server/reverse;
- TCP client direto;
- UDP server;
- TLS 1.3/mTLS server;
- TLS client;
- HTTP ingest.

### Protocol/framing core

- Modbus TCP;
- Modbus RTU com CRC16;
- reassembly de stream TCP para Modbus;
- detecção NMEA 0183;
- detecção JSON/raw conservadora.

### Adapters existentes na branch

- serial;
- MQTT;
- MQTT v5;
- SocketCAN/J1939 clássico;
- OPC UA;
- SNMP;
- CoAP;
- WebSocket/WSS.

A presença de um adapter no repositório **não significa automaticamente `production`**. O lifecycle deve continuar explícito:

`experimental -> lab_validated -> field_validated -> production`

### Identidade/enrollment

Já existe registry de identidade com matching por evidências e estados `enrolled/quarantined/unknown/revoked`.

O TLS server já coleta dados do certificado peer e a integração mais recente adicionou fingerprint SHA-256 como evidência forte.

Weak evidence continua em quarentena.

---

## 7. Caso de campo atualmente usado como referência

O projeto de geradores continua sendo um consumidor/caso de validação importante, mas **não deve contaminar a arquitetura universal**.

Exemplo conhecido: `GEN163`, DSE4520, `10.60.20.222:502`, Modbus TCP, Unit ID 1.

Já foi comprovado no sistema legado/projeto que TCP 502 e leitura Modbus respondem. Porém IP + Unit ID + protocolo não constituem identidade forte suficiente para o novo Gateway Universal.

Por isso, no exemplo de inventário do Gateway, esse tipo de origem deve permanecer `quarantined` até existir evidência forte/enrollment adequado.

Nunca promover equipamento para `enrolled` apenas para fazer uma tela ficar online.

---

## 8. Northbound universal — direção obrigatória

A próxima arquitetura de saída deve permitir **fan-out**: um único Record pode alimentar zero, um ou vários consumidores.

Interfaces de destino que devem ser consideradas:

- HTTP/HTTPS JSON;
- MQTT publish;
- WebSocket;
- OPC UA server/exposure;
- Modbus TCP server/virtual mapping quando fizer sentido;
- Prometheus/OpenMetrics para métricas e, quando apropriado, séries tratadas;
- bancos/TSDB por adapters;
- integração específica Rapid SCADA;
- integração específica FUXA;
- integração ThingsBoard;
- integração Node-RED;
- integração RC Geradores.

### Grafana

Grafana deve ser tratado corretamente como camada de visualização/consulta. O Gateway deve normalmente alimentar uma fonte de dados apropriada (por exemplo Prometheus, InfluxDB, Timescale/PostgreSQL ou outra TSDB), e o Grafana consulta essa fonte. Não criar dependência do core com uma UI Grafana específica.

### Rapid SCADA

Rapid SCADA deixa de ser o destino obrigatório do core. Deve ser **um adapter/consumer northbound**. O Gateway deve poder continuar operando e persistindo dados quando o Rapid estiver parado.

### RC Geradores

O sistema de geradores deve consumir dados do Gateway por contrato estável, sem possuir lógica de transporte industrial dentro do frontend e sem exigir que o Gateway seja exclusivo para geradores.

---

## 9. Princípios que não podem ser quebrados

1. **Universalidade:** nenhum domínio de negócio, marca de controladora ou SCADA específico manda no core.
2. **Fail closed:** dúvida de identidade, segurança ou framing não vira confiança automática.
3. **Read-only por padrão:** aquisição primeiro; comando é outro plano e continua bloqueado.
4. **Sem telemetria falsa:** valores ausentes/indefinidos permanecem ausentes/indefinidos.
5. **Payload preservado:** quando possível, manter a evidência original para auditoria/reprocessamento.
6. **Desacoplamento:** field adapters e northbound adapters evoluem independentemente.
7. **Offline tolerant:** indisponibilidade de consumidor não pode derrubar aquisição.
8. **Observabilidade:** health, readiness, sessões, erros, filas e perdas precisam ser mensuráveis.
9. **Backpressure explícito:** nunca esconder descarte por fila cheia.
10. **Lifecycle real:** `production` somente após evidência de laboratório/campo correspondente.
11. **Sem bypass de segurança:** não liberar escrita industrial direta para “testar”.
12. **Documentação sincronizada:** toda alteração atualiza este arquivo.

---

## 10. Como qualquer novo chat/agente deve continuar

Ao retomar o trabalho:

1. **Leia este arquivo inteiro.**
2. Leia `gateway-umbrella/README.md`.
3. Leia `gateway-umbrella/docs/ARCHITECTURE.md` e `PRODUCTION_MATRIX.md`.
4. Verifique o HEAD real da branch/PR; não confie em SHA antigo descrito aqui.
5. Verifique os workflows do HEAD atual antes de dizer que algo está verde.
6. Não modificar produção/VM existente para validar uma feature ainda experimental do Umbrella.
7. Fazer mudanças pequenas e isoladas.
8. Rodar/confirmar `gofmt`, `go vet`, testes, race detector e build aplicáveis.
9. Não promover lifecycle sem evidência correspondente.
10. **Atualizar este arquivo no mesmo conjunto de mudanças.**
11. Registrar abaixo a mudança e o próximo passo.

### Comandos locais de referência

```bash
cd gateway-umbrella

gofmt -w .
go vet ./...
go test ./... -count=1
go test -race ./... -count=1
go build ./cmd/rc-gateway

cd adapters
gofmt -w .
go vet ./...
go test ./... -count=1
go build ./...
```

O CI do GitHub continua sendo a fonte final de verdade para o branch/PR.

---

## 11. Prioridades técnicas a partir deste ponto

Ordem recomendada, sempre mantendo o CI verde entre blocos:

1. consolidar esta documentação canônica e a trava automática de atualização;
2. remover workflows temporários de manutenção/autoformat;
3. fechar backpressure no event bus e nos sinks;
4. evoluir spool para replay com ACK/checkpoint e retenção;
5. endurecer supervisor de adapters/sidecars com exponential backoff, jitter e circuit-breaker onde fizer sentido;
6. consolidar roteamento northbound multi-sink/fan-out;
7. criar contratos northbound universais;
8. implementar primeiro conjunto de consumidores: RC Geradores + HTTP/MQTT genéricos;
9. integrar Rapid SCADA como consumer isolado;
10. preparar integração FUXA, ThingsBoard e Node-RED sem acoplamento ao core;
11. definir pipeline TSDB/Prometheus para uso com Grafana;
12. continuar CAN-FD/CANopen e protocolos industriais adicionais;
13. IEC-60870-5-101/104, BACnet e DNP3 preferencialmente por stacks/sidecars maduros antes de qualquer implementação própria extensa;
14. ampliar HIL, fault injection, soak tests e testes de reconexão/perda de consumidor;
15. somente muito depois projetar Command Plane, separado e homologado.

---

## 12. O que NÃO fazer na retomada

- não transformar o Gateway em componente exclusivo de RC Geradores;
- não fazer Rapid SCADA virar dependência obrigatória do core;
- não duplicar lógica de protocolo em cada consumidor;
- não assumir que TCP preserva frames;
- não usar IP/porta como identidade definitiva;
- não marcar adapter experimental como production para “liberar uso”;
- não habilitar escrita industrial para validar conectividade;
- não remover spool/qualidade/metadata para simplificar integração;
- não esconder perdas de fila;
- não afirmar CI verde sem consultar o HEAD atual;
- não modificar `gateway-umbrella/` sem atualizar este documento.

---

## 13. Registro de mudanças / handoff

### 2026-09-03 — Documento canônico e escopo universal

**Mudança:** criado este documento para continuidade obrigatória do projeto. O escopo foi formalizado como **Gateway industrial/IoT universal**, não exclusivo de geradores.

**Decisão:** Rapid SCADA, FUXA, ThingsBoard, Node-RED, Grafana/TSDB, RC Geradores e demais sistemas são consumidores Northbound independentes.

**Estado validado antes desta mudança:** SHA `489c72e01a4f6a157a8699c01f38908f45c1e6c0` com Gateway Umbrella + CI + Quality/Security verdes.

**Limitação atual:** o Northbound implementado no core ainda é principalmente HTTP JSON; os contratos multi-sink e integrações específicas universais ainda precisam ser consolidados.

**Próximo passo:** instalar a trava de CI que exige atualização deste documento e remover o workflow temporário de autoformat. Depois seguir para backpressure/spool replay e roteamento northbound universal.
