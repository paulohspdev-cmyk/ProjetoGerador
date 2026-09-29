# Auditoria funcional completa — 2026-09-29

Escopo: frontend, backend, persistência, navegação, formulários e guardrails do RC Geradores. A auditoria não envia START/STOP/MCB/GCB/paralelismo para equipamento real.

## Resultado por menu

| Grupo       | Menu                        | Rota                       | Verificação                                                                               |
| ----------- | --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Operação    | Resumo Operacional          | `/`                        | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Operação    | Geradores                   | `/p/geradores`             | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Operação    | Centro de Operações         | `/p/central-de-operacao`   | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Operação    | Alarmes                     | `/p/alarmes`               | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Operação    | Eventos                     | `/p/eventos`               | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Operação    | Mapa                        | `/p/mapa`                  | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Operação    | Visão por unidade           | `/p/sites`                 | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Comunicação | Modems                      | `/p/modems`                | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Comunicação | Conectividade               | `/p/conectividade`         | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Comunicação | Gateways                    | `/p/gateways`              | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Comunicação | Comunicação                 | `/p/comunicacao`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Energia     | Rede                        | `/p/energia-rede`          | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Energia     | Geradores                   | `/p/energia-geradores`     | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Energia     | Carga                       | `/p/energia-carga`         | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Energia     | Transferência               | `/p/energia-transferencia` | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Energia     | Paralelismo                 | `/p/energia-paralelismo`   | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Manutenção  | Manutenção                  | `/p/manutencao`            | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Manutenção  | Combustível                 | `/p/combustivel`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Manutenção  | Baterias                    | `/p/baterias`              | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Manutenção  | Horímetros                  | `/p/horimetros`            | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Manutenção  | Agenda                      | `/p/agenda`                | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Manutenção  | Histórico                   | `/p/historico`             | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Manutenção  | Relatórios                  | `/p/relatorios`            | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Gestão      | Clientes                    | `/p/clientes`              | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Gestão      | Unidades                    | `/p/unidades`              | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Automação   | Regras                      | `/p/regras`                | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Automação   | Exercício automático        | `/p/exercicio-automatico`  | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Automação   | Agendamentos                | `/p/agendamentos`          | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Automação   | Notificações                | `/p/notificacoes`          | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Automação   | Escalonamento               | `/p/escalonamento`         | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | Tendências                  | `/p/tendencias`            | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Canais                      | `/p/canais`                | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Tags                        | `/p/tags`                  | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Templates                   | `/p/templates`             | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Motor de telemetria         | `/p/rapid-scada`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Diagnóstico                 | `/p/diagnostico`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Fabricantes                 | `/p/fabricantes`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Biblioteca de controladoras | `/p/lib-controladoras`     | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Protocolos                  | `/p/protocolos`            | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Perfis homologados          | `/p/controller-packs`      | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Laboratório                 | `/p/laboratorio`           | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | API                         | `/p/api`                   | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Webhooks                    | `/p/webhooks`              | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | E-mail                      | `/p/email`                 | CARREGA / BLOQUEADO POR CONFIGURAÇÃO — SMTP não configurado; teste fica desabilitado.     |
| Sistema     | WhatsApp                    | `/p/whatsapp`              | CARREGA / BLOQUEADO POR CONFIGURAÇÃO — WhatsApp não configurado; teste fica desabilitado. |
| Sistema     | ERP / BMS / outros          | `/p/erp-bms`               | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | Usuários                    | `/p/usuarios`              | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | Perfis e permissões         | `/p/perfis`                | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Controladoras               | `/p/controladoras`         | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | Configurações               | `/p/configuracoes`         | CARREGA + RBAC + troca de senha exercitada em conta E2E temporária e restaurada ao final  |
| Sistema     | Saúde do sistema            | `/p/saude`                 | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Backups                     | `/p/backups`               | CARREGA + fluxo de escrita coberto em ambiente isolado                                    |
| Sistema     | Auditoria                   | `/p/auditoria`             | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |
| Sistema     | Versão                      | `/p/versao`                | CARREGA / leitura, filtros ou visualização sem erro de API/console                        |

## Fluxos de escrita exercitados

- Clientes e unidades: criar, editar, ativar/desativar e excluir.
- Agenda: criar, editar, cancelar/reativar e excluir.
- Modems e gateways: criar, editar, ativar/desativar e excluir.
- Webhooks e ERP/BMS: criar, editar quando aplicável e excluir.
- Manutenção: criação de plano para gerador de fixture.
- Regras: criar, aprovar+ligar somente regra não industrial, desligar e excluir.
- Exercício automático: apenas planejamento; nenhum START é emitido.
- Agendamentos e escalonamento: criar, pausar, editar quando aplicável e excluir.
- Relatórios: criação/download/exclusão; CSV, XLSX e PDF também validados no backend.
- Notificações: painel interno e processamento da fila.
- Controladoras/assets: criar, editar firmware, desativar e excluir respeitando lifecycle.
- Backups: criar, validar resultado OK, baixar e excluir no ambiente isolado.
- Usuários: CRUD pela UI e 2FA pela UI em conta temporária.
- Configurações: RBAC e troca de senha exercitados pela UI em conta E2E temporária; a senha original foi restaurada ao final.
- API: persistência/autenticação/allowlist/revogação de token validada no backend isolado.
- Geradores: cadastro sem pack production validado como NÃO CONFIGURADO e comandos bloqueados.

## Defeitos encontrados e corrigidos

1. `frontend/public` não era empacotado pelo Nitro; login/hero/favicon/imagens de controladoras davam 404. `vite.config.ts` agora registra `frontend/public` em `publicAssets`.
2. O cadastro embutido de Controladoras atualizava um estado local mas não o lifecycle pai imediatamente. O componente agora propaga `onChanged`.
3. Ações do lifecycle podiam parecer clicáveis durante outra mutação, embora `run()` ignorasse a ação por `busy`. Botões ficam desabilitados enquanto há mutação em andamento.
4. O E2E de card vertical dependia de dados reaproveitados e podia falhar no GitHub. Os fixtures agora são únicos por viewport e confirmados pela API.

## Dependências que não podem ser declaradas como concluídas pela auditoria de software

- E-mail e WhatsApp: sem provedor/credenciais reais configurados; a UI bloqueia corretamente o teste.
- Backup off-site: requer armazenamento remoto real.
- 2FA privilegiado obrigatório: requer enrollment real das contas administrativas antes de ativar enforcement.
- START/STOP/AUTO/MAN/TEST/MCB/GCB/paralelismo: não foram enviados a equipamentos reais. O software mantém os gates de pack, firmware, capability, binding e executor.
- Modelos/firmwares sem Controller Pack production continuam registration/LAB e não ganham comando por inferência.

## Critério de aprovação

A auditoria é considerada aprovada quando `npm run check`, a suíte backend e a suíte E2E completa passam no mesmo commit e esse commit é implantado na VM com smoke aprovado.
