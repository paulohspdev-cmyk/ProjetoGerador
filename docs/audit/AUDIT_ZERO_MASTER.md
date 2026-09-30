# Auditoria Zero — master

Data de início: 2026-09-29  
Baseline de referência: `903716ec7463bee84a54856cdd27b94e78531fe4`  
Produção observada em 2026-09-29: delta idêntico ao head `20a68c2d0e146addcca708290a1564c63ffa305e` do PR #86.

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

## Achados iniciais confirmados

### A0-001 — a baseline e a produção possuem executores DSE diferentes

Na baseline `main`, `backend/app/dse_control.py` é um executor limitado e `control.py` não o usa como executor homologado de produção.

Na VM, os mesmos arquivos correspondem ao PR #86: o executor DSE suporta START, STOP/OFF, AUTO, MANUAL e TEST para um pack específico DSE4520 MKII 4.8.

Impacto: qualquer diagnóstico feito apenas contra `main` poderia concluir errado sobre o comportamento real da VM.

### A0-002 — mensagem do card não possui expiração

`PowerFlowCard.tsx` mantém `commandMessage` em estado local e não possui timer de expiração, tanto na baseline quanto no conteúdo do PR #86 implantado.

Impacto: mensagem informativa pode ficar indefinidamente no card. Requisito: feedback informativo ~2 s; falhas/alarmes persistem em superfícies próprias.

### A0-003 — drift de produção confirmado

O PR #86 está aberto e não integrado à `main`. Foram comparados os **22 arquivos** que diferem entre `903716e` e o head `20a68c2`; os 22 são idênticos aos arquivos correspondentes em `/opt/rc-geradores`.

A instalação não contém `.git`, portanto não há SHA local via `git rev-parse`. A equivalência foi estabelecida por conteúdo do delta completo do PR.

Impacto: produção está à frente da `main` com código não integrado. Este é um problema de release/governança, não apenas um bug de UI.

### A0-004 — leitura de modo não implica permissão de escrita

A baseline tem packs DSE de produção read-only, embora leia `controller_mode_raw`. No conteúdo implantado do PR #86 existe um pack específico DSE4520 MKII 4.8 que habilita alguns comandos.

Regra: nunca promover OFF/MAN/AUTO/TEST por inferência a partir da leitura. Cada modelo/firmware precisa de evidência, mecanismo, permissivos e feedback próprios.

### A0-005 — cor verde usada como sinônimo de valor presente no Compacto

`CompactCard.tsx` aplica `text-online` a valor elétrico do gerador quando o valor apenas existe (`row.generator !== "—"`).

Presença de número não é prova de estado saudável. Deve ser neutro ou derivado de contrato/limite homologado.

### A0-006 — risco de regressão cruzada no board

`GeneratorsBoard.tsx` contém simultaneamente algoritmos de layout Vertical e Compacto.

Deve ser decomposto em layouts independentes, sem mudança visual, antes de novas evoluções relevantes.

### A0-007 — CSS Vertical monolítico

`vertical-reference-card.css` concentra mais de mil linhas e múltiplas seções visuais.

A divisão deve ser estrutural, com regressão visual antes/depois, em PR próprio.

### A0-008 — auditoria funcional existente não prova campo

`docs/FUNCTIONAL_AUDIT_2026-09-29.md` declara explicitamente que não envia comandos reais a equipamentos.

Portanto ela é útil para software, mas não fecha homologação industrial.

### A0-009 — PR #86 mistura domínios demais

O PR #86 possui 41 commits e 22 arquivos alterados, atravessando DSE, IG4/bridge, Controller Packs, topologia/telemetria, card Vertical/detalhe e API.

Impacto: um defeito posterior não possui isolamento causal. A partir da Auditoria Zero, mudanças desse tipo devem ser divididas por domínio.

### A0-010 — "accepted" ainda precisa ser separado de "confirmed"

Na produção, o executor DSE já aguarda feedback. Porém START com temporização interna ativa pode ser marcado `accepted=true` enquanto `running_confirmed=false`. O wrapper de controle traduz qualquer `accepted` para estado `controller_accepted`.

O contrato definitivo precisa modelar estados distintos: `submitted/accepted/pending/confirmed/failed`, sem mostrar sucesso físico antes do feedback.

## Trilhas da auditoria

- AZ-01 Inventário e drift de produção — **em andamento; drift confirmado**
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

Cada trilha precisa de inventário, comportamento esperado, evidência atual, gaps, testes, correções separadas, resultado e riscos residuais. A Auditoria Zero termina somente quando `PROJECT_STATE.md` aponta uma baseline candidata de produção e a matriz de regressão está coberta.
