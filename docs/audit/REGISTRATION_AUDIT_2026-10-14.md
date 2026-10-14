# Auditoria detalhada do cadastro de geradores — RC Geradores

Data: 14/10/2026. Baseline examinada: `afec24a685e23707d7d2c230f6a3e373a8cd8ff6`.

## Resultado

O caminho normal de cadastro e edição funciona em vários cenários, mas o fluxo ainda não pode ser considerado completamente correto. A auditoria encontrou falhas reproduzíveis na confirmação do cadastro, nas fronteiras de salvamento, na concorrência entre editores, nos vínculos de modem e na interpretação das relações do diagrama. Existem também divergências reais de nomes entre o banco e o Rapid e recursos que ainda não estão implementados.

O problema de maior prioridade é a confirmação: **clicar em Continuar na etapa Comunicação pode enviar o cadastro antes do clique final em Cadastrar**. Uma prova de navegador confirmou um registro persistido depois apenas desse Continuar. Fechar a janela enquanto a resposta está pendente não desfaz o registro já gravado.

Esta entrega é diagnóstico, não correção. Nenhum arquivo de runtime, cadastro, binding ou configuração industrial de produção foi alterado pela auditoria. Nenhum START/STOP, escrita Modbus, teste de envio de notificações ou reprovisionamento de campo foi realizado. As operações de escrita aconteceram somente em bancos e serviços isolados. Permanecem as decisões: instalação independente por cliente e 2FA desativado.

## Como foi feita a verificação

1. Conferência do Git, checkout da VM e marker de implantação: os três estavam em `afec24a`, sem alterações rastreadas na produção.
2. Leitura das regras de governança e dos contratos do sistema.
3. Rastreamento do formulário até a API, SQLite, domínio de assets/controladoras/conexões, modems, lifecycle e configuração Rapid.
4. Dezesseis cenários de API/banco executados em banco temporário, com transporte e arquivos isolados. Alguns cenários foram escritos para caracterizar o defeito atual: passar significa que o defeito foi reproduzido, não que o comportamento é desejável.
5. Suíte backend existente completa: 14 arquivos de teste aprovados.
6. Primeira execução de navegador: 11 testes aprovados, incluindo cinco de CRUD conectado, três provas novas de edição e três de responsividade. Execução final adicional: cinco provas de cadastro/edição/imagens aprovadas. Há 13 testes distintos nesses dois conjuntos; três foram repetidos após ampliação da investigação.
7. Comparações de produção exclusivamente por leitura: banco, espelhos, vínculos, bindings, XML do Communicator e diagnósticos nativos.

Uma execução intermediária do teste de confirmação falhou por timeout esperando o botão final ficar disponível. A investigação mostrou que ele já estava desabilitado em Configurando porque o Continuar anterior havia submetido o formulário. O teste foi reformulado para observar explicitamente esse envio antecipado e passou. Não foi alterado o produto para fazer o teste passar.

Os testes de navegador foram feitos em checkout temporário separado na VM, com cópia independente das dependências, banco, sockets e SCADA de teste. O build da produção não foi usado como área de teste.

## Fotografia atual da produção

