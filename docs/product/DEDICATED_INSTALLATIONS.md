# Instalações independentes por cliente

Decisão do proprietário em 2026-10-11: cada cliente recebe sua própria instalação RC Geradores. Não implementar banco compartilhado, tenancy SaaS ou cobrança recorrente dentro do produto nesta etapa. O 2FA permanece desativado por decisão explícita; não ativá-lo automaticamente no deploy.

## Unidade de instalação

Uma VM dedicada por cliente, com banco, configuração, usuários, chaves, Rapid SCADA, bindings, bridge, backups e domínio próprios. Distribuir a mesma release de código, sem copiar banco e credenciais de outro cliente. Cada instalação registra seu SHA exato em `/var/lib/rc-geradores/deployed-commit`.

## Preparação de cada cliente

1. Definir domínio/HTTPS e instalar dependências conforme os runbooks existentes em `ops/` e `infrastructure/`.
2. Criar configuração própria em `/etc/rc-geradores.env`, protegida; configurar `RC_ENVIRONMENT=production`, URL pública, cookies seguros e CIDRs reais. Preservar `RC_2FA_ENFORCED=0` nesta etapa e os caminhos LAB desativados.
3. Criar usuários e permissões da instalação, com credenciais próprias. Administradores acessam configuração privada/backups/webhooks; demais perfis recebem somente dados autorizados.
4. Cadastrar os equipamentos reais: modelo, firmware, modem/transporte, Unit ID, identidade Rapid, potência nominal, tanque e topologia elétrica conhecidos. Informação ausente permanece N/D; não preencher valores técnicos por estimativa.
5. Usar Controller Pack e canais correspondentes ao equipamento. Não promover capability industrial por semelhança de modelo. Executar checker pack/binding e preflight antes de provisionar/deploy.
6. Validar o diagnóstico nativo do Communicator: pasta por padrão `/var/log/scada/ScadaComm/Log`, cabeçalho `Status: Normal`, `Session time` no fuso do host. Em produção, arquivo ausente/ilegível, sessão indefinida/expirada ou coletor indisponível não comprovam telemetria atual. Ajustar `RC_RAPID_COMM_LOG_DIR` e idade máxima somente após medir o ciclo real de polling.
7. Configurar backup diário e um destino externo real, com teste de recuperação isolado. Diretório no mesmo disco não é backup off-site. Configurar integrações de notificação apenas com destinatários e credenciais definidos pelo cliente.
8. Implantar SHA aprovado com `ops/deploy_release_v2.sh`; conferir smoke, marker, banco, serviços, bindings e configurações preservadas. Guardar o backup transacional para rollback.

## Aceitação operacional

- API/frontend autenticados, RBAC e recuperação de senha validados na instalação.
- Fonte realmente atual distingue coleta viva, perda de transporte, sessão congelada e retomada; consultas HTTP não renovam a hora da coleta.
- START/STOP aceitos no protocolo só aparecem como confirmados com feedback homologado. Testes automatizados usam transporte simulado; validação física exige procedimento de campo separado, intertravamentos e operador responsável.
- Verificar celular/tablet/desktop/painel nas resoluções, orientação e navegador que o cliente utilizará. E2E de Chromium cobre geometria e videowall até 5760x2160; Safari e hardware físico ainda precisam de aceitação específica.
- HTTPS/proxy externo e restauração completa precisam ser comprovados no ambiente do cliente. Registrar pendências, SHA, evidências e rollback; checks de código não substituem homologação de campo.

## Evolução pendente

Idempotência persistente por operation ID e acompanhamento assíncrono de comandos, contratos de resposta tipados para todas as rotas e validação de carga por tamanho de frota permanecem evoluções separadas. A instalação dedicada não elimina autorização por perfil ou a necessidade de uma fonte industrial confiável.
