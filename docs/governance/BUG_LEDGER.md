# Registro de problemas — Auditoria Zero

| ID | Problema | Domínio | Estado inicial |
|---|---|---|---|
| BUG-001 | Mensagem informativa DSE/FC16 não some do card | Vertical/feedback | confirmado no código: sem TTL |
| BUG-002 | FC16 aceito pode parecer sucesso sem feedback físico | Comando DSE | confirmado no executor LAB |
| BUG-003 | Cards não correspondem à realidade em todos os estados | Semântica/UI | aberto para fixtures reais |
| BUG-004 | Leitura disponível mas OFF/MAN/AUTO/TEST bloqueados | Controller Pack/comando | comportamento atual; requer homologação, não desbloqueio cego |
| BUG-005 | Cores mudam/representam saúde sem contrato suficiente | Semântica/UI | exemplo confirmado no Compacto |
| BUG-006 | Mudança de uma visualização pode atingir outra | Arquitetura frontend | confirmado em GeneratorsBoard |
| BUG-007 | Possível diferença entre código da VM e main | Deploy/drift | precisa capturar SHA da VM |
| BUG-008 | Continuidade entre chats/IDEs não era persistente | Governança | endereçado por AGENTS/PROJECT_STATE/handoff |

Todo novo bug deve receber ID, reprodução, domínio, teste de regressão e PR correspondente.
