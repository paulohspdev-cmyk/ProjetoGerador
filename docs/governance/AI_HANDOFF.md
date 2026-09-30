# Continuidade entre chats, IDEs e agentes de IA

O projeto não pode depender da memória de uma conversa.

## Ao iniciar uma sessão

1. Leia `AGENTS.md`.
2. Leia `docs/governance/PROJECT_STATE.md`.
3. Confira o último commit e PRs abertos.
4. Identifique o domínio da tarefa.
5. Verifique a matriz de regressão correspondente.
6. Se a tarefa envolver produção, confirme o SHA implantado antes de concluir causa.

## Ao encerrar uma sessão/PR

Atualize `PROJECT_STATE.md` com:

- o que foi concluído;
- o que ainda está aberto;
- branch/PR/commit;
- testes executados e resultado;
- evidência de produção/campo disponível;
- risco conhecido;
- próximo passo exato.

Não escreva "continuar depois" sem indicar arquivo, problema, estado e critério de conclusão.

## Handoff mínimo

Use este formato:

```text
BASE:
PR/BRANCH:
DOMÍNIO:
OBJETIVO:
ALTERADO:
VALIDADO:
NÃO VALIDADO:
PRODUÇÃO:
RISCOS:
PRÓXIMO PASSO:
```

## Regra contra memória de chat

Se uma informação importante existe somente no chat, ela ainda não é parte confiável do projeto. Antes de encerrar uma etapa, mova a decisão/evidência para o repositório.