| Verificação | Resultado observado | Interpretação |
|---|---:|---|
| Geradores no banco / bindings runtime | 17 / 17 | Todos os IDs possuem binding correspondente. |
| `quick_check` / violações de FK | ok / 0 | Integridade estrutural aprovada; não prova correção de todos os vínculos lógicos. |
| Identidades vazias no cadastro | 0 | O bug de espaços foi reproduzido em teste, mas não foi encontrado nesses 17 registros. |
| Assets espelhados ausentes | 0 | Todos os geradores possuem representação de domínio. |
| Nome/tag/unidade/ativo diferentes entre gerador e asset | 0 | Espelhamento cadastral consistente nesse instante. |
| Conexões diferentes entre gerador e espelho | 0 | Transporte, host, porta, Unit e Device conferem. |
| Identidade diferente entre banco e binding | 0 | Campos comparados: tag, família/modelo, transporte, host, porta, Unit e Device. |
| Devices ausentes no XML / Units divergentes | 0 / 0 | Identidade operacional confere. Não certifica comunicação física. |
| Nomes diferentes entre banco e XML do Rapid | **7** | Divergência de rótulo observada; definir política de atualização dos nomes. |
| Unidades formais na tabela `sites` | **0** | Os 17 geradores usam unidade textual, sem vínculo formal correspondente. |
| Assets de gerador sem `site_id` | **17** | Unidade textual e unidade formal são representações distintas. |
| Geradores não seriais sem vínculo de transporte com modem | **1** | Investigar origem legada/necessidade de reconciliar o vínculo. |
| Modems com metadados de vínculo diferentes da relação real | **2** | Tinham zero relações reais e referências antigas em metadados. |
| Modem aprovado com porta real e sem `metadata.admissionPort` | **1** | Há um caso que o frontend não aproveita corretamente como o backend. |
| Potência nominal / tanque sem valor cadastral explícito | **17 / 17** | Isso não significa ausência de leitura desses valores pela controladora; esta contagem é só do cadastro. |
| Topologia cadastrada | 11 `genset_only`; 6 `auto` | Não alterar por suposição. |
| Relações na tabela `asset_links` | 0 | O bug de relações do grafo é potencial para novos cadastros; não foi encontrado aplicado à produção atual. |
| Desativados ainda com binding | 0 | O bypass de enabled existe, mas não estava presente nesse inventário. |
| Serviços API/worker/provision/bridge/Communicator | ativos | Serviço ativo não prova aquisição saudável por equipamento. |
| Contadores nativos de comando nos 17 devices | 0 | Nenhuma escrita industrial usada nesta auditoria. |

Os números representam uma inspeção em 14/10, não um monitoramento permanente. Dados cadastrais ausentes não devem ser preenchidos com estimativas. A fotografia de comunicação de 11/10 não deve ser reutilizada como estado atual.

## O fluxo existente, parte por parte

### 1. Abrir o cadastro

O botão Adicionar gerador é exibido conforme permissão create. O formulário carrega catálogo de controladoras, unidades e modems por três chamadas em paralelo. A falta de uma dessas fontes impede completar o carregamento normal. O catálogo distingue modelos provisionáveis, inventário técnico e LAB somente leitura.

Ponto positivo: modelos sem pack de produção podem ser cadastrados sem liberar comandos automaticamente. Ponto pendente: apresentar a falha de cada fonte separadamente e permitir recarregar catálogo/unidades/modems sem perder os campos já digitados.

### 2. Identidade e unidade

Nome é um alias de exibição; tag é identidade normalizada em maiúsculas. Nome vazio no cadastro pode usar a tag como padrão. A edição exige nome e unidade na interface. Unicode e acentos foram preservados no salvamento, espelho e recarregamento.

A unidade é salva como texto em `generators.site`; o assistente usa um datalist, não uma seleção vinculada por ID. A API pode aceitar uma unidade que não existe na tabela sites. Atualmente essa tabela está vazia na instalação, enquanto os 17 geradores possuem textos de unidade. Isso é um modelo incompleto para cliente → unidade → equipamentos, não corrupção estrutural do SQLite.

### 3. Comunicação e modem

Transportes existentes: reverse TCP, Modbus TCP direto, RTU transparente sobre TCP e serial local. Para transportes de rede, o fluxo exige modem aprovado; serial exige dispositivo e parâmetros explícitos.

O backend verifica aprovação do modem e, no reverse TCP, sua porta. Porta + Unit precisam respeitar unicidade. Um mesmo modem pode atender vários geradores com Units diferentes; não se deve impor indevidamente um gerador por modem.

