# Auditoria Zero — master

Data de início: 2026-09-29  
Baseline de referência: `903716ec7463bee84a54856cdd27b94e78531fe4`  
Produção observada: `deployed-commit=20a68c2d0e146addcca708290a1564c63ffa305e` (head do PR #86).

## Propósito

Auditar o sistema inteiro a partir da realidade observável e criar uma base que possa evoluir sem regressões cruzadas. "CI verde" não é prova suficiente de comportamento de produção.

## Escopo

Frontend, semântica de estado/cor, API, banco, alarmes/eventos, comandos/permissivos, Controller Packs/firmware, DSE/ComAp, Rapid SCADA/bindings, bridge/transportes, deploy/systemd/rede, segurança/RBAC, testes/CI, observabilidade e continuidade de IA.

## Achados confirmados

### A0-001 — baseline e produção têm comportamentos industriais diferentes
A `main` baseline não contém o caminho DSE de produção que está implantado. A VM usa o head do PR #86.

### A0-002 — mensagem do card não possui expiração
`PowerFlowCard.tsx` mantém `commandMessage` sem TTL. Requisito: mensagens informativas ~2 s; falhas reais continuam no histórico/auditoria.

### A0-003 — drift de produção confirmado
O marcador `/var/lib/rc-geradores/deployed-commit` contém `20a68c2...`. Os 22 arquivos alterados por esse head em relação à baseline são idênticos à VM.

### A0-004 — leitura de modo não implica permissão de escrita
Cada modelo/firmware precisa homologar OFF/MAN/AUTO/TEST separadamente. GEN205/206 exemplificam telemetria ativa com pack read-only.

### A0-005 — cor verde usada como sinônimo de valor presente
`CompactCard.tsx` usa `text-online` quando um valor elétrico existe. Presença de número não comprova saúde.

### A0-006 — risco de regressão cruzada no board
`GeneratorsBoard.tsx` contém algoritmos de layout Vertical e Compacto no mesmo arquivo.

### A0-007 — CSS Vertical monolítico
`vertical-reference-card.css` concentra múltiplas seções e deve ser decomposto sem mudança visual, com regressão.

### A0-008 — auditoria funcional existente não prova campo
A auditoria existente não envia comandos reais; ela não fecha homologação industrial.

### A0-009 — PR #86 mistura domínios demais
41 commits/22 arquivos atravessam DSE, IG4/bridge, packs, telemetria/topologia, frontend e API. Esse formato deixa de ser aceito.

### A0-010 — `accepted` precisa ser separado de `confirmed`
START pendente pode ficar `accepted=true` com `running_confirmed=false`. A UI não deve traduzir isso em sucesso físico.

### A0-011 — marcador de release existe, mas o diagnóstico não o usa
O deploy grava `deployed-commit`, porém `diagnostics.version_info()` usa `git rev-parse`. Como a release não tem `.git`, a versão da aplicação pode aparecer `N/D`.

### A0-012 — GEN163 foi implantado sem reconcile completo do Rapid
Pack DSE4520 implantado: 40 canais. Binding runtime: 26; 15 esperados faltam e `alarm_class_raw` sobra do perfil anterior.

### A0-013 — warning DSE existe no caminho de controle e some no card
Tentativas recentes no GEN163 registram `status=0x0400` (warning), mas o payload normal está `online`, `alarms=0`. `controller_status_flags_raw` está ausente do binding runtime, apesar de existir no pack/template.

### A0-014 — DB e serviços estão operacionais, mas isso não garante coerência
`PRAGMA quick_check=ok`; serviços principais ativos. O caso GEN163 prova que saúde de processo não substitui verificação de coerência entre release, pack, binding e telemetria.

## Trilhas

- AZ-01 Inventário e drift de produção — **em andamento; release identificada**
- AZ-02 Frontend/Vertical
- AZ-03 Frontend/Compacto
- AZ-04 Frontend/Lista e navegação
- AZ-05 Semântica de estado/cor
- AZ-06 Telemetria/API/Rapid — **mismatch GEN163 confirmado**
- AZ-07 Alarmes/eventos e TTL de mensagens
- AZ-08 Comandos/feedback/permissivos
- AZ-09 DSE — **warning/control mismatch confirmado**
- AZ-10 ComAp
- AZ-11 Banco/migrações — **integridade inicial OK**
- AZ-12 Bridge/transportes
- AZ-13 Deploy/systemd/rede/rollback
- AZ-14 Segurança/RBAC
- AZ-15 Testes/CI/release
- AZ-16 Continuidade/documentação/IA — **fundação criada**

## Evidências detalhadas

- `docs/audit/PRODUCTION_DRIFT_2026-09-29.md`
- `docs/audit/PRODUCTION_INVENTORY_2026-09-29.md`

## Critério de encerramento

Cada trilha precisa de inventário, comportamento esperado, evidência atual, gaps, testes, correções separadas, resultado e riscos residuais. A Auditoria Zero termina somente quando `PROJECT_STATE.md` aponta uma baseline candidata de produção e a matriz de regressão está coberta.
