# Estado oficial do projeto

Atualizado em: 2026-09-29  
Baseline inicial da Auditoria Zero: `903716ec7463bee84a54856cdd27b94e78531fe4`  
Branch de trabalho inicial: `audit/zero-baseline-governance`

## Objetivo atual

Interromper o ciclo de correção/regressão e estabelecer uma base verificável para evoluir o RC Geradores. Nenhuma funcionalidade nova deve ser promovida antes de a Auditoria Zero definir o comportamento real e seus testes.

## Estado conhecido

- Rapid SCADA continua sendo a fonte industrial de telemetria/histórico.
- A aplicação possui CI, E2E e validações de Controller Packs.
- O commit baseline passou CI, E2E e Quality/Security no GitHub.
- Isso não prova equivalência com a VM de produção nem com o comportamento físico das controladoras.
- A produção precisa expor e registrar o SHA realmente implantado; qualquer diferença entre VM e GitHub deve ser tratada como drift.
- InteliGen 200 firmware `1.8.1.1`: o repositório atual declara START/STOP como homologados; demais modos/comandos continuam bloqueados.
- Packs DSE de produção encontrados na baseline são read-only para comandos.
- Existe código de ensaio DSE separado (`backend/app/dse_control.py` / `dse_lab.py`) que não faz parte do caminho homologado de produção em `main.py`.

## Problemas relatados que são parte formal da Auditoria Zero

- Mensagem DSE de FC16/START permanece visível; feedback informativo deve expirar em ~2 s.
- Cards não representam de forma confiável a realidade física em todos os casos.
- Há controladoras com leitura disponível, mas troca de OFF/MAN/AUTO/TEST não está liberada.
- Cores/estados visuais mudam sem um contrato suficientemente claro para o operador.
- Alterações visuais têm causado regressões cruzadas entre resoluções e tipos de card.
- Continuidade entre chats/IDEs era dependente do histórico da conversa; passa a ser responsabilidade deste repositório.

## Próxima sequência obrigatória

1. Fechar a Auditoria Zero por domínio.
2. Confirmar SHA e configuração da VM de produção.
3. Capturar fixtures reais de API/telemetria sem comandos.
4. Transformar problemas em testes de regressão.
5. Corrigir um domínio por PR.
6. Validar release candidate antes do deploy.
7. Atualizar este arquivo após cada conclusão.

## Regra de continuidade

Este arquivo é a "memória operacional" do projeto. Qualquer agente que retome o trabalho deve começar daqui e nunca depender de memória de chat.