O frontend extrai a porta somente de `metadata.admissionPort`; o backend também usa `listen_port`. Essa diferença afeta modem aprovado com porta real e metadado ausente. Em edição, trocar modem não é apresentado no diálogo padrão, enquanto a API permite enviar modemId; a atualização precisa definir como preservar/reconciliar esse vínculo quando transporte/porta muda.

### 4. Confirmação e salvamento

O POST grava o gerador e audit/evento em uma transação SQLite. Depois, em etapas separadas, vincula o modem e sincroniza a representação de domínio. O retorno ainda passa pelo overlay da telemetria. Não existe uma única transação abrangendo todos esses passos.

No frontend, após criar, vêm configuração de transporte serial, atualização da lista e eventual provisionamento. O ID criado é mantido na janela para repetir configuração sem criar de novo quando a falha ocorre depois de um retorno de criação bem-sucedido. Esse é um ponto positivo. Contudo, se o backend gravar e só depois devolver 500, o frontend não recebe esse ID.

### 5. Provisionamento no Rapid

Provisionamento é um lifecycle separado do cadastro, com operação persistente e consulta de estado. O cliente reutiliza operationId na repetição inicial e acompanha queued/running/succeeded/failed. Isso já existe para lifecycle; não deve ser descrito como inexistente no sistema inteiro.

O provisionamento trabalha com pack, binding, BaseDAT, XML, templates, parâmetros de comunicação, backup e rollback. As regressões existentes foram executadas, mas não houve homologação física dos 17 equipamentos nesta auditoria. Nome no XML é usado na criação do Device; uma edição cadastral de nome não executa sincronização desse rótulo.

### 6. Edição e reconfiguração

O diálogo ressincroniza campos ao abrir, preservando a digitação durante polling. A prova de navegador aguardou mais de um ciclo de atualização e o nome digitado permaneceu intacto.

Mudança de conexão/ativo chama lifecycle de reconfiguração; depois nome, unidade, nominal e tanque são enviados por PATCH. O rollback industrial protege o primeiro bloco em determinadas falhas. Ele não abrange automaticamente a segunda chamada cadastral. Portanto, o conjunto de alterações de uma mesma janela não é atômico.

### 7. Atualização das telas

O provider consulta a lista a cada cinco segundos e evita consultas simultâneas redundantes. Em erro, sinaliza falha e torna os dados anteriores stale, bloqueando capabilities de comando. Porém refresh absorve a exceção; funções de salvamento podem entender a sequência como concluída e fechar a janela, mesmo sem atualizar a lista.

O detalhe, as três visualizações e telas de domínio dependem de fontes distintas. Para afirmar sincronização completa, é preciso comparar os mesmos IDs depois de salvar e após reload, troca de visualização, nova sessão e reinício. Esta auditoria provou o round-trip de nome no detalhe e o espelho de domínio; não afirma ter testado todas as combinações possíveis de todas as telas.

### 8. Imagens, fontes e diagrama

As sete imagens estáticas de controladoras retornaram HTTP 200 e Content-Type image/png no ambiente isolado. O mapeamento por modelo possui placeholder genérico. Não foi encontrado campo de upload, armazenamento de foto por gerador, troca de imagem no formulário ou rota de upload desse recurso. Não existe um botão de salvar imagem de gerador a homologar nesse fluxo atual.

As fontes são definidas em CSS com fallbacks de sistema. A família computada foi observada no navegador. Não existe personalização de fonte por gerador no cadastro. CSS que cita Roboto Condensed pode usar fallback quando a fonte não está disponível; igualdade visual entre Linux, Windows, Android e iOS não está comprovada só por verificar font-family.

O diagrama de funcionamento mostrado nos cards é gerado a partir da topologia resolvida e telemetria homologada. Não é uma imagem livre cadastrada pelo operador. A API aceita powerTopology, mas o assistente e diálogo padrão não oferecem esse campo. O grafo de assets possui relações como alimenta, controla e mede; o resolvedor precisa respeitar essas diferenças.

