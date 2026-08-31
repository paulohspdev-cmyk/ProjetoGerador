# InteliGen 200 — export do mapa Modbus específico do archive

## Por que este arquivo existe

A InteliGen 200 possui objetos de comunicação (`Com.Obj`) estáveis, mas a tradução desses objetos para endereços Modbus da faixa configurável depende da configuração/archive carregado no controlador.

O arquivo de archive `tabela IG200(1).txt` documenta os objetos, tipos, unidades, casas decimais e offsets internos. Ele **não** contém a definição `Modbus register <-> controller object` necessária para provisionar novos canais no Rapid SCADA.

Não copiar o mapa padrão de outro archive e não calcular endereços a partir dos offsets de `Values I/II/III` ou `History Record`.

## Fonte oficial

O Global Guide da ComAp para InteliGen 200 descreve:

- valores Modbus configuráveis na faixa 1000..2999;
- setpoints na faixa 3000..3999;
- o mapa real depende da configuração;
- a definição Modbus pode ser exportada pelo InteliConfig em formato legível;
- funções 03/04 são usadas para leitura dos valores.

O próprio InteliConfig possui a tela de definição Modbus que conecta `MODBUS register <-> controller object` e oferece a ação **Export MODBUS definition to file**.

## Como gerar o arquivo que falta

1. Abra o InteliConfig.
2. Conecte à InteliGen 200 ou abra offline o **mesmo archive** usado nela.
3. Abra **Controller configuration**.
4. Abra a definição/configuração **MODBUS**.
5. Não altere nem importe nenhum mapa.
6. Use **Export MODBUS definition to file**.
7. Salve o arquivo exportado e adicione-o ao trabalho de homologação.

O arquivo necessário deve mostrar, para os valores configurados, os endereços Modbus e seus objetos ComAp. Exemplos de informações esperadas:

- endereço/register;
- `Com.Obj`;
- nome do valor;
- tipo/tamanho;
- `Dec`/escala;
- unidade.

## Objetos prioritários do archive atual

| Métrica | Com.Obj | Unidade |
| --- | ---: | --- |
| RPM | 10123 | rpm |
| Generator kW | 8202 | kW |
| Generator Frequency | 8210 | Hz |
| Generator Current L1/L2/L3 | 8198 / 8199 / 8200 | A |
| Battery Volts | 8213 | V |
| Fuel Level | 9153 | L |
| FuelRate | 10154 | L/h |
| T-Coolant | 10155 | °C |
| P-Oil | 10157 | bar |
| Load | 10159 | % |
| Running Hours | 8206 | h |
| EngineRunHours | 10173 | h |
| D+ | 10603 | V |

## Mapa de campo já homologado

Estes canais permanecem provisionáveis independentemente do export pendente porque já foram comprovados na instalação real:

- RPM: register 1000;
- generator voltages: 1036..1041;
- frequency: register 1045, escala de campo 0,01;
- battery voltage: register 1083, escala de campo 0,1 V.

A diferença entre o mapa de campo e exemplos genéricos da documentação é esperada porque a parte configurável do mapa depende do archive.

## Regra de promoção

Somente adicionar um novo canal ao template Rapid quando houver:

1. objeto documentado no archive;
2. endereço presente no export Modbus do mesmo archive;
3. leitura read-only coerente no GEN005;
4. CI e Quality/Security verdes.

Comandos industriais não fazem parte desta etapa. START/STOP continuam sendo os únicos comandos homologados; AUTO/MANUAL/TEST/MCB/GCB/paralelismo permanecem bloqueados.
