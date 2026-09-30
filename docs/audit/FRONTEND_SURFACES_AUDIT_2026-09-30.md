# Auditoria AZ-02/AZ-03/AZ-04 — superfícies de frontend

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Escopo

- Vertical;
- Compacto;
- Lista;
- `GeneratorsBoard`;
- comportamento de layout por viewport/filtro/página;
- cobertura E2E existente.

Nenhuma alteração funcional foi aplicada nesta auditoria.

## Tamanho e concentração atuais

- `GeneratorsBoard.tsx`: 537 linhas
- `PowerFlowCard.tsx`: 424 linhas
- `CompactCard.tsx`: 380 linhas
- `vertical-reference-card.css`: 1352 linhas
- `compact-card.css`: 106 linhas

O Vertical já possui subcomponentes, mas o CSS continua concentrando múltiplas responsabilidades. O board continua contendo algoritmos de Vertical e Compacto no mesmo arquivo.

## A02-001 — altura do Vertical muda conforme quantidade de cards visíveis

O layout Vertical calcula primeiro uma grade pelo viewport.

Depois, para renderizar a página atual, recalcula:

`displayRows = min(rows, ceil(visible.length / displayColumns))`

e então:

`cardHeight = usableHeight / displayRows` (descontando gaps).

Consequência:

- mesma resolução;
- mesmo tipo de card;
- mesmo gerador;

pode receber outra altura apenas porque:

- mudou o filtro;
- mudou a página;
- a última página tem menos itens;
- um equipamento entrou/saiu da lista filtrada.

Isso faz o mesmo Vertical mudar de geometria sem o operador solicitar mudança de layout.

### Efeito adicional

O Vertical usa container query:

`@container vref (max-height: 780px)`

Quando a altura cruza esse limite, várias linhas, gaps, gauges e tipografias mudam de regra CSS.

Portanto a mudança de quantidade de cards pode causar não só card maior/menor, mas também ativar/desativar outro conjunto de estilos internos.

## A04-001 — filtro usa status bruto, card usa display status

O board filtra assim:

`generator.status === status`

Porém os cards e `StatusPill` usam `generatorDisplayStatus()`, que transforma qualquer gerador com `telemetryStale=true` em `stale`.

Consequência possível:

- `generator.status = online`;
- `telemetryStale = true`;
- card mostra "SEM COMUNICAÇÃO";
- ainda assim ele pode permanecer no filtro "ONLINE".

O filtro deve utilizar a mesma semântica de exibição/status operacional adotada pelo restante da interface.

## A04-002 — Vertical e Compacto compartilham o mesmo núcleo de paginação/layout

`GeneratorsBoard.tsx` contém simultaneamente:

- constantes mínimas do Vertical;
- cálculo de colunas/linhas do Vertical;
- lista de layouts preferidos do Compacto;
- cálculo do Compacto;
- paginação;
- estilos CSS variáveis das duas grades.

Isso viola a fronteira desejada: modificar algoritmo de uma visualização exige tocar no arquivo que controla a outra.

Refatoração futura deve separar, sem mudança visual:

- `vertical-layout.ts`;
- `compact-layout.ts`;
- paginação compartilhada somente quando realmente neutra.

## A03-001 — Compacto possui layout independente, mas sem teste E2E específico

Foi encontrada cobertura E2E detalhada do Vertical, incluindo geometria/responsividade.

Não foi encontrada suíte equivalente dedicada ao Compacto cobrindo:

- dimensões;
- número de colunas/linhas;
- valores N/D;
- stale;
- cores;
- filtros;
- última página;
- ausência de overflow.

Antes de refatorar o Compacto, criar baseline E2E própria.

## A02-002 — mensagem de comando não altera geometria, mas permanece sobre o card

`.vref-command-message` usa `position:absolute`.

Portanto o bug da mensagem que não some **não é a causa da mudança de altura do card**.

Ela fica sobreposta no centro do Vertical e pode encobrir conteúdo enquanto permanecer visível.

Isto separa dois defeitos:

- BUG-001: TTL ausente;
- layout dinâmico do Vertical: cálculo de altura por quantidade de itens visíveis.

## A02-003 — Vertical possui breakpoints internos dependentes do tamanho do próprio card

Container queries atuais:

- largura mínima 250 px;
- largura mínima 285 px;
- altura máxima 780 px.

Isso é válido como técnica responsiva, mas significa que qualquer alteração externa no tamanho do card pode trocar regras internas.

Conclusão: o algoritmo de grade e o CSS do card precisam ser tratados como um contrato conjunto, com testes em pontos imediatamente abaixo/acima de cada threshold.

## A03-002 — Compacto troca layout por lista de combinações preferidas

O Compacto testa sequencialmente layouts como:

- 6x3;
- 9x2;
- 3x6;
- 5x4;
- ...

e escolhe o primeiro que satisfaz:

- largura mínima 160 px;
- altura mínima 156 px.

Uma pequena alteração no viewport pode trocar completamente a matriz escolhida.

Isso não é necessariamente defeito, mas precisa de testes de thresholds para evitar saltos inesperados.

## A04-003 — cobertura E2E não cobre stale/status filter

Na busca da suíte E2E atual não foram encontradas verificações explícitas de:

- `telemetryStale`;
- texto "SEM COMUNICAÇÃO";
- consistência entre filtro ONLINE e status visual;
- TTL de `vref-command-message`.

Esses cenários devem entrar na matriz de regressão antes das correções.

## Contrato futuro de layout

### Vertical

- tamanho deve depender do viewport e da configuração de visualização, não da quantidade de itens na última página;
- filtrar geradores não deve redimensionar todos os cards restantes;
- última página mantém geometria das páginas anteriores;
- thresholds de container query têm testes dedicados.

### Compacto

- algoritmo próprio isolado;
- thresholds documentados e testados;
- última página não altera dimensões dos cards;
- nenhuma mudança no Compacto ao alterar Vertical.

### Lista

- usa o mesmo status de display dos cards;
- breaker aberto/fechado não implica severidade sem contrato.

## Critério de fechamento

- funções de layout extraídas por domínio;
- testes antes/depois provam ausência de mudança visual involuntária;
- filtro usa display status coerente;
- Vertical não redimensiona por `visible.length`;
- Compacto possui E2E dedicado;
- stale, filtros e última página cobertos;
- qualquer mudança em Vertical é bloqueada se alterar Compacto e vice-versa.
