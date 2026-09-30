# Estado oficial do projeto

Atualizado em: 2026-09-29  
Baseline inicial da Auditoria Zero: `903716ec7463bee84a54856cdd27b94e78531fe4`  
Branch de governança: `audit/zero-baseline-governance`  
Produção observada: conteúdo correspondente ao head `20a68c2d0e146addcca708290a1564c63ffa305e` do PR #86 em todos os 22 arquivos que diferem da baseline.

## Objetivo atual

Interromper o ciclo de correção/regressão e estabelecer uma base verificável para evoluir o RC Geradores. Nenhuma funcionalidade nova deve ser promovida antes de a Auditoria Zero definir o comportamento real e seus testes.

## Estado conhecido

- Rapid SCADA continua sendo a fonte industrial de telemetria/histórico.
- A aplicação possui CI, E2E e validações de Controller Packs.
- O commit baseline `903716e` passou CI, E2E e Quality/Security no GitHub.
- Isso não prova equivalência com a VM nem comportamento físico das controladoras.
- **Drift de produção confirmado:** `/opt/rc-geradores` não corresponde à `main`. Todos os 22 arquivos alterados entre `903716e` e o head do PR #86 foram comparados com a VM e são idênticos ao head `20a68c2`.
- O PR #86 permanece aberto/não integrado à `main`, mas seu delta está implantado na VM observada.
- O diretório implantado não contém `.git`; por isso o SHA não pode ser obtido por `git rev-parse`. A equivalência acima foi comprovada por comparação de conteúdo dos 22 arquivos do delta.
- O PR #86 possui 41 commits e atravessa comandos DSE, bridge/IG4, Controller Packs, telemetria/topologia, frontend Vertical/detalhe e API. Ele viola a nova regra de um domínio por PR e não deve ser usado como modelo de evolução.
- Na produção observada, DSE4520 MKII 4.8 possui um pack específico e executor DSE para START/STOP/OFF/AUTO/MANUAL/TEST. Isso é diferente da baseline `main`, onde os packs DSE encontrados são read-only para comandos.
- InteliGen 200 firmware `1.8.1.1`: a baseline declara START/STOP como homologados; demais modos/comandos continuam bloqueados.

## Problemas relatados que são parte formal da Auditoria Zero

- Mensagem DSE de FC16/START permanece visível; feedback informativo deve expirar em ~2 s.
- Cards não representam de forma confiável a realidade física em todos os casos.
- Há controladoras com leitura disponível, mas troca de OFF/MAN/AUTO/TEST não está liberada em todos os modelos.
- Cores/estados visuais mudam sem um contrato suficientemente claro para o operador.
- Alterações visuais têm causado regressões cruzadas entre resoluções e tipos de card.
- Continuidade entre chats/IDEs era dependente do histórico da conversa; passa a ser responsabilidade deste repositório.

## Achados prioritários

1. `PowerFlowCard.tsx` mantém a mensagem de comando sem TTL.
2. A produção possui lógica DSE que distingue timeout/feedback, mas ainda usa `accepted` como conceito amplo e pode considerar START pendente como aceito sem RPM confirmado.
3. `CompactCard.tsx` usa verde para valor elétrico existente em um caso, sem prova de saúde.
4. `GeneratorsBoard.tsx` mistura layout Vertical e Compacto.
5. A produção foi atualizada com código de um PR ainda aberto, criando divergência entre GitHub `main` e VM.

## Próxima sequência obrigatória

1. **AZ-01:** inventariar completamente VM, versão implantada, serviços, configuração não secreta, banco, bindings e Controller Packs.
2. Capturar fixtures reais de API/telemetria **somente leitura**.
3. Fechar AZ-02..AZ-16 por domínio.
4. Transformar cada problema em teste de regressão.
5. Corrigir um domínio por PR.
6. Criar release candidate por SHA exato.
7. Validar release candidate antes do deploy.
8. Nunca mais implantar código de PR aberto sem registrar explicitamente a release.
9. Atualizar este arquivo após cada conclusão.

## Regra de continuidade

Este arquivo é a memória operacional canônica do projeto. Qualquer agente que retome o trabalho deve começar daqui e nunca depender de memória de chat.
