# Contrato responsivo — RC Geradores

A interface deve funcionar sem corte de conteúdo e sem overflow horizontal da página em celular, tablet, notebook, desktop e TV.

## Regras

- Cards completos de gerador usam grade automática baseada em largura mínima real do card, não quantidade fixa de colunas.
- Em telas estreitas, um Power Flow Card ocupa uma linha inteira.
- Grades e listas podem rolar dentro de sua área, mas o viewport não deve ganhar overflow horizontal.
- Toolbars podem quebrar para uma segunda linha em telas pequenas.
- KPIs usam uma coluna em celulares estreitos e aumentam progressivamente.
- Painéis compartilhados mantêm `min-width: 0`; ações podem rolar horizontalmente quando necessário.
- Tabelas industriais preservam todas as colunas por rolagem horizontal local, sem esmagar dados.
- Breakpoints de telas grandes continuam permitindo uso em monitores e TVs, sem limitar artificialmente a uma grade móvel.

## Faixas de referência

- celular estreito: 320–419 px
- celular/tablet pequeno: 420–767 px
- tablet/notebook: 768–1279 px
- desktop: 1280–1919 px
- TV/monitor grande: 1920 px ou mais

O layout não depende de valores simulados nem altera qualquer regra de telemetria ou comando industrial.
