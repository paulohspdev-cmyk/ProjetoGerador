# DSE GenComm model evidence

Esta matriz registra quais produtos DSE podem usar o pack compartilhado **GenComm/Modbus somente leitura**.

## Regra de admissão

Um modelo entra no pack compartilhado somente quando:

1. a área oficial de downloads da Deep Sea Electronics associa o produto ao **Gencomm Control Keys (056-051)** ou a documentação oficial equivalente;
2. o equipamento é uma controladora primária de grupo gerador, não apenas ATS, mains, display remoto, sync-lock ou bus-tie;
3. o conjunto de registradores usado pelo pack é compatível com a família documentada.

`status: production` neste pack significa **provisionamento de telemetria read-only documentada**. Não significa validação de campo e não libera escrita.

## Modelos admitidos no pack de produção read-only

| Modelo / alias | Classe DSE | Evidência oficial |
| --- | --- | --- |
| DSE4210 | Auto Start | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4210/downloads |
| DSE4220 | Auto Mains Failure | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4220/downloads |
| DSE4510 / DSE4510 MKII | Auto Start | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4510-mkii/downloads |
| DSE4520 / DSE4520 MKII | Auto Mains Failure | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4520-mkii/downloads |
| DSE4610 | Auto Start | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse4610/downloads |
| DSE4620 | Auto Mains Failure | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse4620/downloads |
| DSE6010 MKII | Auto Start | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse6010mkii/downloads |
| DSE6020 MKII | Auto Mains Failure | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse6020mkii/downloads |
| DSE7110 MKII | Auto Start | https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse7110-mkii/downloads |
| DSE7120 MKII | Auto Mains Failure | https://www.deepseaelectronics.com/genset/auto-mains-utility-failure-control-modules/dse7120mkii/downloads |
| DSE7210 / DSE7220 | Auto Start / AMF | páginas oficiais de downloads DSE com 056-051 |
| DSE7310 / DSE7320 | Auto Start / AMF | páginas oficiais de downloads DSE com 056-051 |
| DSE7310 MKII / DSE7320 MKII | Auto Start / AMF | páginas oficiais de downloads DSE com 056-051 |
| DSE7410 / DSE7420 | Auto Start / AMF | páginas oficiais de downloads DSE com 056-051 |
| DSE7410 MKII / DSE7420 MKII | Auto Start / AMF | páginas oficiais de downloads DSE com 056-051 |
| DSE8610 / DSE8620 | Synchronising / Load Share | páginas oficiais de downloads DSE com 056-051 |
| DSE8610 MKII / DSE8620 MKII | Synchronising / Load Share | páginas oficiais de downloads DSE com 056-051 |
| DSE8810 | Load Share | https://www.deepseaelectronics.com/genset/load-sharing-synchronising-control-modules/dse8810/downloads |
| DSE8910 / DSE8920 | Colour Load Share / Synchronising | https://www.deepseaelectronics.com/genset/load-sharing-synchronising-control-modules/dse8920/downloads |

Os aliases comerciais DSEG7400, DSEG7300, DSEG4500 e DSEG4501 permanecem no manifest de produção read-only existente. A presença no pack não autoriza ampliar registradores ou comandos sem evidência específica.

## GenComm oficial encontrado, mas fora do mesmo mapa

| Modelo | Função | Decisão |
| --- | --- | --- |
| DSE7450 | DC/Hybrid Generator Controller | GenComm documentado; requer mapa DC/Hybrid específico. |
| DSE8710 | Rear Mounted Synchronising & Load Sharing | GenComm documentado; preparar pack/model map próprio. |
| DSE8760 | Rear Mounted ATS/Mains | Separar em pack mains/ATS. |
| DSE8860 | ATS/Mains graphical controller | Separar em pack mains/ATS. |
| DSE8661 | Two-Part ATS/Mains | Separar em pack mains/ATS. |
| DSE8660 / DSE8660 MKII | ATS/Mains | Separar em pack mains/ATS. |
| DSE8680 | Bus-tie | Separar em pack bus-tie. |
| DSE334 / DSE335 / DSE335 MKII | ATS | Separar em pack ATS. |

## Legacy e famílias ainda pendentes

- DSE3110, DSE501, DSE5110, DSE710 e DSE720: ainda sem evidência suficiente aceita para o pack compartilhado.
- DSE7510, DSE7520, DSE5310, DSE5510 e DSE5520: não promover automaticamente sem protocolo/mapa equivalente registrado.
- DSE6110 MKIII e DSE6120 MKIII: continuam como aliases históricos do pack; esta rodada não amplia o escopo de escrita.

## Pack legacy específico

- **DSE5210** — produção read-only via `controllers/production/dse/dse5210-gencomm-v1`. O protocolo GenComm v1.29 nomeia a família 5210/5220 e o pack dedicado limita o polling aos registradores documentados para essa geração.

## Comandos

O documento DSE **Gencomm Control Keys 056-051** comprova o mecanismo de control keys em vários modelos, mas não comprova sozinho que uma unidade específica, com determinado firmware, cabeamento, permissivos e configuração, está segura para receber escrita remota.

Por isso:

- `documentedControl` / `homologationCandidates` podem registrar STOP, AUTO, MANUAL, TEST, START e transferências;
- `capabilities.start/stop/auto/manual/test/...` continuam `false` no pack compartilhado;
- FC16 não é materializado em produção até evidência física de modelo + firmware.

Essa fronteira libera imediatamente **telemetria documentada em produção** sem transformar documentação pública em autorização de comando industrial.
