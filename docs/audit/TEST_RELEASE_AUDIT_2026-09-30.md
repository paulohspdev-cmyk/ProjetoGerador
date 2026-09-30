# Auditoria AZ-15 — testes, CI e release gates

Data: 2026-09-30

## Cobertura existente que deve ser preservada

O repositório já possui três workflows independentes:

- CI;
- E2E;
- Quality and Security.

O backend possui regressões relevantes para:

- binding/identidade de dispositivo;
- fail-closed de comando;
- homologação;
- Rapid overlay/stale;
- backup/restore/retention;
- hardening de produção;
- topologia;
- domínio v3;
- provisionamento e timeout;
- sessão/inventário.

O E2E cobre:

- autenticação e 2FA de interface;
- rotas;
- CRUD;
- detalhe/trends;
- responsividade;
- referência do card Vertical.

O PR #87 adicionou gate de fronteira que rejeita PRs misturando domínios funcionais.

## Limite fundamental

A suíte automatizada não executa comandos em equipamento industrial real — e não deve executar.

Portanto existem duas provas distintas:

1. **regressão de software**: CI/E2E/fixtures;
2. **homologação de campo**: evidência controlada por modelo/firmware/ação.

Uma não substitui a outra.

## Gaps obrigatórios descobertos pela Auditoria Zero

### T15-001 — pack x binding

Falta um checker read-only que compare, para cada equipamento provisionado:

- pack selecionado;
- canais esperados;
- canais no binding;
- missing/extra;
- identidade Line/Device/Unit.

O caso GEN163 prova que o smoke atual é insuficiente.

### T15-002 — estados de comando

Faltam testes de contrato cobrindo explicitamente:

- submitted;
- accepted;
- pending;
- confirmed;
- failed.

O teste atual de controle consegue aceitar um payload sintético com `accepted=true`, mas não exige que feedback físico satisfaça o contrato de cada pack.

### T15-003 — timeout do pack deve governar executor

Criar regressão que falhe quando:

- pack declara um timeout;
- executor usa número hard-coded diferente.

Aplica-se aos gaps já encontrados em IG200, IG4 e DSE.

### T15-004 — Compacto

Não existe suíte E2E dedicada equivalente à do Vertical para:

- geometria;
- stale;
- N/D;
- alertas;
- cores;
- última página;
- thresholds de layout;
- overflow.

### T15-005 — mensagem temporária

Falta teste com relógio controlado provando:

- mensagem informativa aparece;
- permanece tempo suficiente para leitura;
- desaparece em aproximadamente 2 s;
- evento/audit correspondente continua persistido.

### T15-006 — filtro x display status

Falta teste que construa:

- `status=online`;
- `telemetryStale=true`;

e prove que o card não permanece classificado no filtro ONLINE se a semântica visível é stale/sem comunicação.

### T15-007 — estabilidade geométrica do Vertical

Falta regressão que prove que:

- filtrar cards;
- ir para a última página;
- reduzir quantidade de itens;

não altera a geometria padrão do Vertical na mesma viewport.

### T15-008 — semântica de cores

Faltam testes unitários/visuais garantindo:

- valor existente não vira verde automaticamente;
- alerta conectado não recebe glow de saúde positiva;
- breaker aberto não significa alerta por padrão;
- modo operacional não reutiliza severidade sem contrato;
- gauge sem thresholds homologados não simula faixas de severidade.

### T15-009 — backup operacional

Além dos testes de biblioteca, falta gate/monitor operacional que detecte:

- ausência de job periódico esperado;
- último backup full acima da idade máxima;
- falha repetida de backup.

CI não consegue provar que o scheduler da VM está configurado.

### T15-010 — bridge restart classification

Já existe lógica que preserva bridge em release sem mudança de comunicação. Falta teste dedicado que prove os dois lados:

- UI-only => não reinicia;
- arquivo real de runtime da bridge => reinicia.

### T15-011 — hardening de produção

Testes já cobrem vários requisitos, mas configuração efetiva da VM precisa de smoke separado e sanitizado, sem publicar valores sensíveis.

## Gate de release proposto

Uma release candidata só pode avançar quando:

1. fronteira de domínio válida;
2. unit/regression do domínio passa;
3. `npm check`/backend suites passam;
4. E2E aplicável passa;
5. Quality/Security passa;
6. pack x binding passa para runtime industrial afetado;
7. migração/DB health passa quando aplicável;
8. backup/rollback preflight passa quando aplicável;
9. SHA de release é explícito;
10. homologação de campo é exigida somente quando a mudança altera comportamento industrial.

## Definition of Done após Auditoria Zero

Um bug não está fechado porque “a tela parece certa”.

Precisa existir:

- reprodução;
- teste que falhava;
- correção no domínio certo;
- teste verde;
- CI geral verde;
- evidência aplicável;
- rollback;
- atualização do estado canônico.

## Fechamento AZ-15

A auditoria da cobertura atual e dos gaps está concluída. Os novos testes devem ser adicionados junto dos PRs de correção correspondentes, não em uma mega-alteração única.
