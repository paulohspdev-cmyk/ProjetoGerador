# Auditoria Zero — master

Data de início: 2026-09-29  
Baseline: `903716ec7463bee84a54856cdd27b94e78531fe4`

## Propósito

Auditar o sistema inteiro a partir da realidade observável e criar uma base que possa evoluir sem regressões cruzadas. Esta auditoria não considera "CI verde" como prova suficiente de comportamento de produção.

## Escopo

- frontend e todas as visualizações;
- semântica de estado/cor;
- API e normalização;
- banco/persistência;
- alarmes/eventos/histórico;
- comandos e permissivos;
- Controller Packs e firmware;
- DSE/ComAp;
- Rapid SCADA, templates, channels e bindings;
- bridge e transportes;
- deploy/systemd/rede;
- segurança/RBAC;
- testes e CI;
- observabilidade da VM;
- continuidade para agentes de IA.

## Achados iniciais confirmados no código

### A0-001 — FC16 DSE é tratado cedo demais no executor de ensaio

`backend/app/dse_control.py` envia FC16, espera apenas 0,4 s e lê modo/RPM uma vez. O resultado é montado com `ok=true` e `accepted=true` sem exigir mudança física confirmada.

Impacto: uma escrita protocolar pode ser apresentada como aceita mesmo quando a partida ainda não ocorreu. O contrato novo separa `accepted` de `confirmed`.

### A0-002 — mensagem do card não possui expiração

`PowerFlowCard.tsx` mantém `commandMessage` em estado local, limpa somente ao iniciar outro comando e não possui timer de expiração.

Impacto: mensagem informativa pode ficar indefinidamente no card. Requisito: feedback informativo ~2 s; falhas/alarmes persistem em superfícies próprias.

### A0-003 — possível drift entre produção e a baseline

A baseline atual de `main.py` encaminha comandos somente por `send_homologated_command`. O executor homologado em `control.py` aceita apenas `ig200_privileged` START/STOP. Já `dse_control.py` é código LAB separado.

Se a VM atual mostra uma mensagem de comando DSE que não corresponde a esse caminho, o SHA/configuração da produção precisa ser comparado com a baseline antes de qualquer correção.

### A0-004 — leitura de modo não implica permissão de escrita

Packs DSE de produção encontrados na baseline têm telemetria, inclusive `controller_mode_raw`, mas capabilities de START/STOP/OFF/MAN/AUTO/TEST estão bloqueadas. Isso explica por que ler tudo não habilita automaticamente mudança de modo.

Próximo passo correto: homologar cada escrita por modelo/firmware, não liberar botões por inferência.

### A0-005 — cor verde usada como sinônimo de valor presente no Compacto

`CompactCard.tsx` aplica `text-online` a valor elétrico do gerador quando o valor apenas existe (`row.generator !== "—"`). Presença de número não é prova de estado saudável.

Deve ser substituído por semântica proveniente de estado/limite homologado ou neutra quando não houver contrato.

### A0-006 — risco de regressão cruzada no board

`GeneratorsBoard.tsx` contém simultaneamente algoritmos de layout Vertical e Compacto. Uma alteração no arquivo pode modificar as duas visualizações.

Deve ser decomposto em layouts independentes, sem mudança visual, antes de novas evoluções relevantes.

### A0-007 — CSS Vertical monolítico

`vertical-reference-card.css` concentra mais de mil linhas e múltiplas seções visuais. Isso aumenta a chance de uma alteração localizada mudar outra parte do card.

A divisão deve ser estrutural, com regressão visual antes/depois, em PR próprio.

### A0-008 — auditoria funcional existente não prova campo

`docs/FUNCTIONAL_AUDIT_2026-09-29.md` declara explicitamente que não envia comandos reais a equipamentos. Portanto ela é útil para software, mas não fecha homologação industrial.

## Trilhas da auditoria

- AZ-01 Inventário e drift de produção
- AZ-02 Frontend/Vertical
- AZ-03 Frontend/Compacto
- AZ-04 Frontend/Lista e navegação
- AZ-05 Semântica de estado/cor
- AZ-06 Telemetria/API/Rapid
- AZ-07 Alarmes/eventos e TTL de mensagens
- AZ-08 Comandos/feedback/permissivos
- AZ-09 DSE
- AZ-10 ComAp
- AZ-11 Banco/migrações
- AZ-12 Bridge/transportes
- AZ-13 Deploy/systemd/rede/rollback
- AZ-14 Segurança/RBAC
- AZ-15 Testes/CI/release
- AZ-16 Continuidade/documentação/IA

## Critério de encerramento

Cada trilha precisa de: inventário, comportamento esperado, evidência atual, gaps, testes, correções separadas, resultado e riscos residuais. A Auditoria Zero termina somente quando `PROJECT_STATE.md` aponta uma baseline candidata de produção e a matriz de regressão está coberta.
