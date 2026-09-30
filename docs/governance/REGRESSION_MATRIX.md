# Matriz de regressão

Toda correção deve acrescentar ou reforçar uma linha desta matriz.

| ID | Domínio | Cenário | Prova mínima |
|---|---|---|---|
| UI-V-001 | Vertical | alterar Vertical sem modificar Compacto | teste/diff de fronteira + E2E Vertical |
| UI-V-002 | Vertical | filtrar/paginar não redimensiona card na mesma viewport | E2E geometria |
| UI-C-001 | Compacto | alterar Compacto sem modificar Vertical | teste/diff de fronteira + E2E Compacto |
| UI-L-001 | Lista | lista independente | E2E Lista |
| UI-S-001 | Semântica | valor presente não implica verde | unit/E2E com estado neutro |
| UI-S-002 | Semântica | stale/desconhecido não vira online | teste de estado |
| UI-S-003 | Semântica | filtro usa o mesmo display status do card | unit/E2E stale + filtro |
| UI-S-004 | Semântica | breaker open/closed não implica severidade | unit/E2E |
| UI-S-005 | Semântica | modo operacional não reutiliza severidade sem contrato | unit/visual |
| UI-G-001 | Gauge | ausência de thresholds homologados não cria severidade falsa | unit/visual |
| UI-M-001 | Feedback | mensagem informativa de comando some em ~2 s | E2E com relógio controlado |
| UI-M-002 | Feedback | falha de confirmação continua auditável | API/histórico + E2E |
| CMD-001 | Comando | FC16 aceito sem feedback não é sucesso | teste de executor |
| CMD-002 | START | RPM não sobe dentro do timeout => não confirmado | teste backend |
| CMD-003 | STOP | RPM não cai dentro do timeout => não confirmado | teste backend |
| CMD-004 | Modo | MAN/AUTO/TEST/OFF só habilitam com capability homologada | teste pack/API/UI |
| CMD-005 | Gate | firmware/binding divergente bloqueia escrita | backend |
| CMD-006 | Estado | submitted/accepted/pending/confirmed/failed permanecem distintos | contrato API/backend |
| CMD-007 | Timeout | executor usa timeout/feedback do Controller Pack | teste pack x executor |
| DSE-001 | DSE | página 16/key disponível não prova ação física | backend |
| DSE-002 | DSE | Panel Lock/Protected Start/permissivos geram falha clara sem falso sucesso | fixture + backend |
| IG2-001 | IG200 | START/STOP exigem feedback homologado | backend + campo quando aplicável |
| IG4-001 | IG4 | START exige retorno + Running/RPM dentro do timeout do pack | backend |
| RAP-001 | Rapid | canal inexistente = N/D, nunca valor fabricado | backend/frontend |
| RAP-002 | Rapid | binding runtime deve corresponder ao cadastro | backend |
| RAP-003 | Rapid | conjunto de canais do binding corresponde ao pack | checker read-only + smoke |
| RAP-004 | Rapid | reconcile possui dry-run antes de mutação | teste de provisionamento |
| DEP-001 | Deploy | alteração só de UI não derruba sessão reverse TCP | teste de deploy |
| DEP-002 | Deploy | mudança de runtime da bridge força restart | teste de deploy |
| DEP-003 | Deploy | release informa SHA implantado e marker coincide | smoke |
| BAK-001 | Backup | job periódico esperado existe e está habilitado | smoke operacional |
| BAK-002 | Backup | último full backup não excede idade máxima | monitor/smoke |
| BAK-003 | Backup | archive full passa quick/integrity/FK em restore test | ambiente não produtivo |
| RES-001 | Layout | 1024/1366/1920/2560/3840 sem overflow global | Playwright |
| RES-002 | Vertical | geometria aprovada não muda em PR não-Vertical | screenshot/medidas |
| DB-001 | Banco | migração é reversível/compatível | teste de migração |
| SEC-001 | Segurança | ações privilegiadas obedecem política forte configurada | backend/E2E sanitizado |
| SEC-002 | Segurança | artefatos operacionais respeitam menor privilégio | smoke de permissões |
| CONT-001 | Continuidade | PROJECT_STATE atualizado no PR | validação CI |

## Regra

Não remover um teste de regressão para fazer o build passar. Se o contrato mudou de propósito, alterar primeiro o contrato/documentação e registrar a decisão.

A matriz descreve as provas exigidas para a fase de Remediação Controlada. Nem todas as linhas estão implementadas ainda; cada PR de correção deve implementar as linhas que sua mudança exige.