## Problemas encontrados e critérios de correção

### CAD-01 — Cadastro é enviado ao clicar Continuar, antes da confirmação final

Prioridade: **alta, corrigir primeiro**. Prova: navegador real, registro persistido no SQLite isolado sem clique no botão final. O botão de navegação da etapa 2 é reutilizado como submit na etapa 3; a mudança de tipo durante o clique é consistente com o envio observado.

Impacto: etapa de revisão perde sua função; cadastro e, conforme modelo, configuração automática podem começar antes da confirmação pretendida. Não foi executado comando físico no teste.

Correção proposta: separar a identidade DOM dos botões e bloquear onSubmit fora da etapa de confirmação, com gesto final explícito. Prova mínima: dois cliques em Continuar geram zero POST e zero lifecycle; somente Cadastrar gera um POST.

Fonte: `RegisterGeneratorButton.tsx`, blocos de navegação e onSubmit. O E2E anterior tolerava o botão já estar Configurando, o que deixava esse comportamento passar.

### CAD-02 — PATCH retorna erro de modem depois de salvar outros campos

Prioridade: alta. Prova: PATCH com name novo e modemId inexistente retornou 422; a consulta do banco mostrou o nome novo já gravado.

Impacto: operador pode concluir que nenhuma alteração foi aplicada, repetir ações ou perder a coerência do registro. Correção: validar primeiro todas as referências e gravar cadastro/vínculo/espelho em uma transação coordenada. Prova: modem inválido deixa todos os campos e vínculos anteriores intactos.

Fonte: `main.py::generator_update` e `platform_store.py::link_modem_to_generator`.

### CAD-03 — POST pode retornar 500 após criar o gerador

Prioridade: alta. Prova: falha injetada em sync_legacy_generators após INSERT; retorno 500, registro existente e repetição com a mesma tag retornando 409.

Impacto: cadastro órfão de parte do fluxo, sem ID reconhecido pela janela; repetição pode criar outra identidade se a tag sugerida mudar. Correção: transação do núcleo cadastral e mecanismo persistente de identificação/reconciliação da criação. Prova: falhas entre passos não deixam criação invisível; repetição recupera o mesmo resultado, sem duplicata.

Fonte: `main.py::generator_create`, `db.py::create_generator`, `domain_store.py::sync_legacy_generators`.

### CAD-04 — Reconfiguração e edição cadastral podem ficar parcialmente aplicadas

Prioridade: alta. Prova de navegador: lifecycle simulado aceitou uma mudança de Unit no banco isolado; PATCH cadastral seguinte foi recusado; Unit novo permaneceu e nome antigo permaneceu. Nenhum executor foi chamado.

Impacto: uma única janela apresenta erro, mas parte das alterações já vale. Correção: definir operação coordenada ou separar explicitamente Salvar cadastro de Reconfigurar comunicação, com resultados distintos e recuperação. Prova: falha do segundo passo produz rollback completo ou informa precisamente o que foi aplicado e o que não foi.

Fonte: `GeneratorEditDialog.tsx::save` e `domain_routes.py::_execute_generator_reconfigure`.

### CAD-05 — Campos obrigatórios compostos só de espaços são aceitos

Prioridade: alta. Prova: POST de tag/name/site/controller contendo espaços retornou 201 e os quatro campos foram armazenados vazios após trim.

Impacto: dados inválidos podem entrar por cliente de API, integrações ou uma futura mudança de frontend. Não há registro atual assim entre os 17 geradores. Correção: normalizar antes de aplicar validação e reforçar invariantes no armazenamento. Prova: API retorna 422 e não insere nada; o mesmo vale para PATCH com espaços.

Fonte: `schemas.py` e normalização em `db.py`.

### CAD-06 — Dois editores podem sobrescrever alterações um do outro

Prioridade: alta para uso empresarial. Prova: formulário A salvou nome; formulário B enviou seu nome antigo junto com nova unidade; ambos receberam 200, e o nome de A foi perdido.

