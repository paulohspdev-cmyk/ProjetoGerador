# RC Universal Gateway — estado do projeto e handoff obrigatório

> **LEIA ESTE ARQUIVO PRIMEIRO antes de modificar `gateway-umbrella/`.** Toda alteração no Gateway deve atualizar este arquivo no mesmo ciclo.

## Decisão fixa

```text
BRIDGE FIRST
PROTOCOL OPTIONAL
NO DEVICE MEMORY DATABASE
NO TELEMETRY HISTORIAN
```

O Gateway é ponte universal de conectividade. Rapid SCADA, FUXA, ThingsBoard, software do fabricante ou outro driver interpreta registradores/protocolos de aplicação.

## Arquitetura

```text
FIELD ENDPOINT <====== raw duplex ======> CONSUMER ENDPOINT
```

Um túnel raw possui um consumidor ativo por vez. Não fazer fan-out byte-transparent para múltiplos masters.

## Checkpoints

- `249a7f0d55c840e5e95764468a6400db8a401fea`: limpeza bridge-first, verde.
- `9dc17491e370a59926d9069c898c0e3bba8b8171`: hardening TCP; Gateway CI passou format, vet, testes, race e build.

## Implementado no core

- TCP `listen` e `connect`;
- `listen↔listen` e `connect↔listen` testados com sockets reais;
- bytes byte-for-byte nos dois sentidos;
- pair timeout, write timeout/backpressure, drain timeout/half-close;
- métricas por chunk durante sessão;
- 50 ciclos de reconnect/churn;
- allowlist CIDR, keepalive, NODELAY;
- TLS 1.3 e mTLS como camada de endpoint TCP;
- Unix socket `listen`/`connect` como endpoint stream local;
- Command Plane rejeitado;
- sem banco, polling, mapas de memória ou telemetria semântica.

## Testes adicionados nesta etapa

- TLS 1.3/mTLS com CA, certificado de servidor e certificado cliente reais gerados em teste;
- payload binário preservado dentro do túnel TLS;
- Unix socket duplex preservando bytes;
- TCP half-close real permitindo resposta pendente;
- TCP RST encerrando o par sem travar.

A reprodução local isolada passou `go test -race ./...`. **Consultar o CI do HEAD desta etapa antes de declarar este checkpoint verde.**

## Próximos passos

1. confirmar CI TLS/mTLS + Unix + RST/half-close;
2. implementar Serial RS232/422/485 como endpoint duplex;
3. implementar UDP como bridge orientada a datagramas/sessão;
4. implementar WebSocket/WSS com contrato explícito de framing;
5. adicionar suíte de carga/leak/concurrency;
6. adicionar impairment/soak automatizado;
7. classificar SocketCAN e MQTT como transports message-oriented, sem mapas de equipamento;
8. fechar instalação, config validation e rollback;
9. somente depois iniciar HIL/soak físico.

## Regra de produção

Software field-test-ready = todos os gates automatizáveis verdes. Produção validada = somente após HIL/soak físico. Invariável: nenhum payload pode ser alterado silenciosamente e nenhum recurso pode crescer sem limite.
