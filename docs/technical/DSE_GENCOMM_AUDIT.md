# Auditoria DSE GenComm

## Fontes analisadas

| Fonte | Identificação | SHA-256 | Uso |
| --- | --- | --- | --- |
| PDF fornecido | GenComm standard for use with generating set control equipment, v2.38 WIP, revisão 2013-06-06 | `a4f4cb42a0b7362a419dbd87f43d67818509a5af27605be091d0b15fa0b892c4` | Semântica de páginas, tipos, escalas, sentinelas e controles |
| PDF fornecido | Tabela Modbus DSE8610 MKII | `7a165667035b4d60c42ca301e453cec4da6b28daa04d40fb80b89decfdc59a7b` | Endereços absolutos observados para a 8610 MKII |
| Fabricante | Página oficial DSE8610 MKII | consulta em 2026-09-02 | Confirma Modbus RTU em RS232/RS485 e Modbus TCP no Ethernet |
| Fabricante | Document Hub DSE | consulta em 2026-09-02 | Catálogo e documentação específica por modelo |

## Conclusões técnicas

- O mapa usa endereçamento `página * 256 + offset`. Exemplos: modo = `3*256+4 = 772`; óleo = `4*256 = 1024`; controle = `16*256+8 = 4104`.
- Leituras são FC03. Comandos exigem FC16 escrevendo chave e complemento de um em uma única transação.
- A disponibilidade de cada função deve ser lida nos offsets 0 a 7 da página 16 antes de qualquer comando.
- Valores `0xFFFF`, `0x7FFF`, `0xFFFFFFFF` e `0x7FFFFFFF` podem indicar grandeza não implementada conforme tipo; não podem virar zero válido.
- GenComm não suporta dois mestres simultâneos. Disputa entre Ethernet, RS485, modem e software de configuração pode causar timeout, `slave busy` ou aparente queda do modem.
- O manual declara alocações diferentes para 60xx, 72xx/73xx, 8xxx/74xx, 3xx, Exxx e P100. Um mapa único não deve ser aplicado cegamente a todas as DSE.

## Situação das famílias

| Família | Base documental | Situação no produto |
| --- | --- | --- |
| DSE8610 MKII / 8xxx | GenComm + tabela específica | Pack LAB documental criado |
| 74xx | GenComm contém alocação da família | Requer modelo/firmware real e ensaio |
| 72xx/73xx | GenComm contém alocação da família | Requer modelo/firmware real e ensaio |
| 60xx | GenComm contém alocação parcial específica | Requer modelo/firmware real e ensaio |
| 3xx ATS | GenComm contém alocações distintas | Não tratar como controlador de motor |
| Exxx/P100 | GenComm contém alocações próprias | Requer documento e equipamento correspondentes |
| 4xxx, G-Series e modelos recentes | Não cobertos integralmente pela revisão fornecida | Buscar manual oficial exato antes de mapear |

## Plano para os 11 geradores

Para cada gerador devem ser registrados: modelo exato, firmware, transporte, IP/porta ou porta reverse TCP, Unit ID, fabricante/modelo lidos, versão GenComm, métricas implementadas, sentinelas, latência e feedbacks. A homologação será feita por modelo, nunca apenas pela marca DSE ou ComAp.

START, STOP, transferência, GCB e MCB permanecem bloqueados até o ensaio do equipamento correspondente. A existência de uma chave no PDF não é prova de que a função está disponível, permitida ou cabeada no gerador.
