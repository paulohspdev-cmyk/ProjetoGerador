# Estado oficial do projeto

Atualizado em: 2026-09-30  
Baseline de governança integrada: `a3991670a78564d514de95fa1d500b53a32f6f7e`  
Produção observada durante a Auditoria Zero: `20a68c2d0e146addcca708290a1564c63ffa305e`  
Fotografia congelada: `production/observed-2026-09-29`  
PR de fechamento da Auditoria Zero: #105  
Contexto operacional privado mais recente: `sentinelx_context_sxc_48T4HH71`

## Estado da Auditoria Zero

**CONCLUÍDA COMO FASE DE DIAGNÓSTICO.**

A auditoria mapeou o sistema atual, a produção observada, os gaps de contrato, a arquitetura de frontend, Rapid, comandos, banco, backup, bridge, segurança e testes.

Isto não significa que os bugs estejam corrigidos. A próxima fase é **Remediação Controlada**, um domínio por PR.

Relatório de fechamento:

`docs/audit/AUDIT_ZERO_FINAL_2026-09-30.md`

## Reset operacional da frota — 2026-09-30

Por solicitação explícita do operador, todos os geradores cadastrados foram retirados para reiniciar a configuração do zero.

Procedimento aplicado:

- backup completo criado e validado antes da mudança;
- equipamentos provisionados foram retirados pelo deprovisionador seguro do Rapid;
- canais históricos foram preservados/desativados em vez de renumerados;
- bindings retirados foram arquivados;
- cadastros e espelhos de domínio foram removidos;
- nenhum comando industrial foi enviado às controladoras;
- a bridge foi reiniciada ao final para eliminar estado runtime antigo.

Estado final validado:

- 0 geradores cadastrados;
- 0 assets espelhados;
- 0 controller instances;
- 0 controller connections;
- 0 bindings Rapid ativos;
- 0 portas ativas na bridge;
- nenhum alarme industrial ativo órfão;
- SQLite quick check e foreign keys íntegros;
- serviços RC e Rapid ativos.

Histórico/auditoria e bindings retirados permanecem preservados. O reset não apaga a evidência anterior.

A release de software não foi alterada por esse reset; apenas o estado operacional da frota foi zerado.

## Estado conhecido de maior impacto

- produção observada estava em SHA de PR ainda aberto, diferente da main consolidada;
- GEN163/DSE4520 possuía Controller Pack com 40 canais e binding runtime com 26;
- sinais de warning observados pelo executor não chegavam integralmente ao card;
- contrato genérico ainda mistura accepted/pending/confirmed em alguns caminhos;
- IG200 não aplica integralmente o feedback RPM declarado no pack;
- DSE/IG4 possuem timeouts de executor divergentes dos contratos declarados;
- mensagem de comando do Vertical não possui TTL;
- Vertical muda geometria conforme quantidade de cards visíveis;
- filtro de status e status exibido podem divergir quando stale;
- Compacto e gauges possuem semântica de cor não totalmente fundamentada em estado industrial;
- backup/restore é tecnicamente robusto, mas a política periódica observada requer restauração operacional;
- deploy possui rollback/SHA/smoke, mas falta gate exato Controller Pack x binding;
- bridge possui proteção e deploy preserva sessões em mudanças não relacionadas à comunicação;
- segurança possui controles técnicos relevantes e hardenings operacionais pendentes, com detalhes mantidos fora do repositório público.

## Artefatos canônicos

- `AGENTS.md`
- `docs/governance/PRODUCTION_CONTRACT.md`
- `docs/governance/CHANGE_BOUNDARIES.md`
- `docs/governance/REGRESSION_MATRIX.md`
- `docs/governance/BUG_LEDGER.md`
- `docs/governance/AI_HANDOFF.md`
- `docs/audit/AUDIT_ZERO_FINAL_2026-09-30.md`

## Próxima fase obrigatória — Remediação Controlada

Ordem:

1. checker read-only pack x binding;
2. gate de deploy para mismatch;
3. dry-run de reconcile Rapid;
4. restaurar política de backup periódico;
5. fixtures reais read-only;
6. separar submitted/accepted/pending/confirmed/failed;
7. corrigir feedback IG200;
8. alinhar timeouts DSE/IG4 ao pack;
9. TTL visual de ~2 s;
10. corrigir semântica de cores/status;
11. estabilizar e separar layouts Vertical/Compacto;
12. reconciliar GEN163 em procedimento controlado;
13. homologações adicionais somente depois;
14. hardening final de segurança/operação.

## Regra de continuidade

Qualquer agente deve iniciar por `AGENTS.md`, este arquivo e o relatório final.

Se uma tarefa não declarar um único domínio primário, ela não deve começar.