Impacto: perda silenciosa de alteração, mesmo quando cada operador modifica um campo diferente. Correção: enviar somente campos modificados e introduzir versão de cadastro com validação de concorrência. Prova: edição baseada em versão antiga é recusada com conflito e permite recarregar/comparar alterações.

Fonte: `GeneratorEditDialog.tsx`, `GeneratorsProvider.tsx::updateGenerator`, `db.py::update_generator`.

### CAD-07 — Troca de modem deixa referências antigas nos metadados

Prioridade: alta para integridade do inventário. Prova: troca de modem deixou o antigo sem relação real, mas com approved_linked e o gerador em linkedGeneratorIds. Dois modems da VM apresentam inconsistência desse tipo.

Correção: atualizar ambos os lados na mesma operação e derivar contagem/estado da relação oficial, ou reconciliar metadados explicitamente. Prova: modem antigo fica sem a referência removida, modem novo contém vínculo correto, e demais geradores compartilhados são preservados.

Fonte: `platform_store.py::link_modem_to_generator`.

### CAD-08 — Relação mede é tratada como ligação elétrica

Prioridade: alta para verdade do diagrama. Prova: gerador com topologia auto ligado a asset mains por relação measures resultou em mains_genset com origem asset_graph, sem ligação de alimentação.

Impacto: diagrama pode mostrar rede/concessionária por relação de supervisão, não de potência. A produção tem zero asset_links, então essa construção não foi encontrada aplicada nela. Correção: permitir somente relações elétricas homologadas na resolução, respeitando sentido, tipo e contexto. Prova: mede/controla não alteram topologia elétrica; alimenta/compartilha barramento só alteram quando o contrato técnico permitir.

Fonte: `power_topology.py::_asset_graph_topology` e relações de `ControllersV3Screen.tsx`.

### CAD-09 — Nome cadastral e nome do Device Rapid divergem

Prioridade: média/alta para rastreabilidade. Evidência atual: sete nomes diferentes entre banco e XML, com Units conferentes.

O PATCH de nome não chama atualização de rótulo do Rapid. Isso não muda o endereço Modbus nem prova perda de leitura, mas dificulta diagnóstico e identificação operacional. Definir se Rapid deve exibir alias atual ou tag estável; expor essa decisão na interface e sincronizar rótulos sem reprovisionamento desnecessário. Prova: renomear preserva Device, canais, histórico e parâmetros, e os nomes seguem a política definida.

Fonte: `main.py::generator_update` e `provision_generator.py::_add_device_to_line`.

### CAD-10 — Perfil cadastro inicia serial, mas não pode salvar seus parâmetros

Prioridade: média/alta. Prova com autorização real em banco isolado: perfil cadastro recebeu 201 no POST serial e 403 no PUT transport-config. O assistente executa ambos em sequência.

Não ampliar permissões industriais indiscriminadamente. Definir quais transportes esse perfil pode concluir, autorizar apenas parâmetros permitidos ou explicar previamente a necessidade de administrador. Prova: perfil consegue completar seu fluxo autorizado ou é bloqueado antes de deixar cadastro parcialmente configurado.

Fonte: `auth.py::ROLE_PERMISSIONS`, `extra_routes.py::transport_config_set`, assistente de cadastro.

### CAD-11 — O frontend e backend resolvem porta de modem de formas diferentes

Prioridade: média. Frontend usa só metadata.admissionPort; backend também usa listen_port. Produção possui um modem aprovado com porta real e sem o metadado esperado.

Correção: normalizar o contrato de saída do modem, apresentar porta/origem claramente e usar a mesma regra nos dois lados. Prova: modem aprovado com porta explícita é selecionável, sem inventar porta para modem exclusivamente por IP.

Fonte: `generator-modem-onboarding.ts::modemAdmissionPort` e `main.py::generator_create`.

### CAD-12 — refresh falha, mas a edição fecha como concluída

