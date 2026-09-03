# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.**
>
> Este é o documento canônico de continuidade. Qualquer novo chat, agente, desenvolvedor ou operador deve começar por ele.

## Regra obrigatória de manutenção

Toda modificação, correção, melhoria, remoção, mudança arquitetural, dependência, protocolo, transporte, destino, segurança, operação ou lifecycle do Gateway **DEVE atualizar este arquivo**.

O workflow `.github/workflows/gateway-umbrella.yml` executa `gateway-umbrella/scripts/check-project-state-updated.sh` para impedir que o projeto avance com handoff desatualizado.

---

# 1. Decisão arquitetural vigente

O produto é um **Gateway industrial/IoT universal de conectividade e ponte**.

Nome: **RC Universal Gateway**.

Codename/pasta atual: `gateway-umbrella/`.

A decisão oficial é:

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O Gateway existe primeiro para:

1. receber uma conexão de campo;
2. manter essa conexão viva;
3. identificar e proteger a sessão;
4. rotear a sessão para o destino correto;
5. encaminhar bytes nos dois sentidos com integridade;
6. reconectar e diagnosticar problemas de comunicação.

Ele **não deve precisar entender a semântica do equipamento** para funcionar como ponte.

---

# 2. O que o Gateway NÃO é

O Gateway não é:

- Rapid SCADA;
- FUXA;
- ThingsBoard;
- historiador;
- banco de telemetria;
- engine de alarmes;
- engine de dashboards;
- banco universal de drivers;
- banco de memória Modbus;
- catálogo de todos os modelos ComAp/DSE/PLC/IHM;
- sistema RC Geradores.

Esses sistemas podem ser **destinos/consumidores** da conexão.

---

# 3. Problema que o Gateway resolve

Exemplo principal do projeto:

```text
Controladora
   |
RS232 / RS485 / Ethernet
   |
PUSR / Teltonika / Robustel / outro modem
   |
TCP Client / VPN / Internet
   |
IP público
   |
MikroTik / NAT
   |
RC Universal Gateway
   |
Rapid SCADA
```

O modem aponta para IP/porta do site. A MikroTik entrega essa porta ao Gateway. O Gateway mantém a sessão e apresenta a comunicação ao Rapid SCADA.

O Rapid envia a requisição ao equipamento através da ponte. A resposta retorna pelo mesmo caminho.

O Gateway não precisa saber que um endereço significa RPM, combustível, tensão ou pressão.

---

# 4. Universalidade real

A principal condição de sucesso é:

> Se surgir amanhã um equipamento cujo protocolo o Gateway nunca viu, mas existe um software/SCADA que entende esse equipamento, o Gateway deve conseguir transportar a conexão sem receber um novo mapa de memória.

Exemplos de destinos possíveis:

- Rapid SCADA;
- FUXA;
- ThingsBoard;
- Node-RED;
- software do fabricante;
- outro SCADA;
- broker MQTT;
- aplicação TCP/UDP;
- integração customizada;
- sistema RC Geradores através da arquitetura apropriada.

Geradores são apenas um caso de uso.

---

# 5. Responsabilidades do core

## Transport Plane

- TCP server / reverse TCP;
- TCP client;
- UDP;
- TLS/mTLS;
- serial RS-232/422/485;
- WebSocket/WSS;
- MQTT quando usado como transporte/bridge;
- SocketCAN/CAN quando usado como transporte;
- adapters futuros.

## Session Plane

- connect/disconnect;
- timeout;
- reconnect;
- sessão ativa;
- ownership;
- origem/destino;
- limites e proteção.

## Routing Plane

É o coração do produto.

Exemplo:

```text
listener 0.0.0.0:15020
    -> session PUSR-X
    -> route equipment-link-X
    -> destination Rapid local endpoint
```

ou:

```text
direct/VPN 10.60.20.222:502
    -> gateway virtual endpoint
    -> Rapid/FUXA/outro destino
```

## Identity/Security Plane

Pode usar:

- mTLS/fingerprint;
- IMEI/ICCID quando o modem fornece;
- MQTT Client ID;
- VPN peer;
- registration packet/heartbeat;
- IP/CIDR como evidência auxiliar;
- identificadores específicos do transporte.

Estados atuais possíveis:

- `enrolled`;
- `quarantined`;
- `unknown`;
- `revoked`.

IP/porta sozinhos não são identidade forte.

