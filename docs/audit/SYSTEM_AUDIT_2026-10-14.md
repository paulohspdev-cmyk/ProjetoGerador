# RC Geradores — auditoria sistemática e matriz de cobertura

Data: 14/10/2026. Baseline congelada: `afec24a685e23707d7d2c230f6a3e373a8cd8ff6`.

## O que esta entrega estabelece

O sistema passou a ter um inventário rastreável de arquivos, APIs, telas, controles, formulários, tabelas, perfis e Controller Packs. Foram executadas verificações transversais de autorização, leitura, recuperação, integridade, navegador, dependências e operação. As duas auditorias recentes e o ledger histórico foram relacionados ao novo inventário.

**Esta é a primeira passada transversal da matriz completa. Não é uma declaração de que todo comportamento está aprovado nem de que todos os erros possíveis foram encontrados.** Cada ocorrência inventariada continua exigindo seu contrato e prova específica quando a verificação realizada não a cobre. Os estados pendentes permanecem visíveis, em vez de serem convertidos em aprovado pela existência de CI verde.

A entrega é exclusivamente auditoria/testes/governança. Não modifica runtime, dados cadastrais, bindings, templates ou serviços de produção. Não houve escrita Modbus, START/STOP, entrega externa de mensagem ou ativação de 2FA. O modelo permanece instalação independente por cliente.

## Escopo que agora pode ser contado e rastreado

| Superfície | Inventário | Evidência |
|---|---:|---|
| Arquivos versionados da baseline | **422** | `file_inventory.json`, incluindo código, configurações, assets, documentação e CI. |
| Rotas HTTP registradas | **132** | `api_inventory.json`; roteadores incluídos foram percorridos, não somente app.routes direto. |
| Entradas de navegação | **54** | `navigation_inventory.json`; dashboard e geradores têm tratamento próprio. |
| Telas do registry | **52** | `screen_registry.json`; diferença de duas entradas é explicada por dashboard/geradores, não rota ausente. |
| Ocorrências de controles JSX | **313** | `ui_inventory.json`; são ocorrências no código, não quantidade de botões renderizados ou ações aprovadas. |
| Formulários JSX | **28** | `form_inventory.json`. |
| Tabelas de aplicação | **50** | `database_inventory.json` e `production_inventory.json`; exclui tabelas internas SQLite. |
| Manifests de controladora | **17** | `pack_inventory.json`; produção e LAB separados pelo caminho. Não são 17 modelos homologados. |
| Packs de produção | **7** | Matriz técnica existente distingue produção/documentação/campo/capabilities. |

O inventário de controles inclui source, linha, tipo, rótulo estático quando disponível, handlers, campos required/disabled e demais atributos relevantes. Expressões dinâmicas e componentes reutilizados continuam exigindo observação em execução. Não se usa contagem estática para afirmar que todos os botões foram clicados.

O inventário de banco inclui colunas, chaves, índices e relacionamentos. Os nomes das 50 tabelas da instalação isolada coincidem com os da produção examinada. Isso não comprova sozinho a semântica de todo registro.

## Verificações executadas

