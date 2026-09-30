# Registro de problemas — Auditoria Zero

| ID | Problema | Domínio | Estado |
|---|---|---|---|
| BUG-001 | Mensagem informativa DSE/FC16 não some do card | Vertical/feedback | confirmado: `commandMessage` sem TTL |
| BUG-002 | Escrita/FC16 pode ser confundida com ação física confirmada | Comando DSE | confirmado; contrato accepted/pending/confirmed precisa ser separado |
| BUG-003 | Cards não correspondem à realidade em todos os estados | Semântica/UI | confirmado ao menos no GEN163: warning do controle não chega ao card |
| BUG-004 | Leitura disponível mas OFF/MAN/AUTO/TEST bloqueados em alguns modelos | Controller Pack/comando | comportamento correto quando não homologado; auditar modelo/firmware individualmente |
| BUG-005 | Cores representam saúde sem contrato suficiente | Semântica/UI | confirmado no Compacto: valor presente recebe `text-online` |
| BUG-006 | Mudança de uma visualização pode atingir outra | Arquitetura frontend | confirmado em `GeneratorsBoard.tsx` |
| BUG-007 | VM diverge da `main` | Deploy/drift | **confirmado crítico**: 22/22 arquivos do delta do PR #86 são idênticos à VM |
| BUG-008 | Continuidade entre chats/IDEs não era persistente | Governança | endereçado por AGENTS/PROJECT_STATE/handoff + contexto SentinelX |
| BUG-009 | Produção contém código de PR ainda aberto | Release/governança | confirmado: `deployed-commit=20a68c2...`, head do PR #86 |
| BUG-010 | PR #86 mistura múltiplos domínios | Processo/arquitetura | confirmado: 41 commits e 22 arquivos em backend/bridge/packs/frontend/API |
| BUG-011 | Diagnóstico de versão ignora marcador de release | Deploy/observabilidade | confirmado: marcador existe, mas `version_info()` usa `git rev-parse` em pasta sem `.git` |
| BUG-012 | Binding GEN163 não corresponde ao Controller Pack implantado | Rapid/provisionamento | confirmado: binding 26 canais vs pack 40; faltam 15 e sobra `alarm_class_raw` |
| BUG-013 | Estado DSE visto pelo controle difere do estado mostrado no card | Telemetria/semântica | confirmado: controle lê warning `0x0400`; payload normal mostra `alarms=0` |
| BUG-014 | Release pode ficar parcialmente reconciliada | Deploy/Rapid | confirmado pelo GEN163; smoke atual não barrou pack novo + binding antigo |

Todo novo bug deve receber ID, reprodução, domínio, teste de regressão e PR correspondente.
