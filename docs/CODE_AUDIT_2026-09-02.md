# Auditoria integral — 2026-09-02

Documento vivo da revisão arquivo por arquivo do RC Geradores. A produção permanece
pinada enquanto os lotes abaixo não passarem por CI, segurança, preflight e smoke.

## Achados confirmados

| Prioridade | Área | Achado | Tratamento |
|---|---|---|---|
| Crítica | Comunicação | Contadores de reconexão reiniciavam junto com o processo e não havia histórico de quedas | Persistir transições de disponibilidade por porta e exibir causa provável com evidências |
| Alta | Telemetria | Equipamento offline perdia horímetro, manutenção e última leitura | Snapshot persistente, marcado como histórico e proibido para animação/comando |
| Alta | Cadastro | Nome salvo era ignorado pelos cards; modelo sem perfil podia terminar sem configuração | Usar nome real e exigir perfil de produção no fluxo automático |
| Alta | Exclusão | A rota DELETE simples ainda pode contornar o ciclo seguro de retirada | Bloquear exclusão direta de equipamento provisionado e testar limpeza operacional |
| Alta | Interface | Paginação fixa não aproveitava TV/notebook | Capacidade calculada pelo espaço disponível |
| Média | Produto | Nomes de fornecedor/infraestrutura e resíduos do gerador inicial apareciam no produto | Remover integração residual e aplicar vocabulário RC Geradores |
| Média | Controladoras | Fontes Modbus, templates e evidências estão parcialmente dispersos | Adotar pacote autocontido por modelo e migrar sem quebrar os manifests existentes |
| Média | Mapa | Depende de coordenadas e vínculo por nome da unidade; falha não orienta correção | Validar cadastro, vínculo estável e estados de erro/vazio |
| Média | Navegação | Seções recolhidas podem ser interpretadas como menus ausentes | Revisar persistência, descoberta e testes de todas as rotas por perfil |

## Fechamento do lote PR #48

O lote de conectividade e cadastro industrial foi concluído no branch
`fix/auditoria-funcional-profissional` com os seguintes pontos:

- tipos de conexão modelados para TCP reverso, Modbus TCP direto/VPN e RTU sobre TCP;
- editor administrativo com nome, transporte, IP/gateway, porta TCP e Unit ID;
- reconfiguração transacional de gerador provisionado, com deprovisionamento,
  reprovisionamento e rollback automático em caso de falha;
- descoberta TCP somente leitura restrita a IPv4 privada roteada, sem envio de
  quadros Modbus e sem escrita industrial;
- exclusão direta bloqueada quando há integração industrial ativa e retirada
  segura disponível com confirmação explícita;
- testes automatizados de descoberta, conectividade, resiliência de telemetria e
  rollback de reconfiguração;
- CI e Quality/Security verdes no SHA final do lote antes do merge.

A auditoria ampla do produto continua viva. Itens como evolução do vínculo do mapa
por identificador estável, expansão de Controller Packs e homologações adicionais
não fazem parte da liberação funcional deste lote e não habilitam comandos novos.

## Critério de conclusão 10/10

- Nenhum dado simulado apresentado como real.
- Nenhum comando habilitado sem homologação explícita.
- Causa de indisponibilidade sustentada por linha do tempo e fatos observáveis.
- Cadastro, edição, provisionamento e retirada testados de ponta a ponta.
- Todas as rotas e permissões testadas nos tamanhos celular, notebook e TV.
- Mapas, telemetria, histórico, manutenção e relatórios com estados vazio/erro/offline.
- Zero segredo, artefato gerado, dependência residual ou marca de ferramenta no produto.
- CI, auditoria de dependências, preflight, backup e smoke verdes antes do deploy.
