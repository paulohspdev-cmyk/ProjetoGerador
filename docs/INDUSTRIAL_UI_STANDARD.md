# RC Geradores — Padrão Visual Industrial

Este documento congela a linguagem visual do produto a partir do Industrial Console v3.

## Princípios

- O sistema é um console operacional, não uma landing page.
- Estado e legibilidade têm prioridade sobre decoração.
- Laranja identifica ação/seleção; verde indica estado saudável confirmado; amarelo indica atenção; vermelho indica falha/bloqueio; azul indica informação.
- Não usar cor para “embelezar” dados sem significado operacional.
- Números de processo usam dígitos tabulares.
- N/D, offline, stale e bloqueado devem ser explícitos; nunca inventar telemetria.

## Hierarquia

- Topbar: contexto da tela, busca, estado da plataforma, alarmes e usuário.
- Sidebar: grupos funcionais e navegação. Apenas o grupo ativo fica aberto automaticamente.
- Painel: cabeçalho técnico compacto com barra laranja à esquerda.
- KPI: rótulo técnico curto, valor dominante e contexto secundário.
- Tabela: cabeçalho fixo, texto compacto e linhas com contraste discreto.

## Geometria

- Raio padrão: 4–6 px.
- Sombras mínimas; bordas definem separação.
- Sem cartões “flutuando” ou animação de elevação em dados estáticos.
- Densidade deve favorecer operação em desktop e wallboard sem reduzir texto abaixo da faixa legível.

## Comandos

- Ações industriais devem mostrar somente estados reais: disponível, indisponível, enviando, aceito, confirmado, rejeitado ou timeout.
- Botão visível não significa comando liberado. A capability do Controller Pack continua sendo a autoridade.
- Comandos de disjuntor e paralelismo permanecem visualmente bloqueados enquanto não homologados.

## Implementação

A camada autoritativa está em `src/styles/industrial-console.css`, importada por último em `src/styles.css`.
Componentes compartilhados usam classes `rc-*`; novas telas devem reutilizar `ScreenBody`, `Panel`, `Stats`, `Pill`, `ScadaTable` e `ActionBtn` antes de criar estilos próprios.
