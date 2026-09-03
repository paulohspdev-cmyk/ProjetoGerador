# Transport / Endpoint Plugin Contract — direção bridge-first

> Leia primeiro [`PROJECT_STATE.md`](./PROJECT_STATE.md).

A arquitetura atual não usa plugins para converter telemetria. Plugins futuros existem para **oferecer endpoints de comunicação ao core raw bridge**.

## Regra

Um plugin de transporte deve responder à pergunta:

> "Como eu obtenho/entrego bytes ou datagramas por este meio físico/protocolo de transporte?"

Ele não deve responder:

> "Qual registrador significa RPM, pressão ou alarme?"

## Responsabilidades permitidas

- abrir RS232/422/485;
- abrir SocketCAN;
- estabelecer TLS/mTLS;
- encapsular/desencapsular WebSocket;
- manter conexão MQTT quando MQTT for o próprio meio de transporte contratado;
- converter framing necessário para transportar corretamente;
- reconnect e lifecycle do endpoint;
- expor erros/estado operacional.

## Responsabilidades fora do core/plugin de transporte

- mapas de memória por fabricante;
- polling semântico de registradores;
- converter valores para telemetria de domínio;
- historian/storage de processo;
- engine de alarmes;
- comandos industriais genéricos.

## Estado dos adapters antigos

Os executáveis em `gateway-umbrella/adapters/` foram criados antes da decisão bridge-first e permanecem apenas como **experimentos de bibliotecas/conectividade**. Eles não são iniciados pelo runtime schema 3.

Antes de reutilizar um adapter antigo, ele deve ser classificado:

1. se puder virar endpoint raw/transport, refatorar;
2. se apenas lê/converte dados semanticamente, mover para projeto/plugin externo ou remover;
3. nunca ligar automaticamente ao core só porque compila.

## Contrato alvo

A interface final de plugins ainda será definida, mas deve representar operações equivalentes a:

```text
Acquire/Open endpoint
Read bytes/datagram
Write bytes/datagram
Close
Reconnect/lifecycle
Operational status
```

O core deve conseguir parear esse endpoint com outro endpoint e transportar os bytes bidirecionalmente.

Lifecycle continua explícito:

```text
experimental -> lab_validated -> field_validated -> production
```

Command Plane permanece fora desse contrato.
