# Estado oficial do projeto

## Vertical: verdade do disjuntor e TTL — 2026-10-11

- Branch `fix/vertical-truth-feedback-20261011`, base `a6452e9de7c68d84c95573d8bc6356cd9f99b4d6`. Domínio exclusivo Vertical.
- GCB conhecido exige canal gcb_closed fresco; potência/corrente não fabricam FECHADO no frontend. Feedback transitório some em 2 s; falhas continuam disponíveis na auditoria/eventos backend. Sem confirmação explícita do executor, texto de fallback não afirma confirmação física.
- Arquivos: `PowerFlowCard.tsx`, E2E Vertical e esta documentação. `npm run check` aprovado; regressão E2E adicionada com dados sob carga sem feedback GCB e comando interceptado, relógio controlado. Execução E2E isolada da VM pendente na abertura do PR.
- Compacto, Lista, CSS, geometria, Controller Packs e 2FA preservados. Produção não alterada por este PR. Rollback: revert e deploy transacional.
- Próximo passo: executar E2E e integrar após checks verdes.


## Gates de fonte do CI — 2026-10-11

- Branch `fix/ci-source-security-gates-20261011`, domínio governança/CI; base `6a4a3fa4ad28e042608638469ba75bd0e0571ec3`.
- Scans de dados demonstrativos e Google Fonts apontam para `frontend/src`, exigem diretório existente e recusam erros do grep (código 2), em vez de tratá-los como ausência de match.
- Arquivos: dois workflows, `tests/ci_source_gates.py`, esta documentação. Regressão executa os blocos reais dos workflows contra fonte limpa, padrão proibido e diretório ausente; aprovada e incluída no CI. Self-test de fronteiras aprovado.
- Não altera runtime/produção/2FA. Rollback: revert.
- Operação separada observada em 2026-10-11: Communicator retomado após conferir 17 devices em linhas com CmdEnabled=false e fila por arquivo vazia; serviço ativo, G-194 sessão Normal avançando, contador de comandos 0/0. Nenhum template, binding ou comando alterado. G-237 ainda sem sessão; não deve ser mostrado como atual até evidência positiva.
- Próximo passo: integrar domínios após checks verdes e validar release na VM isolada antes de deploy.



## Timeout HTTP de comandos — 2026-10-11

- Branch `fix/frontend-command-timeout-20261011`, base `6a4a3fa4ad28e042608638469ba75bd0e0571ec3`. Domínio: API/frontend.
- Cliente de comando passa deadline HTTP de 45 s, superior ao timeout máximo homologado atual (STOP 35 s) com margem de conexão; não aborta mais o feedback aos 15 s. Tipo CommandResult inclui feedback_confirmed e estados terminais da API. Sem retry automático.
- Arquivos: `frontend/src/lib/api.ts`, `tests/command-client-timeout.mjs`, esta documentação.
- Validação: `node --experimental-vm-modules tests/command-client-timeout.mjs` executa o cliente real com transporte simulado e compara deadline com o pack; confirmação explícita, URL escapada e resposta failed são preservadas. `npm run check` aprovado (arquitetura, superfícies, lint, tipos e build).
- Produção não alterada por este PR; rollback por revert e deploy transacional. Instalação independente por cliente, 2FA desativado.
- Próximo passo: feedback transitório e semântica do disjuntor no Vertical, em PR separado.



## Frescor Rapid — 2026-10-11

- Branch `fix/rapid-unavailable-freshness-20261011`, base `6a4a3fa4ad28e042608638469ba75bd0e0571ec3`. Domínio: integração Rapid/telemetria.
- Em produção, cache do Server não pode provar coleta: exigir Communicator ativo, transporte não desconectado e sessão Normal recente por device. Timestamp vem de `Session time` no diagnóstico nativo do Communicator, não da hora HTTP. Valores constantes continuam válidos se a sessão avança. Sessão expirada/ausente, erro de verificação e coletor parado tornam dados stale e não renovam snapshots.
- Integração observada na VM Rapid 6.4.7: `/var/log/scada/ScadaComm/Log/deviceNNN.txt`, cabeçalho em inglês e timestamp `dd/MM/yyyy HH:mm:ss` no fuso local do host; arquivo 0644, diretório 0755 acessíveis ao usuário API. Parametrização: `RC_RAPID_COMM_LOG_DIR`, `RC_RAPID_DEVICE_STALE_SECONDS` (padrão 60 s). Outros ambientes/layouts de diagnóstico devem ser validados; ausência falha conservadoramente.
- Arquivos: `backend/app/rapid.py`, `backend/tests/rapid_overlay_resilience.py`, esta documentação. Suíte completa backend (14 arquivos) aprovada após guardas de coletor/transporte; parser de sessão coberto por regressões de sessão atual, constante, expirada, indefinida e ausente.
- Sem alteração de schema, templates, comandos ou 2FA. Produção ainda não alterada. Rollback: revert e deploy transacional existente.
- Próximo passo: validar em cópia isolada da VM e preparar deploy; corrigir timeout HTTP e apresentação de feedback em domínio API/frontend separado.



