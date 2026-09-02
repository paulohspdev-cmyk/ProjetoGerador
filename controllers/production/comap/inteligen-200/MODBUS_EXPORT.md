# InteliGen 200 — mapa Modbus do archive `in200.txt`

## Status

O arquivo `in200.txt` é o export Modbus correto do archive usado no GEN005. O próprio export declara a tabela **Values** com funções Modbus **03/04** e relaciona cada endereço Modbus ao respectivo `Com.Obj`, nome, unidade, tipo, tamanho e casas decimais.

Em 2026-08-31 o mapa foi validado no GEN005, Unit 16, por leituras FC03 somente. Nenhum setpoint foi escrito.

## Regras de segurança

- Valores `1000..2999`: somente leitura FC03/FC04.
- Setpoints `3000..3999`: o export documenta FC03/04/06/16, porém este projeto **não escreve** nessa faixa.
- START/STOP continuam sendo os únicos comandos industriais homologados pelo fluxo de comando existente.
- AUTO/MANUAL/TEST, MCB/GCB e paralelismo permanecem bloqueados.
- `0x8000` em 16 bits e `0x80000000` em 32 bits são tratados como **N/D**, nunca como zero físico.

## Mapa validado para telemetria

| Register | Métrica | Escala | Unidade | Evidência GEN005 |
| ---: | --- | ---: | --- | --- |
| 1000 | RPM | 1 | rpm | 1798..1801 em operação |
| 1003 | EngineSpeed ECU | 1 | rpm | acompanha a rotação; N/D parado |
| 1004 | FuelRate | 0,1 | L/h | 5,4..8,0 |
| 1005 | T-Coolant | 1 | °C | 65..66 |
| 1006 | T-IntManifold | 1 | °C | 40..42 |
| 1007 | P-Oil | 0,01 | bar | 6,36..6,44 |
| 1008 | P-Intake | 0,01 | bar | 0,12..0,14 |
| 1009 | Load | 1 | % | 8..11 |
| 1019 | Generator kW | 1 | kW | 0 com `BrksOff` |
| 1023 | Generator kVAr | 1 | kVAr | 0 com `BrksOff` |
| 1027 | Generator kVA | 1 | kVA | 0 com `BrksOff` |
| 1031 | Generator Power Factor | 0,01 | — | 0 com `BrksOff` |
| 1035 | Generator Frequency | 0,1 | Hz | 60,0 |
| 1036..1038 | Generator Voltage L1/L2/L3-N | 1 | V | ~227 |
| 1039..1041 | Generator Voltage L-L | 1 | V | validado em testes de partida |
| 1042..1044 | Generator Current L1/L2/L3 | 1 | A | 0 com `BrksOff` |
| 1083 | Battery Volts | 0,1 | V | 25,6 parado / 28,4 rodando |
| 1084 | D+ | 0,1 | V | endereço validado; leitura 0 no GEN005 |
| 1087 | Fuel Level | 1 | L | ~482..487 L |
| 1227 | Nominal Power | 1 | kW | 440 |
| 1228 | Nominal Voltage | 1 | V | 227 |
| 1229 | Nominal Current | 1 | A | 830 |
| 1230-1231 | Genset kWh | 1 | kWh | 326572 |
| 1232-1233 | Genset kVArh | 1 | kVArh | 220149 |
| 1238-1239 | Running Hours | 0,1 | h | 2821,8 |
| 1240 | Num Starts | 1 | — | 683 |
| 1241 | Maintenance 1 | 1 | h | 126 |
| 1242 | Maintenance 2 | 1 | h | 426 |
| 1243 | Maintenance 3 | 1 | h | 726 |
| 1258 | Engine state | enum | — | 1=Ready parado; 7=Running operando |
| 1259 | Breaker state | enum | — | 1=BrksOff no teste sem carga |
| 1342 | Controller Mode | enum | — | 1=MAN no teste |

## Enumerações usadas

`Engine state`: 0 Init, 1 Ready, 2 NotReady, 3 Prestart, 4 Cranking, 5 Pause, 6 Starting, 7 Running, 8 Loaded, 9 Soft unld, 10 Cooling, 11 Stop, 12 Shutdown, 13 Ventil, 14 EmergMan, 15 Soft load, 16 WaitStop, 17 SDVentil.

`Breaker state`: 0 Init, 1 BrksOff, 2 IslOper, 3 MainsOper, 4 ParalOper, 5 RevSync, 6 Synchro, 7 MainsFlt, 8 ValidFlt, 9 MainsRet, 10 MultIslOp, 11 MultParOp, 12 EmergMan.

`Controller Mode`: 0 OFF, 1 MAN, 2 AUTO, 3 TEST.

## Observações

O endereço antigo `1045` não é a frequência principal do gerador neste export; ele é **Slip Frequency**. A frequência correta para o card é `1035 × 0,1 Hz`.

O endereço `1046` não é `Generator kW`; ele é **Slip Angle**. A potência ativa correta é `1019`.

O endereço `1082` não é combustível; ele é **Voltage Request**. O nível de combustível correto é `1087`, em litros.

A escala do medidor de potência deve vir de `1227 Nominal Power`. No GEN005 o valor atual é **440 kW**.

Potência, corrente e PF foram validados em condição sem carga, com `Breaker State = BrksOff`, portanto zero é leitura física válida. A confirmação dinâmica desses sinais sob carga deve acontecer apenas quando o grupo entrar em carga por operação normal; não fechar disjuntores apenas para teste.