| Prova | Resultado | O que isso realmente comprova |
|---|---|---|
| Baseline Git/VM/marker | alinhados em afec24a; checkout produtivo limpo | Ausência de drift rastreado na inspeção. |
| `npm run check` | aprovado após formatar o novo coletor de auditoria | Arquitetura, superfícies, lint, tipos e build; não todos os fluxos. |
| Suíte backend existente | **14 arquivos aprovados** | Regressões existentes de domínio, segurança, Rapid, transporte, comandos simulados, provisionamento e recuperação. |
| Navegador, suíte completa isolada | **30 testes aprovados** | 25 existentes + cinco caracterizações de cadastro. As caracterizações também passam quando reproduzem um defeito. |
| Matriz de autenticação/autorização | **354 casos: 352 passaram e dois falharam** | 349 casos de sessão/perfil/Bearer e cinco variações de header malformado; duas causam 500. |
| Consultas GET isoladas | **55**, sem erro 500 nesses requests | Inclui fixtures sem recursos/IDs; 404/401 não equivalem a aprovação funcional completa. |
| Recuperação determinística adicional | **10 cenários: nove aprovados e um contrato pendente** | Exclusividade de filas, leases, fencing, falha fechada de lifecycle, backup seguro, restrição de automação e schema. |
| Banco produtivo | integrity_check=ok; FK=0 | Integridade estrutural atual. |
| Backup produtivo mais recente | cerca de 17 h; arquivo diário de 13/10 | Frequência observada saudável, sem destino off-site configurado. |
| Restore de SQLite desse backup | ok/FK=0/17 geradores | Banco restaurado em diretório isolado; **não** restauração completa da VM. |
| Dependências Node do lock instalado | zero vulnerabilidades conhecidas no scanner | Fotografia do scanner em 14/10, não inexistência de vulnerabilidades desconhecidas. |
| Dependências Python de runtime da VM | zero vulnerabilidades conhecidas nos 32 pacotes pinados examinados | Pacotes reais da venv, com pip analisado separadamente. |
| Instalador Python da VM | pip 24.0 com advisories conhecidos | Pendência de ferramenta de instalação/deploy; não comprova exploração da API em execução. |
| Ensaio sintético de volume | arquivo `synthetic_capacity.json` | Amostra limitada sem Rapid/hardware; não certifica capacidade comercial. |

O scanner de pip apresenta registros repetidos: foram identificados **seis IDs únicos** para pip 24.0. A contagem bruta 12 não significa 12 vulnerabilidades distintas. O resultado foi mantido em `python_installer_audit.json`. Não houve atualização de pacote na produção durante a auditoria.

Os pacotes principais do ambiente local de prova foram alinhados aos da VM: FastAPI 0.141.1, Starlette 1.7.0, Pydantic 2.14.0, Uvicorn 0.54.0 e cryptography 50.0.2. O patch do Python local é diferente; o navegador completo foi executado na VM em ambiente separado. Essa diferença permanece registrada como limite.

## Matriz por área