## Framing Plane

Somente quando necessário para transportar corretamente:

- reconstrução de stream TCP;
- MBAP Modbus TCP;
- CRC16 Modbus RTU;
- Unit ID para multiplexação;
- delimitadores;
- registration/heartbeat de modem.

**Framing não significa mapa de memória.**

## Operations Plane

Somente saúde do Gateway:

- health/readiness;
- sessões;
- RX/TX;
- reconnects;
- timeouts;
- latência;
- framing/CRC errors;
- buffers;
- logs/métricas.

---

# 6. O que fica fora do core

Não manter no Gateway:

```text
DSE4520 register X = RPM
ComAp IG200 register Y = battery
PLC Siemens DBx.DBy = pressure
```

Também ficam fora:

- SQLite/TSDB de telemetria;
- spool persistente de dados de processo;
- polling semântico de registradores;
- conversão de registrador -> ponto SCADA;
- historian;
- alarm engine;
- controller packs específicos de fabricantes;
- dashboards.

Mapas ComAp/DSE continuam onde fazem sentido hoje: controller packs/driver/Rapid/backend do sistema de geradores, e não no núcleo universal.

---

# 7. Referência ThingsBoard estudada

Foi revisado o projeto público `thingsboard/thingsboard-gateway` em 2026-09-03.

O ThingsBoard IoT Gateway é uma boa referência para:

- connectors modulares;
- custom connectors;
- reconnect;
- lifecycle;
- configuração;
- métricas;
- isolamento de integrações.

Mas o ThingsBoard Gateway também usa **converters**, polling/leitura de protocolos e **storage** para transformar dados no modelo ThingsBoard.

Essa parte **não deve ser copiada para o core do RC Universal Gateway**.

Documento específico:

- [`THINGSBOARD_REFERENCE.md`](./THINGSBOARD_REFERENCE.md)

---

# 8. Estado atual do código

Repositório: `paulohspdev-cmyk/ProjetoGerador`

Branch: `feat/gateway-umbrella-foundation`

PR: **#62** — Draft.

Antes da redefinição bridge-first, foram implementados e validados vários componentes de transporte e também alguns adapters de aquisição semântica.

## Componentes úteis para o bridge que já existem

- TCP server/reverse TCP;
- TCP client;
- UDP;
- TLS 1.3/mTLS;
- HTTP ingest;
- sessões/event bus;
- reassembly de Modbus TCP;
- CRC/framing Modbus RTU;
- serial adapter;
- MQTT/MQTT v5 adapters;
- WebSocket/WSS adapter;
- SocketCAN/J1939 experimental;
- identity/enrollment;
- health/readiness/status/metrics;
- supervisor de adapters;
- Command Plane bloqueado.

## Componentes que precisam ser revistos após a decisão bridge-first

Existem experimentos de:

- OPC UA client/read;
- SNMP read;
- CoAP GET/read;
- normalização de telemetria;
- spool persistente JSONL;
- northbound orientado a Records;
- outros elementos criados quando o Gateway estava sendo tratado também como motor de dados.

Eles **não devem ser considerados parte definitiva do core**.

Próxima revisão de código deve classificar cada item como:

1. `bridge-core` — permanece;
2. `framing-helper` — permanece se necessário;
3. `semantic-reader` — mover para plugin opcional externo ou remover;
4. `telemetry-persistence` — remover do core;
5. `operations` — permanece somente para saúde do Gateway.

---

# 9. Último checkpoint validado antes desta redefinição

SHA validado anteriormente:

`2750833dd24e2b4c11517a0182ea055c20c980f6`

Nesse SHA estavam verdes:

- Gateway Umbrella workflow;
- Core Go;
- Industrial adapters;
- `gofmt`;
- `go vet`;
- testes;
- race detector;
- build;
- CI geral;
- Quality and Security.

Depois desse checkpoint foram alterados apenas documentos de arquitetura/escopo para consolidar a decisão bridge-first e criada a referência ThingsBoard.

**Não afirmar que o HEAD posterior está verde sem verificar os workflows atuais.**

---

# 10. Próximo passo técnico obrigatório

Antes de adicionar novos protocolos, limpar o runtime para combinar com a decisão vigente.

Ordem recomendada:

