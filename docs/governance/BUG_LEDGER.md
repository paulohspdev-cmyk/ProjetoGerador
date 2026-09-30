# Registro de problemas — Auditoria Zero

| ID | Problema | Domínio | Estado |
|---|---|---|---|
| BUG-001 | Mensagem informativa DSE/FC16 não some do card | Vertical/feedback | confirmado: `commandMessage` sem TTL |
| BUG-002 | Escrita/FC16 pode ser confundida com ação física confirmada | Comando DSE | confirmado; contrato accepted/pending/confirmed precisa ser separado |
| BUG-003 | Cards não correspondem à realidade em todos os estados | Semântica/UI | aberto para fixtures reais |
| BUG-004 | Leitura disponível mas OFF/MAN/AUTO/TEST bloqueados em alguns modelos | Controller Pack/comando | comportamento correto quando não homologado; auditar modelo/firmware individualmente |
| BUG-005 | Cores representam saúde sem contrato suficiente | Semântica/UI | confirmado no Compacto: valor presente recebe `text-online` |
| BUG-006 | Mudança de uma visualização pode atingir outra | Arquitetura frontend | confirmado em `GeneratorsBoard.tsx` |
| BUG-007 | VM diverge da `main` | Deploy/drift | **confirmado crítico**: todos os 22 arquivos do delta do PR #86 são idênticos à VM |
| BUG-008 | Continuidade entre chats/IDEs não era persistente | Governança | endereçado por AGENTS/PROJECT_STATE/handoff |
| BUG-009 | Produção contém código de PR ainda aberto | Release/governança | confirmado: PR #86 head `20a68c2` |
| BUG-010 | PR #86 mistura múltiplos domínios | Processo/arquitetura | confirmado: 41 commits, 22 arquivos, backend/bridge/packs/frontend/API |
| BUG-011 | Instalação não registra SHA Git local | Deploy/observabilidade | confirmado: `/opt/rc-geradores` não é checkout Git; criar marcador imutável de release |

Todo novo bug deve receber ID, reprodução, domínio, teste de regressão e PR correspondente.