| Área | Contratos examinados | Estado e próximo aceite |
|---|---|---|
| Navegação | slugs, registry, renderização, assets, rotas inexistentes | Suíte de navegação aprovada; individualizar ações dinâmicas dos 313 controles. |
| Cadastro/edição | normalização, duplicidade, confirmação, polling, cancelamento, commits parciais e concorrência | Defeitos CAD-01–CAD-14 permanecem abertos conforme relatório específico. |
| API web | sessão ausente, perfis recusados, dependências de autorização | Casos executados aprovados; regras de negócio e payloads de todos os endpoints ainda exigem contratos próprios. |
| API externa | Bearer, scopes, allowlists, revogação, expiração e origem | Guardas examinadas aprovadas; SYS-006 de header malformado reproduzido. |
| Banco/domínio | schema v5, FK, índices, espelho de assets/controladoras/conexões | Integridade e nomes de tabelas aprovados; vínculos lógicos conhecidos precisam de reconciliação. |
| Rapid/telemetria | stale, coleta parada, fonte constante, binding e dados desconhecidos | Regressões existentes aprovadas; não homologar comunicação física por serviço ativo. |
| Bridge/transporte | leitura isolada, compartilhamento de Units, concorrência, perdas simuladas | Suítes existentes aprovadas; ensaios de campo por modem/transporte/modelo pendentes. |
| Comandos | accepted versus confirmed, timeout, falha, exclusividade e homologação | Código/simulação aprovados nos cenários existentes; sem comando físico nesta sessão. |
| Lifecycle | operationId, pedido repetido, payload conflitante, uma operação por gerador, worker interrompido | Provas adicionais aprovadas; lifecycle não foi confundido com comandos físicos ou criação cadastral. |
| Scheduler/workers | lease, exclusividade e rejeição de resultado de worker antigo | Provas determinísticas aprovadas; reinício real/endurance dedicado ainda pendente. |
| Notificações | retry limitado, claim expirado, fencing e destinatário ausente | Recuperação aprovada; ausência de destinatários retorna sucesso da função — decidir skipped versus delivered. Entrega real pendente de configuração/autorização. |
| Automação | bloqueio de START/STOP/MCB/GCB no motor de regras | Ações industriais recusadas nos testes; validar regras não industriais de cada instalação sem fabricar estado. |
| Alarmes/histórico | regressões existentes, auditoria e retenção | Provas parciais presentes; catálogo físico e correspondência por firmware ainda exigem campo. |
| Backup/restore | arquivo seguro, traversal, symlink, SQLite e política periódica | Provas aprovadas; destino externo e recuperação completa continuam pendentes. |
| Segurança HTTPS | cookie, docs públicas, borda e permissões de arquivo/socket | Cookies seguros e guardas configurados; HSTS/CSP/nosniff/Referrer-Policy ausentes na resposta pública examinada. |
| Instalação/deploy | SHA, marker, preflight/rollback existentes e dependências | Produção alinhada; pip vulnerável é pendência de ferramenta; ensaio VM limpa/DR completo pendente. |
| Responsividade | celular, tablet, desktop, 4K e videowall 5760×2160 | E2E Chromium aprovado; Safari, hardware físico, leitores de tela e distância real de LED não certificados. |
| Performance | custo da listagem e payload sintético | Capacidade aberta; amostra não representa aquisição, snapshots, hardware, carga longa ou jobs simultâneos. |
| Governança/CI | fonte real, evidência, domínio e histórico | Coletores reprodutíveis criados; enforcement administrativo da branch não foi comprovado pela integração. |

## Novos resultados relevantes desta passada

### SYS-006 — Header Bearer malformado retorna 500

No TestClient, `Authorization: Bearer ` e `Authorization: Bearer   ` atingem `extra_routes.py::external_token` e provocam IndexError em `authorization.split(None, 1)[1]`. O contrato esperado é recusa 401. Sem header, token inválido e outras variantes examinadas foram recusadas corretamente.

Não foi demonstrado bypass de autorização, vazamento de credencial ou exploração da VM. A prova é do contrato isolado ASGI; normalização do servidor HTTP/proxy pode alterar o caminho em acesso real. Corrigir o parser defensivamente e acrescentar regressão por rota Bearer, incluindo string vazia, espaço, scheme errado e token válido. Não usar headers malformados para disparar comandos de campo.

### SYS-001 — Nenhum destinatário não é entrega externa comprovada

Sem webhook ativo e sem destination explícito, `_deliver_webhooks` retorna True com detalhe Nenhum webhook ativo para este evento. Isso precisa de decisão de contrato: skipped/no_destination deve ser distinguível de delivered/sent, se a UI e auditoria usam sucesso como comprovação de entrega.

Esse cenário não chamou rede. Não foi enviado email, WhatsApp ou webhook real. Não afirmar que uma mensagem foi entregue apenas porque a função retornou sucesso sem destinatários.

### SYS-002 — Ferramenta pip produtiva precisa de tratamento próprio

A venv produtiva usa pip 24.0. O scanner de pacotes pinados encontrou advisories desse instalador, enquanto não encontrou vulnerabilidades conhecidas nas dependências de runtime examinadas. O próximo trabalho é preparar um PR de instalação/deploy com versão de ferramenta aprovada e prova de instalação limpa/atualização/rollback; avaliar a atualização operacional sem modificar dependências da API indiscriminadamente.

Não tratar automaticamente a vulnerabilidade do instalador como uma API remotamente explorável. Tampouco ocultá-la no resultado runtime=zero.

### SYS-003 — Saídas das 132 APIs não têm response_model explícito