## Contrato de resposta de comando — 2026-10-11

- Branch `fix/command-api-confirmation-20261011`, encadeada à correção da bridge #225. Domínio: comando industrial/API de controle.
- Resposta terminal diferencia `confirmed` (aceito e feedback confirmado), `failed` (aceito sem confirmação) e `rejected` (não aceito). `ok` somente quando accepted e feedback_confirmed; resposta inconsistente de executor não produz sucesso. Nenhum estado intermediário é fabricado no protocolo síncrono existente.
- Arquivos: `backend/app/control.py`, `backend/tests/control_multi_device.py`, esta documentação. Teste simulado cobre as três respostas e aceitação antiga sem feedback.
- Produção não alterada, sem comando real, sem alteração de 2FA. Rollback: revert e deploy transacional.
- Próximo passo: integrar após #225 e ajustar timeout HTTP separadamente no cliente frontend.

## Remediação de comandos — 2026-10-11

- Escopo autorizado pelo proprietário: instalação independente por cliente, sem arquitetura SaaS compartilhada; manter 2FA desativado nesta etapa.
- Base conferida: produção, marker e checkout em `6a4a3fa4ad28e042608638469ba75bd0e0571ec3`, checkout de produção limpo. Communicator continua parado; investigação em domínio separado.
- Branch: `fix/ig200-physical-feedback-20261011`. Domínio: bridge/transporte (executor privilegiado).
- IG200 START exige RPM >100 em até 15 s; STOP exige RPM <=100 em até 30 s, conforme pack existente. Escrita aceita sem feedback retorna `ok=false` e `feedback_confirmed=false`; confirmação retorna `feedback_confirmed=true`. Normalização de state na API será PR encadeado separado. Falhas ficam registradas como ERROR no histórico.
- Arquivos: `backend/app/bridge.py`, `backend/tests/control_multi_device.py` e esta documentação.
- Validação: suíte backend completa, 14 arquivos, aprovada; regressões simulam START/STOP confirmado, timeout, perda de conexão, rejeição e aceitação sem feedback. Teste exige igualdade com o contrato RPM/timeout do pack.
- Produção não alterada por esta branch; nenhum comando industrial executado. Confirmação física em campo não realizada.
- Rollback: reverter o commit desta branch e usar o deploy transacional existente, preservando banco e bindings.
- Próximo passo: revisar/integrar esta mudança isolada; corrigir acesso administrativo no bootstrap e frescor de telemetria em branches separadas.


## Permissões da API operacional — 2026-10-11

- Branch `fix/ops-bootstrap-rbac-20261011`, base `6a4a3fa4ad28e042608638469ba75bd0e0571ec3`. Domínio: backend de produto/RBAC.
- Bootstrap deixa de expor backups e webhooks a usuários sem permissão administrativa. Configurações privadas ficam restritas a administradores tanto no bootstrap quanto em GET settings; apenas switches booleanos de UI são compartilhados. GET webhooks exige admin.
- Arquivos: `backend/app/main.py`, `backend/tests/smoke.py`, esta documentação.
- Validação: suíte backend completa (14 arquivos) aprovada; regressão de visualização nas rotas reais, verificação dos demais perfis na filtragem de configurações e preservação de acesso administrativo.
- Produção permanece inalterada; nenhum schema, binding, capability ou opção 2FA alterado. Modelo autorizado: uma instalação independente por cliente, sem SaaS compartilhado.
- Rollback: revert desta mudança e deploy transacional existente.
- Próximo passo: PR separado para bloquear frescor falso quando coletor/transporte estão indisponíveis. Comandos tratados separadamente no PR #225.

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

