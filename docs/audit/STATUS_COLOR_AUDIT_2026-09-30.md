# Auditoria AZ-05 — status, cores e estabilidade visual

Data: 2026-09-30  
Produção observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Objetivo

Separar cor de saúde operacional, cor de modo, cor de presença elétrica e cor decorativa. Um operador não deve interpretar verde/amarelo/vermelho como condição industrial quando a aplicação não possui evidência para isso.

## Cadência observada

- O frontend atualiza a lista de geradores a cada 5 segundos.
- A próxima atualização só é agendada depois que a anterior termina; não foi encontrado polling concorrente no `GeneratorsProvider`.
- O backend Rapid usa cache curto de leitura (`RC_RAPID_CACHE_TTL` default 0,75 s).
- Em 12 composições consecutivas do backend, espaçadas em 1 s, nenhum gerador trocou de status/modo espontaneamente durante a janela de medição.

Conclusão: **não foi reproduzida oscilação espontânea no backend durante essa janela**.

## A05-001 — falha transitória de API força todos os cards atuais para stale

Em qualquer erro de `rcApi.generators.list()` diferente de 401, o `GeneratorsProvider` preserva os últimos valores mas altera cada gerador para:

- `telemetryStale=true`;
- todas as capabilities de comando = false;
- mensagem "Navegador sem atualização da API; dados exibidos são obsoletos."

Como `generatorDisplayStatus()` prioriza `telemetryStale`, a apresentação muda imediatamente para stale/offline. Na próxima leitura bem-sucedida, a lista inteira é substituída pelo payload normal.

Impacto: uma falha curta entre navegador e API pode trocar cores/estado de todos os cards mesmo sem mudança física na controladora.

Esta política é fail-safe para comandos, mas a transição visual precisa de contrato explícito. Deve haver teste para distinguir:

1. controladora sem comunicação;
2. Rapid sem leitura;
3. API/backend indisponível;
4. navegador sem conseguir atualizar.

Esses quatro estados não devem ser apresentados como se fossem necessariamente o mesmo defeito industrial.

## A05-002 — Compacto mistura "conectado" e "saudável"

`isGeneratorConnected()` retorna verdadeiro tanto para `online` quanto para `alerta`.

O `CompactCard` usa isso para aplicar:

`border-online/55 [box-shadow:var(--glow-online)]`

Ao mesmo tempo, quando `displayStatus === "alerta"`, aplica também `border-alert/50`.

Portanto um card em alerta pode carregar simultaneamente semântica visual de alerta e **glow verde de online**.

Contrato correto:

- conectividade é um eixo;
- saúde/alarme é outro eixo;
- um equipamento conectado com alarme não deve ganhar decoração que o operador interprete como "tudo OK".

## A05-003 — presença de valor elétrico vira verde no Compacto

Nas linhas elétricas do gerador:

`row.generator !== "—" ? "text-online" : "text-foreground"`

Isto significa que 0 V, 10 V, 220 V ou qualquer outro valor definido recebe verde apenas porque existe.

Impacto: verde representa presença do dado, não condição saudável.

Correção futura: valor sem limite/estado associado deve ser neutro. Verde somente quando houver semântica positiva explicitamente documentada.

## A05-004 — gauge de kW possui zonas 70/20/10 fixas sem limites industriais no pack

Tanto `CompactKwGauge` quanto `VerticalPowerGauge` desenham:

- verde: 0–70%;
- amarelo: 70–90%;
- vermelho: 90–100%.

Essas zonas são calculadas apenas como fração de potência nominal. Os Controller Packs auditados não fornecem `warningHigh` ou `criticalHigh` para `power_kw`.

Logo as cores do gauge são uma convenção gráfica não fundamentada em setpoint/limite homologado.

Enquanto não houver contrato industrial, o gauge deve ser tratado como escala de carga e não como indicação de normal/atenção/falha. A futura correção deve remover semântica de alarme implícita ou usar limites explicitamente configurados.

## A05-005 — MCB/GCB aberto é mostrado como alerta amarelo na Lista

`GeneratorTable.BreakerValue` usa:

- fechado conhecido = verde;
- aberto conhecido = amarelo;
- desconhecido = neutro.

Aberto não é necessariamente condição anormal. Dependendo da topologia e estado do grupo, pode ser o estado correto.

Conclusão: estado físico do disjuntor e severidade de alarme precisam ser independentes.

## A05-006 — cor de modo reutiliza cores de saúde

AUTO usa `text-online`, MANUAL usa `text-chart-2` e TESTE usa `text-alert`.

Isso não é necessariamente defeito funcional, mas cria ambiguidade: o mesmo verde de "online/saudável" também significa "modo AUTO", e amarelo de alerta também significa "TESTE".

Decisão recomendada para o contrato visual: modos devem possuir identidade visual própria, sem reutilizar cores reservadas a saúde/alarme.

## A05-007 — o status backend pode ser "online" mesmo com telemetria parcial

No overlay Rapid, se existe uma métrica classificada como saúde da controladora, `controller_ok=true`. Canais adicionais inválidos geram `health.telemetry="partial"` e `lastError`, mas o status principal ainda pode ser `online`.

Exemplo observado:

- GEN203: `status=online`, `health.telemetry=partial`, `lastError="Canais Rapid com valor inválido: fuel_level"`.
- GEN204: mesma condição.

Isso não precisa virar "alarme industrial", mas a UI deve conseguir mostrar "comunicação OK com dados parciais" sem simplesmente reduzir tudo a verde.

## A05-008 — GEN163 prova que status verde pode estar incompleto

GEN163 aparece como:

- `status=online`;
- `alarms=0`;
- modo AUTO.

Porém o executor DSE leu repetidamente `status=0x0400` (warning). O canal necessário não está no binding runtime.

Este não é um erro puramente visual; é um erro de completude da telemetria. A cor só pode ser tão correta quanto os sinais que chegam ao backend.

## Amostragem de estabilidade

Durante 12 amostras de 1 segundo:

- nenhum status mudou dentro da janela;
- nenhum modo mudou;
- nenhuma contagem de métricas definidas mudou.

Estados observados na janela:

- GEN132: não configurado;
- GEN152/153/154/163/167/203/204: online;
- GEN157/205/206: offline/stale no momento da amostragem.

Isso não contradiz observações anteriores de GEN205/206 online: apenas confirma que o estado físico/comunicação pode mudar ao longo das horas. A auditoria não deve transformar uma fotografia temporal em regra permanente.

## Contrato visual proposto para correções futuras

Usar quatro eixos independentes:

1. **Conectividade**: conectado / desconectado / desconhecido.
2. **Qualidade do dado**: fresh / partial / stale / invalid / no_data.
3. **Saúde industrial**: normal / warning / trip / alarm / desconhecido.
4. **Estado operacional**: OFF / MAN / AUTO / TEST / running / stopped / breaker open/closed.

Uma única cor de borda não deve tentar representar simultaneamente os quatro eixos.

## Critério para considerar AZ-05 fechado

- testes unitários da função de semântica;
- nenhum valor fica verde apenas porque existe;
- alerta conectado não recebe glow "OK";
- gauges sem limites homologados não usam verde/amarelo/vermelho como severidade;
- disjuntor aberto/fechado é estado, não severidade;
- falha transitória da API possui indicação distinta de perda de controladora;
- fixtures reais incluem online, partial, stale, alarm, warning e unknown.
