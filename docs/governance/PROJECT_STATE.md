# Estado oficial do projeto

Atualizado em: 2026-10-06  
Baseline de governança integrada: `a3991670a78564d514de95fa1d500b53a32f6f7e`  
Produção observada durante a Auditoria Zero: `20a68c2d0e146addcca708290a1564c63ffa305e`  
Fotografia congelada: `production/observed-2026-09-29`  
PR de fechamento da Auditoria Zero: #105  
Contexto operacional privado mais recente: `sentinelx_context_sxc_48T4HH71`

## Remediação operacional validada em 2026-10-06

Estado corrente observado e validado:

- `main`, `HEAD` de produção e `/var/lib/rc-geradores/deployed-commit` alinhados após o deploy de `037c97568b289a3d23bd224d7d39aa7a28c2a923`;
- GitHub Actions do `main`: CI, E2E e Quality and Security verdes;
- vulnerabilidade HIGH de `source-map-js` corrigida em `1.2.2`; `npm audit --audit-level=high` retorna zero vulnerabilidades;
- auditoria Python com `pip-audit` sem vulnerabilidades conhecidas;
- backup completo periódico restaurado com job diário idempotente `job-daily-full-backup`;
- backup completo imediato executado com sucesso após a correção;
- retenção de backups transacionais de deploy permanece em 30;
- banco SQLite validado por `quick_check`, `integrity_check` e `foreign_key_check`;
- `vm-smoke.sh` e `preflight_vm.sh` aprovados;
- 13/13 bindings Rapid conferem com cadastro e Controller Pack;
- serviços RC e Rapid essenciais ativos e sem unidades systemd falhas;
- inconsistência de versão do `fwupd` da VM corrigida;
- 98 branches Git já mescladas foram removidas; branches não mescladas, releases, backups, checkpoints e auditorias foram preservados;
- E2E dedicado do Compacto está presente e ativo.

Pendências que dependem de infraestrutura/administrador externo ao código:

- backup off-site continua sem destino externo montado/configurado; não deve ser simulado em diretório do mesmo disco;
- proteção obrigatória de `main` contra merge com checks vermelhos depende de configuração administrativa no GitHub. O código já possui os gates, mas a integração disponível nesta sessão não possui permissão de administração do repositório.

Relatório desta remediação:

`docs/audit/AUDIT_REMEDIATION_2026-10-06.md`

## Estado da Auditoria Zero

**CONCLUÍDA COMO FASE DE DIAGNÓSTICO.**

A auditoria mapeou o sistema atual, a produção observada, os gaps de contrato, a arquitetura de frontend, Rapid, comandos, banco, backup, bridge, segurança e testes.

Isto não significa que os bugs estejam corrigidos. A próxima fase é **Remediação Controlada**, um domínio por PR.

Relatório de fechamento:

`docs/audit/AUDIT_ZERO_FINAL_2026-09-30.md`

## Baseline histórica de maior impacto da Auditoria Zero

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

## Plano histórico da Remediação Controlada — consultar a seção de 2026-10-06 antes de executar

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

## Implantação modem-first em produção — 2026-09-30

Estado funcional implantado: `76d241eb08f2dc9c386fdff31837f3a1e5e08d4a`  
PR de correção do gate de migração: #117

### Resultado do deploy

- fluxo modem-first dos PRs #113, #114, #115 e #116 implantado na VM;
- primeiro deploy de `d00e53aa424257b9bcb4dde8063f350a7b0f37d1` foi abortado e revertido transacionalmente porque o banco legado de produção ainda não possuía `field_devices.listen_port`;
- PR #117 corrigiu a ordem da migração: colunas legadas são adicionadas antes da criação de `idx_field_devices_modem_port`;
- regressão específica de schema legado passou;
- a correção também foi validada contra uma cópia consistente do banco real antes do segundo deploy;
- segundo deploy via `ops/deploy_release_v2.sh` concluído com sucesso;
- `vm-smoke.sh` pós-deploy: APROVADO;
- banco pós-deploy: `quick_check=ok`, zero violações de FK.

### Admissão de modems

- `RC_MODEM_ADMISSION_PORTS=15001-15020`;
- `RC_RAPID_REQUIRE_ALLOWLIST=1`;
- allowlist global continua configurada; CIDRs não são publicados neste documento;
- bridge expõe 20 portas de admissão passiva e zero listeners industriais reverse-TCP neste momento;
- admissão continua passiva: não cria gerador, Rapid Device, binding ou comando industrial;
- inventário de `field_devices` continuava vazio imediatamente após o deploy.

### Preservação do gerador existente

O gerador serial cadastrado após o reset foi preservado sem alteração de binding:

- id `gen-cdbb775a2bed`;
- tag `TESTE`;
- nome `G-152`;
- controladora `InteliGen 200`;
- transporte `modbus_rtu_serial`;
- Unit ID `16`;
- Rapid line/device `100/200`;
- binding runtime preservado e conferente com o cadastro.

Nenhum comando START/STOP/MAN/AUTO/TEST, FC03/FC06/FC16 de validação de campo ou reprovisionamento deliberado foi executado nesta implantação.

### Próximo passo operacional

Aguardar um modem real conectar em uma porta de admissão. A sequência esperada é:

1. chegada aparece em Comunicação → Modems → Aguardando aprovação;
2. operador aprova ou rejeita;
3. dados como serial/IMEI/ICCID são preenchidos apenas quando conhecidos;
4. modem aprovado permanece sem gerador até o cadastro explícito;
5. cadastro `reverse_tcp` seleciona modem aprovado, herda a porta e exige Unit ID;
6. provisionamento industrial só ocorre depois de Controller Pack/homologação aplicáveis.

Observação separada: o smoke de infraestrutura preservou o binding do gerador serial, mas o device Rapid não estava em estado Normal no momento da validação. Isso não foi tratado neste deploy e deve ser investigado em domínio separado se o equipamento deveria estar online.