Prioridade: média. Prova: PATCH gravou o nome; GET da lista foi simulado como 503; diálogo fechou. O provider sinaliza erro e stale, mas não propaga o resultado de atualização ao fluxo de salvamento.

Correção: distinguir Salvo de Tela atualizada e oferecer tentar atualização novamente. Não reenviar PATCH por uma falha só de leitura. Prova: registro é gravado uma vez; usuário recebe indicação correta de atualização pendente e consegue recuperar a lista.

Fonte: `GeneratorsProvider.tsx::refresh` e `GeneratorEditDialog.tsx::save`.

### CAD-13 — enabled pode ser alterado pelo PATCH genérico

Prioridade: média/alta, requer guarda consistente no servidor. Prova: identidade de gerador com Device atribuído recusou alteração direta com 409, mas enabled=false foi aceito com 200, mantendo Device atribuído. O caminho não chama o lifecycle.

A interface padrão usa reconfiguração, mas a API genérica ainda aceita esse campo fora dela. Correção: exigir lifecycle para estado operacional de gerador integrado, com política compatível para inventário não provisionado. Prova: PATCH genérico não deixa estado operacional divergente; retirada/reprovisionamento mantém histórico e vínculos. Não foi observado cadastro desativado com binding na produção atual.

Fonte: `GeneratorUpdate`, `main.py::generator_update`, `db.py::update_generator`.

### CAD-14 — Fechar cadastro em andamento não informa o resultado persistido

Prioridade: média. Prova junto de CAD-01: Escape fechou a janela com resposta retida, mas o gerador já existia no banco. Fechar uma janela não desfaz um commit; o problema é o usuário perder acompanhamento e poder repetir a operação.

Correção: impedir fechamento sem aviso durante o passo irreversível ou manter acompanhamento persistente da operação fora do modal. Prova: saída/reabertura mostra o resultado exato, sem promessa falsa de cancelamento e sem criação duplicada.

Fonte: `RegisterGeneratorButton.tsx::onOpenChange`, reset e onSubmit.

## Recursos ausentes e escolhas de produto

| Item solicitado/esperado | O que existe hoje | O que precisa ser definido |
|---|---|---|
| Foto própria do gerador | Imagens fixas de controladora e placeholder | Se desejado, implementar upload, validação, armazenamento, substituição, remoção, autorização e backup. |
| Salvar imagem | Nenhum campo/rota desse recurso encontrado no fluxo | Não apresentar botão funcional antes de existir persistência e recuperação real. |
| Nome/arquivo de diagrama personalizado | Diagrama gerado por topologia e telemetria | Definir se haverá documento anexado, desenho editável ou apenas topologia técnica. São funções diferentes. |
| Escolher topologia no cadastro | API aceita; formulários principais não expõem | Expor seleção homologada e indicar origem da topologia, com desconhecido neutro. |
| Escolher fonte por gerador | CSS e fallbacks do produto | Normalmente padronizar a tipografia; se personalizável, persistir em configuração própria sem misturar com identidade industrial. |
| Cliente/unidade vinculados | Campos textuais no cadastro; domínio separado de sites/clientes | Vínculo estável por ID, política para renomear unidade, migração e apresentação consistente. |
| Nominal/tanque na criação guiada | Disponíveis na API e edição; ausentes nos campos ativos de criação | Pedir dados reais quando conhecidos, aceitar ausência e mostrar origem: cadastro/controladora/N/D. |

Enviar `imageUrl` e `diagramName` num PATCH retornou 200, mas os campos foram ignorados. Isso confirma ausência de suporte nesse schema, não salvamento de imagem/diagrama. Rejeitar campos desconhecidos ajudaria a evitar falso entendimento de integração bem-sucedida.

## Matriz de checagem e aceite

Legenda: executado = prova desta auditoria; fonte = comportamento rastreado em código; pendente = ainda precisa de prova específica. Teste executado que caracteriza um bug não é aprovação do comportamento.

