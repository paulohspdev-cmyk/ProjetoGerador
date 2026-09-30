# Matriz de regressão

Toda correção deve acrescentar ou reforçar uma linha desta matriz.

| ID | Domínio | Cenário | Prova mínima |
|---|---|---|---|
| UI-V-001 | Vertical | alterar Vertical sem modificar Compacto | teste/diff de fronteira + E2E Vertical |
| UI-C-001 | Compacto | alterar Compacto sem modificar Vertical | teste/diff de fronteira + E2E Compacto |
| UI-L-001 | Lista | lista independente | E2E Lista |
| UI-S-001 | Semântica | valor presente não implica verde | unit/E2E com estado neutro |
| UI-S-002 | Semântica | stale/desconhecido não vira online | teste de estado |
| UI-M-001 | Feedback | mensagem informativa de comando some em ~2 s | E2E com relógio controlado |
| UI-M-002 | Feedback | falha de confirmação continua auditável | API/histórico + E2E |
| CMD-001 | Comando | FC16 aceito sem feedback não é sucesso | teste de executor |
| CMD-002 | START | RPM não sobe dentro do timeout => não confirmado | teste backend |
| CMD-003 | STOP | RPM não cai dentro do timeout => não confirmado | teste backend |
| CMD-004 | Modo | MAN/AUTO/TEST/OFF só habilitam com capability homologada | teste pack/API/UI |
| CMD-005 | Gate | firmware/binding divergente bloqueia escrita | backend |
| DSE-001 | DSE | página 16/key disponível não prova ação física | backend |
| DSE-002 | DSE | Panel Lock/Protected Start/permissivos geram falha clara sem falso sucesso | fixture + backend |
| IG2-001 | IG200 | START/STOP preservam feedback homologado | backend + campo quando aplicável |
| RAP-001 | Rapid | canal inexistente = N/D, nunca valor fabricado | backend/frontend |
| RAP-002 | Rapid | binding runtime deve corresponder ao cadastro | backend |
| DEP-001 | Deploy | alteração só de UI não derruba sessão reverse TCP | teste de deploy |
| DEP-002 | Deploy | release informa SHA implantado | smoke |
| RES-001 | Layout | 1024/1366/1920/2560/3840 sem overflow global | Playwright |
| RES-002 | Vertical | geometria aprovada não muda em PR não-Vertical | screenshot/medidas |
| DB-001 | Banco | migração é reversível/compatível | teste de migração |
| CONT-001 | Continuidade | PROJECT_STATE atualizado no PR | validação CI |

## Regra

Não remover um teste de regressão para "fazer o build passar". Se o contrato mudou de propósito, alterar primeiro o contrato/documentação e registrar a decisão.