O inventário confirma None nas 132 rotas. Isso é uma lacuna de contrato, não 132 bugs automaticamente. Formalizar saídas, erros, enumerações, unidades, null versus ausente e compatibilidade, começando por cadastro, comandos e bootstrap. Descrever schemas de entrada não substitui schemas de saída.

### Operação e conectividade da auditoria

A conexão do agente da VM caiu durante uma coleta read-only complementar e depois voltou. Não foi concluído que a VM ou o produto tenham caído. Após reconexão, HEAD/marker e serviços foram conferidos novamente. Nenhum serviço produtivo foi reiniciado por esta auditoria.

### SYS-007 — Custo do overlay cresce com buscas repetidas no catálogo

Na amostra final isolada, quatro consultas simultâneas com 17 registros sintéticos tiveram mediana de 2,26 s e máximo de 2,40 s; com 100 registros, mediana de 13,83 s e máximo de 14,11 s. Foram somente quatro amostras por tamanho, sem aquisição Rapid real, snapshots ativos, rede física ou endurance. Não se publica p95 nem limite comercial a partir disso; hardware e condições do runtime local diferem da VM.

Uma prova adicional de CPU, com 100 registros não provisionados, mostrou 500 chamadas a `_controller_pack_inventory` e 9.500 chamadas a rglob nessa normalização. Isso localiza trabalho repetido de catálogo/arquivos como candidato real de otimização; não é só recomendação genérica de trocar banco. Ver `overlay_profile.json` e `profile_overlay.py`.

O próximo aceite é uma otimização por domínio com cache/invalidação corretos e repetição em ambiente comparável, incluindo registros provisionados, perda de fonte, usuários, trends e jobs. Não esconder falhas de pack/binding nem promover capabilities para acelerar a consulta.

## Como as auditorias anteriores entram nesta matriz

`original_audit_register.json` contém os 20 achados A01–A20 da auditoria de 10/10, consultada em sua versão atual, com estado revisado para a baseline de hoje. `issue_ledger.json` mantém os 37 IDs históricos BUG, os 14 IDs CAD e os novos SYS. São registros de rastreabilidade, **não quantidade de bugs únicos**: há sobreposições explicitadas.

- A01/A02/A07/A09/A10/A14 tiveram correções de código integradas em 11/10, com regressões. Alguns ainda exigem aceitação física ou evolução de acompanhamento.
- A11 foi tratado no Vertical; isso não aprova automaticamente o detalhe e todas as superfícies.
- A15 foi tratado no README/guia para os sete packs reais.
- A04 continua adiado por decisão expressa: 2FA permanece desativado.
- A06 sobre SaaS compartilhado não se aplica ao modelo atual de instalação independente por cliente.
- Os demais itens não são encerrados só pela idade do relatório ou por CI verde.
- Itens históricos não reproduzidos de novo ficam em reverificação, sem afirmar que ainda existem ou que já foram corrigidos.

O relatório detalhado de cadastro e suas provas permanecem no PR #235. A submissão antecipada em Continuar segue sendo a primeira correção funcional recomendada. A matriz atual não mistura correções de vários domínios num único PR.

## Como continuar e medir fechamento

Cada API tem ID API-xxx, cada controle UI-xxxx, cada tabela DB-xxx e cada manifest PACK-xxx. Para cada item, vincular contrato, casos de sucesso, rejeição, falha intermediária, repetição/concorrência quando aplicável, evidência, domínio e resultado. Executar apenas os casos pertinentes: uma imagem estática não precisa de transação de banco; um comando físico precisa de gates e feedback.

Estados oficiais:

1. **Inventariado**: existe e está localizado; comportamento ainda não certificado.
2. **Aprovado no cenário**: possui prova específica, com ambiente e limites registrados.
3. **Defeito reproduzido**: resultado contraria o contrato esperado.
4. **Decisão de contrato pendente**: comportamento existe, mas precisa de regra de produto explícita.
5. **Não implementado**: recurso realmente ausente; não confundir com botão quebrado.
6. **Pendente de ambiente/dados**: depende de destino externo, configuração, hardware ou navegador.
7. **Não aplicável / adiado por decisão**: modalidade e preferências do proprietário.