1. inventariar todos os arquivos/componentes atuais;
2. remover/desabilitar spool persistente de telemetria do caminho padrão;
3. remover normalização semântica do core;
4. tirar polling/readers OPC UA/SNMP/CoAP do core principal;
5. manter adapters apenas como bridge/transport quando fizer sentido;
6. criar `Route`/`Target` como abstração central;
7. implementar virtual endpoints para Rapid/FUXA/outros destinos;
8. garantir raw transparent forwarding;
9. garantir RTU-over-TCP e Modbus TCP bridge sem mapas de memória;
10. validar múltiplos equipamentos/Units por sessão;
11. testar PUSR real -> MikroTik -> Gateway -> Rapid;
12. soak/reconnect/impairment;
13. somente depois promover lifecycle.

---

# 11. Fluxos que precisam ser suportados

## Modem reverse TCP

```text
controladora -> modem TCP Client -> internet -> MikroTik -> Gateway -> Rapid
```

## Equipamento direto por VPN/IP

```text
Rapid -> Gateway virtual endpoint -> VPN/LAN -> controladora
```

## RTU serial transparente

```text
RS485 -> modem/DTU -> TCP transparente -> Gateway -> sistema de destino
```

## Vários Units em um único barramento

```text
RS485 bus
  Unit 1
  Unit 2
  Unit 3
     |
   modem
     |
 Gateway
     |
 sistema de destino
```

Sem exigir mapa de memória dos Units no Gateway.

## Protocolo proprietário desconhecido

```text
equipamento -> modem -> Gateway -> software do fabricante
```

O Gateway transporta mesmo sem entender o payload.

---

# 12. Regra para banco/persistência

O produto **não terá banco de dados de telemetria**.

Buffers de sessão podem existir para framing/backpressure, mas devem ser limitados e operacionais.

Histórico pertence ao sistema de destino.

Se no futuro for necessário store-and-forward para um transporte específico, isso deverá ser um recurso opcional e explicitamente separado de qualquer banco/historiador de processo — nunca requisito do core bridge.

---

# 13. Segurança

Command Plane continua bloqueado nesta fase.

Uma bridge industrial é naturalmente bidirecional, mas isso não significa liberar qualquer origem para escrever no equipamento.

Políticas futuras devem controlar:

- quais destinos podem iniciar tráfego;
- quais rotas são read-only quando tecnicamente possível;
- ACL por sessão;
- mTLS/VPN/identity;
- audit logs operacionais;
- rate limits;
- proteção contra conexão desconhecida.

Nunca criar comandos específicos de gerador dentro do Gateway universal.

---

# 14. Como qualquer novo chat/agente deve continuar

1. Leia este arquivo inteiro.
2. Leia `README.md`.
3. Leia `ARCHITECTURE.md`.
4. Leia `THINGSBOARD_REFERENCE.md`.
5. Leia `PRODUCTION_MATRIX.md`.
6. Verifique o HEAD real da branch/PR.
7. Verifique CI do HEAD antes de afirmar que está verde.
8. Não adicionar mapa de memória de fabricante ao Gateway.
9. Não adicionar banco/historiador de telemetria ao core.
10. Priorizar `Route`, `Session`, `Transport`, `Target` e segurança.
11. Toda alteração deve atualizar este arquivo.

---

# 15. Registro desta mudança

Data: 2026-09-03.

Mudança:

- escopo redefinido formalmente para **bridge-first**;
- removida da arquitetura a obrigação de normalizar/interpretar telemetria;
- estabelecido que o Gateway não terá banco de mapas de memória;
- estabelecido que o Gateway não terá banco/historiador de telemetria;
- ThingsBoard IoT Gateway revisado como referência modular;
- criado `THINGSBOARD_REFERENCE.md`;
- README, arquitetura e matriz de produção alinhados à nova decisão.

Motivo:

Evitar transformar o Gateway em um segundo SCADA/driver universal impossível de manter e preservar a universalidade: qualquer equipamento deve poder usar a ponte se o sistema de destino souber falar com ele.

Validação:

Mudança atual é documental/arquitetural. O último checkpoint de código totalmente verde continua sendo o SHA `2750833dd24e2b4c11517a0182ea055c20c980f6`. Conferir o CI do HEAD atual antes de qualquer afirmação adicional.

Próximo passo:

**Auditar e simplificar o código atual para remover do caminho principal tudo que viola bridge-first, mantendo apenas transporte, sessão, identidade, framing mínimo, roteamento, targets e observabilidade operacional.**
