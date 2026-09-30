# Estado oficial do projeto

Atualizado em: 2026-09-29  
Baseline inicial da Auditoria Zero: `903716ec7463bee84a54856cdd27b94e78531fe4`  
Branch de governança: `audit/zero-baseline-governance`  
Produção observada: `deployed-commit=20a68c2d0e146addcca708290a1564c63ffa305e` — head do PR #86 ainda aberto.  
Contexto operacional de continuidade: `sentinelx_context_sxc_5D0D875Z`

## Objetivo atual

Interromper o ciclo de correção/regressão e estabelecer uma base verificável para evoluir o RC Geradores. Nenhuma funcionalidade nova deve ser promovida antes de a Auditoria Zero definir o comportamento real e seus testes.

## Estado conhecido

- Rapid SCADA continua sendo a fonte industrial de telemetria/histórico.
- A aplicação possui CI, E2E e validações de Controller Packs.
- A baseline `903716e` passou CI, E2E e Quality/Security.
- **Drift de produção confirmado:** o marcador da VM aponta `20a68c2`, head do PR #86, e os 22 arquivos do delta foram confirmados idênticos.
- O PR #86 permanece aberto/não integrado à `main`.
- A VM possui 11 geradores e 10 bindings Rapid. GEN132 não possui binding de produção.
- Banco operacional passou `PRAGMA quick_check=ok`.
- Todos os serviços RC Geradores e Rapid SCADA observados estão ativos/habilitados.
- O GEN163/DSE4520 MKII 4.8 possui pack específico e comandos habilitados na produção observada.
- O binding runtime do GEN163 está desatualizado em relação ao pack implantado: 26 canais contra 40; faltam 15, inclusive `controller_status_flags_raw`.
- O executor de comando do GEN163 lê `status=0x0400` (warning) em tentativas recentes, enquanto o payload normal mostra `alarms=0`. Este é um caso comprovado de divergência entre card e realidade observada pelo próprio controlador.
- GEN205 e GEN206 têm telemetria ativa/running, mas seus packs permanecem read-only. Isso não é automaticamente erro: escrita requer homologação separada.
- GEN153/154/167 têm START/STOP habilitados; modos continuam bloqueados.
- GEN203/204 têm somente START habilitado no estado observado.
- GEN157 está offline/stale e sem firmware inventariado; comandos efetivos ficam bloqueados.

## Problemas prioritários

1. Mensagem de comando no Vertical sem TTL.
2. Estado `accepted/pending/confirmed` de comando precisa ser modelado explicitamente.
3. Reconciliar pack/binding Rapid do GEN163 antes de confiar no card para warnings/bus/mains.
4. Corrigir semântica de cor: valor presente não significa saudável/online.
5. Separar algoritmos/layouts Vertical e Compacto.
6. Fazer o endpoint de versão usar `deployed-commit`.
7. Impedir deploy parcialmente reconciliado.
8. Substituir PRs multissistema por um domínio por PR.

## Próxima sequência obrigatória

1. **Concluir AZ-01:** inventário/drift e regras de release.
2. **AZ-06/AZ-09:** fechar a divergência de telemetria/binding DSE sem escrever na controladora.
3. Capturar fixtures reais sanitizadas de API/telemetria.
4. Fechar AZ-02..AZ-16 por domínio.
5. Transformar cada problema em teste de regressão.
6. Corrigir um domínio por PR.
7. Criar release candidate por SHA exato.
8. Validar antes de qualquer novo deploy.

## Regra de continuidade

Este arquivo é a memória operacional canônica do projeto. Qualquer agente deve começar por `AGENTS.md`, este arquivo e o PR/issue mestre. O contexto SentinelX é auxiliar; o GitHub continua sendo a fonte durável.