| Parte | Como conferir | Estado nesta auditoria |
|---|---|---|
| Versão de código | Git/main, HEAD VM e marker iguais | executado, alinhados |
| Integridade SQLite | quick/integrity e foreign_key_check | produção quick/FK e isolado integrity/FK aprovados |
| Nome Unicode | cadastrar, editar, consultar DB, espelho e reload | executado, correto |
| Espaços obrigatórios | POST/PATCH após trim | POST executado, bug; PATCH precisa regressão complementar |
| Tag repetida | repetir com diferença de caixa/espaços | executado, 409 correto |
| Porta/Unit/Device únicos | colisões nos transportes e no domínio | regressões backend existentes aprovadas |
| Digitação com polling | manter modal aberto por mais de 5 s | executado, correto |
| Cancelar edição não enviada | digitar e Escape; consultar DB | executado, não gravou |
| Etapas do assistente | dois Continuar não podem salvar | executado, bug |
| Resposta perdida na criação | erro após commit e repetir identidade | executado, bug de resultado ambíguo |
| Modem inválido no PATCH | conferir nome e vínculo antes/depois | executado, atualização parcial |
| Espelho assets/connections | mesmo ID, nome e identidade | produção e isolado conferem |
| Guardas do espelho | PATCH estrutural em asset/conexão espelhados | executado, 409 correto |
| Firmware de inventário | editar e rodar sync de domínio | executado, preservado |
| Nome cadastral no Rapid | comparar Device por número estável | executado, sete divergências |
| Modem antigo/novo | relações reais e metadata após troca | executado, bug; dois casos reais |
| Portas de modem | mesma resolução na UI e API | fonte + um caso real |
| Perfil visualização/operador | tentar cadastro | executado, 403 correto |
| Perfil cadastro serial | criar e salvar parâmetros de transporte | executado, 201 seguido de 403 |
| Nominal/tanque | salvar decimais e limpar para null | executado, persistência correta |
| Origem dos valores | separar leitura de valor cadastral | fonte inspecionada; aceitação visual completa pendente |
| Topologia explícita | PATCH genset_only e reload de armazenamento | executado, persistência correta |
| Relação de medição | ligar somente por measures | executado, bug de interpretação |
| Estado GCB desconhecido | não inventar aberto/fechado | contrato/código inspecionados; E2E dedicado é da validação anterior |
| Imagens estáticas | sete URLs e tipos de conteúdo | executado, HTTP 200 |
| Upload/foto por gerador | rota, schema, armazenamento e restauração | recurso não encontrado |
| Nome/arquivo de diagrama | persistência e reabertura | recurso não encontrado |
| Fontes | família CSS, fallback e visual por dispositivo | família computada verificada; uniformidade física pendente |
| Falha de atualização | GET 503 após PATCH bem-sucedido | executado, fecha com refresh pendente |
| Dois operadores | salvar formulários de versões diferentes | executado, perda silenciosa |
| Desktop/tablet/celular | rotas críticas, overflow e alvos touch | E2E Chromium existente executado, aprovado |
| Safari/iOS e painel físico | testar hardware/browser do cliente | pendente |
| Perda de comunicação | sessão Normal recente versus stale | guardas/regressões backend aprovadas; sem novo ensaio de campo |
| Reconfiguração com falha | restaurar configuração anterior | regressão backend existente aprovada; edição completa tem CAD-04 |
| Reabrir após reinício da API/VM | registro e operação continuam recuperáveis | não provocado na produção; ensaio dedicado pendente |
| Restauração completa | banco + configs + imagens futuras + Rapid | fora deste ensaio; continua pré-requisito de produto |

## Ordem proposta para correção

