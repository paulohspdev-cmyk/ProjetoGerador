# Registro de problemas — Auditoria Zero

| ID | Problema | Domínio | Estado |
|---|---|---|---|
| BUG-001 | Mensagem informativa DSE/FC16 não some do card | Vertical/feedback | confirmado: `commandMessage` sem TTL |
| BUG-002 | Escrita/FC16 pode ser confundida com ação física confirmada | Comando DSE | confirmado; contrato accepted/pending/confirmed precisa ser separado |
| BUG-003 | Cards não correspondem à realidade em todos os estados | Semântica/UI | confirmado ao menos no GEN163: warning do controle não chega ao card |
| BUG-004 | Leitura disponível mas OFF/MAN/AUTO/TEST bloqueados em alguns modelos | Controller Pack/comando | comportamento correto quando não homologado; auditar modelo/firmware individualmente |
| BUG-005 | Cores representam saúde sem contrato suficiente | Semântica/UI | confirmado no Compacto: valor presente recebe `text-online` |
| BUG-006 | Mudança de uma visualização pode atingir outra | Arquitetura frontend | confirmado em `GeneratorsBoard.tsx` |
| BUG-007 | VM diverge da `main` | Deploy/drift | **resolvido 2026-10-06**: `HEAD`, `origin/main` e `deployed-commit` alinhados após deploy controlado |
| BUG-008 | Continuidade entre chats/IDEs não era persistente | Governança | endereçado por AGENTS/PROJECT_STATE/handoff + contexto SentinelX |
| BUG-009 | Produção contém código de PR ainda aberto | Release/governança | **resolvido 2026-10-06**: produção implantada a partir de `main`, release por SHA e marcador conferente |
| BUG-010 | PR #86 mistura múltiplos domínios | Processo/arquitetura | confirmado: 41 commits e 22 arquivos em backend/bridge/packs/frontend/API |
| BUG-011 | Hipótese de diagnóstico sem `.git` | Deploy/observabilidade | **descartado após verificação direta**: `.git` existe, HEAD está limpo/detached em `20a68c2...` e `version_info()` retorna o SHA correto |
| BUG-012 | Binding GEN163 não corresponde ao Controller Pack implantado | Rapid/provisionamento | confirmado: binding 26 canais vs pack 40; faltam 15 e sobra `alarm_class_raw` |
| BUG-013 | Estado DSE visto pelo controle difere do estado mostrado no card | Telemetria/semântica | confirmado: controle lê warning `0x0400`; payload normal mostra `alarms=0` |
| BUG-014 | Release pode ficar parcialmente reconciliada | Deploy/Rapid | **mitigado/resolvido no gate atual**: smoke valida 13/13 bindings contra cadastro e Controller Pack; manter regressão obrigatória |
| BUG-015 | Falha transitória da API muda todos os cards para stale/offline visual | Frontend/semântica | confirmado no `GeneratorsProvider`; precisa distinguir falha browser/API de perda industrial |
| BUG-016 | Card Compacto em alerta pode manter glow verde de "online" | Compacto/semântica | confirmado: `isGeneratorConnected` inclui alerta e ativa `glow-online` |
| BUG-017 | Gauges kW usam zonas verde/amarelo/vermelho 70/20/10 sem limite homologado | Vertical/Compacto/semântica | confirmado; packs auditados não fornecem thresholds de `power_kw` |
| BUG-018 | MCB/GCB aberto é tratado visualmente como alerta | Lista/semântica | confirmado; estado físico está sendo confundido com severidade |
| BUG-019 | AUTO/TEST reutilizam cores reservadas a saúde/alarme | Semântica/UI | confirmado como ambiguidade visual; requer contrato de cores por eixo |
| BUG-020 | Status `online` pode coexistir com qualidade de telemetria `partial` | Backend/UI | confirmado em GEN203/204; UI precisa representar ambos os eixos |

| BUG-021 | IG200 marca START/STOP aceito sem exigir feedback físico declarado no pack | Comando/IG200 | confirmado: RPM após 2 s é lido mas não participa de `accepted` |
| BUG-022 | Evento/auditoria IG200 não preserva feedback final suficiente | Eventos/IG200 | confirmado: evento grava RPM anterior; audit grava accepted/reason |
| BUG-023 | DSE usa 3 s para confirmar modos enquanto pack declara 5 s | Comando/DSE | confirmado: timeout hard-coded diverge do contrato |
| BUG-024 | IG4 observa START por ~6 s enquanto pack declara 8 s | Comando/IG4 | confirmado: timeout de feedback duplicado e divergente |
| BUG-025 | Wrapper colapsa accepted/pending/confirmed em `controller_accepted` | Comando/API | confirmado em `send_homologated_command()` |

| BUG-026 | Vertical muda altura conforme quantidade de cards visíveis | Vertical/layout | confirmado: `displayRows` depende de `visible.length` |
| BUG-027 | Filtro ONLINE usa status bruto e pode incluir card visualmente stale | Board/semântica | confirmado: filtro ignora `telemetryStale` |
| BUG-028 | Vertical e Compacto compartilham algoritmo no mesmo `GeneratorsBoard.tsx` | Frontend/arquitetura | confirmado; alto risco de regressão cruzada |
| BUG-029 | Compacto não possui cobertura E2E dedicada equivalente ao Vertical | Testes/Compacto | **resolvido 2026-10-06**: suíte dedicada `videowall-compact.spec.ts` integrada e verde |

| BUG-030 | Não existe backup completo periódico agendado | Backup/operação | **resolvido 2026-10-06**: job diário idempotente restaurado e garantido por install/deploy |
| BUG-031 | Falhas de backup por permissão precederam remoção do job diário | Backup/operação | **resolvido operacionalmente 2026-10-06**: full backup manual pós-remediação concluído com sucesso; retenção local validada |

| BUG-032 | Hardening de segundo fator ainda não está na baseline operacional desejada | Segurança/RBAC | detalhe de produção mantido no contexto privado |
| BUG-033 | Permissões de artefato operacional precisam aderir ao menor privilégio | Segurança/filesystem | detalhe de produção mantido no contexto privado |



| BUG-034 | Dependência Node `source-map-js` com vulnerabilidade HIGH | Dependências/segurança | **resolvido 2026-10-06**: lockfile atualizado para 1.2.2; `npm audit` e Quality/Security verdes |
| BUG-035 | PR podia ser mesclado mesmo com CI/Quality vermelhos | Governança/GitHub | **pendente de configuração administrativa**: gates de CI existem e estão verdes; enforcement obrigatório de branch/ruleset exige permissão admin do GitHub |
| BUG-036 | Estado oficial/documentação não refletia remediações posteriores à Auditoria Zero | Governança | **resolvido 2026-10-06** por atualização do PROJECT_STATE, ledger e relatório de remediação |
| BUG-037 | Backup off-site não possui destino externo configurado | Continuidade/operação | **pendente de infraestrutura externa**: backup local periódico está ativo; não usar diretório do mesmo disco como falso off-site |

Todo novo bug deve receber ID, reprodução, domínio, teste de regressão e PR correspondente.