Não publicar um percentual único de sistema aprovado dividindo testes que passam por arquivos existentes. Testes, arquivos, rotas e botões são unidades diferentes. Uma rota pode ter dez casos aprovados e ainda falhar num décimo primeiro.

### Sequência de correções por domínio

1. Cadastro frontend: CAD-01 e CAD-14; exigir zero POST nos dois Continuar e confirmação final explícita.
2. API externa: SYS-006; parser Bearer robusto e recusa 401, com prova HTTP isolada complementar.
3. Backend cadastral/banco: CAD-02/CAD-03/CAD-05/CAD-06; evitar commit invisível, validação após trim e sobrescrita silenciosa. Migração/serviço em PRs encadeados se necessário.
4. Modems: CAD-07/CAD-11 e reconciliação dos dados legados auditados.
5. Lifecycle/edição: CAD-04/CAD-10/CAD-13; coordenar resultado parcial e política de permissão.
6. Topologia e nomes: CAD-08/CAD-09; somente relações elétricas homologadas e política de rótulo Rapid.
7. UX/contratos: CAD-12, schemas de saída e decisões de imagem/diagrama/fonte.
8. Instalação/segurança: ferramenta pip, proxy real, off-site e restauração completa.
9. Capacidade, endurance, navegadores e aceitação física por instalação/modelo/firmware/transporte.

O fechamento de cada defeito exige reprodução antes da correção, teste com expectativa correta depois, verificação dos fluxos relacionados, registro da release e rollback. Caracterização do defeito não deve se tornar requisito permanente de CI: quando o comportamento for corrigido, a expectativa precisa refletir o contrato correto.

## Evidências e reprodução

Diretório: `docs/audit/system-2026-10-14/`.

- Inventários: `api_inventory.json`, `ui_inventory.json`, `form_inventory.json`, `navigation_inventory.json`, `screen_registry.json`, `database_inventory.json`, `file_inventory.json`, `pack_inventory.json`.
- Provas: `authorization_results.json`, `read_results.json`, `recovery_results.json`, `synthetic_capacity.json`.
- Produção/segurança: `production_inventory.json`, `production_python_packages.json`, `npm_audit.json`, `python_runtime_audit.json`, `python_installer_audit.json`.
- Histórico: `original_audit_register.json`, `issue_ledger.json`.
- Coletores: `scripts/audit/system_inventory.py`, `frontend_inventory.mjs`, `recovery_matrix.py`, `synthetic_capacity.py`.

Executar os coletores somente em checkout de auditoria, com Python de testes separado. system_inventory cria banco temporário e escreve evidências no diretório docs/audit. Seu exit code 1 é esperado na baseline enquanto os dois defeitos de Bearer permanecerem; os arquivos são gravados antes do exit. Não ignorar novas falhas para fazer o coletor ficar verde.

O harness de navegador deve continuar em clone/checkout isolado. Ele faz build e cria serviços temporários; não executá-lo na árvore viva `/opt/rc-geradores`. A prova de restore desta sessão extraiu somente SQLite para pasta temporária; não executar restore na produção ativa.

## Limites explícitos

Ainda não há aprovação funcional individual de todos os 313 controles e de todos os payloads possíveis das 132 APIs. Há inventário completo dessas superfícies e prova transversal dos cenários descritos. Não foram executados pentest completo, reinício deliberado da VM produtiva, restauração completa, comandos físicos, entrega externa real ou homologação universal de dispositivos.

A ausência de destino externo/proxy separado/dados de campo impede fechar seus itens. A falta de prova individual dos demais contratos é trabalho de teste/correção a continuar pela matriz, não dependência externa inventada. Esta distinção evita declarar tudo pronto ou esconder cobertura faltante.