1. Frontend do cadastro: impedir submissão no Continuar e definir fechamento durante salvamento. Testes CAD-01/CAD-14 devem passar com expectativa corrigida.
2. Backend cadastral e persistência: validação após normalização, transação entre cadastro/vínculo/espelho, identificação da criação e política de concorrência. Separar PR de API/serviço e PR de banco/migração se a solução exigir ambos.
3. Inventário de modems: reconciliação dos dois lados, fonte única de vínculos e contrato consistente da porta. Auditar os dados legados antes de escrever na VM.
4. Edição/lifecycle: resultado coordenado e guarda server-side de enabled. Não alterar permissões industriais para resolver um problema de UI.
5. Topologia: contrato de relações elétricas, tipagem e seleção explícita no cadastro. Mudanças no resolvedor, UI e Rapid pertencem a domínios distintos conforme governança.
6. Rapid/rótulos: definir política de nome e sincronização segura sem mudar Device/Unit/canais/histórico.
7. UX de atualização e autorização: mensagens específicas de salvo/pendente/erro e fluxo coerente para perfil cadastro serial.
8. Recursos de produto: decidir foto/anexo/diagrama editável, fonte e vínculo formal de unidade; implementar apenas o que for realmente desejado e testar restauração.

Cada PR deve ter um domínio primário, reprodução, comportamento esperado, testes e rollback. Uma auditoria transversal não autoriza misturar todas as correções num PR. Os dados reais da VM precisam de reconciliação planejada, não preenchimento automático por inferência.

## Critério para declarar o cadastro pronto

Salvar precisa significar uma destas situações, sempre distinguíveis: rejeitado sem gravar; cadastro salvo com configuração explicitamente pendente; cadastro e configuração concluídos. Falha parcial deve indicar exatamente o que mudou e permitir recuperar a mesma operação.

Além disso: nenhum POST antes da confirmação final; ausência de valores técnicos inventados; nenhuma sobrescrita silenciosa entre operadores; nomes e vínculos seguindo política única; topologia baseada somente em relações elétricas homologadas; recarregamento e restauração preservando o cadastro; e provas por perfil, transporte e dispositivo suportado.

## Evidências e arquivos de continuidade

Repositório: https://github.com/paulohspdev-cmyk/ProjetoGerador

Baseline: https://github.com/paulohspdev-cmyk/ProjetoGerador/commit/afec24a685e23707d7d2c230f6a3e373a8cd8ff6

Arquivos principais examinados:

- `frontend/src/features/generators/RegisterGeneratorButton.tsx`
- `GeneratorEquipmentFields.tsx`, `GeneratorConnectionFields.tsx`, `generator-modem-onboarding.ts`
- `GeneratorEditDialog.tsx`, `GeneratorsProvider.tsx`, `GeneratorDetailScreen.tsx`
- `frontend/src/lib/api.ts`, `industrial-api.ts`, `http-client.ts`
- `frontend/src/assets/controllers.ts`, CSS de tipografia e cards
- `backend/app/main.py`, `schemas.py`, `db.py`, `auth.py`
- `domain_store.py`, `domain_routes.py`, `platform_store.py`, `transport_store.py`, `extra_routes.py`
- `backend/app/power_topology.py`, `rapid.py`
- `rapid/provisioning/provision_generator.py`
- `tests/e2e/functional-crud-audit.spec.ts`, `responsive.spec.ts`, `modem-fixture.ts`
- `backend/tests/reconfigure_transaction.py` e suíte backend existente

As provas de caracterização adicionais acompanham o registro da auditoria em `docs/audit/probes/registration_audit_probe.py` e `docs/audit/probes/registration-audit.spec.ts`. A segunda deve ser copiada para `tests/e2e/` em checkout isolado para resolver a fixture local. Não executar o harness E2E dentro do checkout vivo da produção.

Resultado: diagnóstico detalhado concluído para este escopo. Não significa cobertura exaustiva de todas as rotas, integrações, falhas elétricas, navegadores ou combinações de modelos/firmwares do produto. Os problemas acima permanecem abertos até correção e regressão com expectativas de comportamento correto.
