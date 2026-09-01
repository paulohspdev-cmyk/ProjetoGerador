# IG4 200 — Homologação de STOP remoto

Data: 2026-09-01

## GEN204 / Unit 4

- Porta: 15003
- Framing: Modbus RTU em TCP transparente
- Estado antes: MAN=1, Ready=1, BrksOff=1, RPM=0, bateria=24.9 V
- Argumento STOP: `0x02FD0000` em 4207-4208 via FC16
- Código de comando: `0x0001` em 4209 via FC06
- Retorno: `0x000002FE`
- Estado após: Engine=11 (Stop), Breaker=1, RPM=0
- Resultado: STOP remoto aceito pelo controlador.

## GEN203 / Unit 3

- Porta: 15003
- Framing: Modbus RTU em TCP transparente
- Estado antes: MAN=1, Ready=1, BrksOff=1, RPM=0, bateria=24.9 V
- Argumento STOP: `0x02FD0000` em 4207-4208 via FC16
- Código de comando: `0x0001` em 4209 via FC06
- Retorno: `0x000002FE`
- Estado após: Engine=11 (Stop), Breaker=1, RPM=0
- Resultado: STOP remoto aceito pelo controlador.

## Conclusão

O candidato de protocolo de STOP remoto foi validado em campo nos dois IG4 200 atualmente conectados à porta 15003 (Units 3 e 4), sob as pré-condições MAN + Ready + BrksOff + RPM=0.

Este registro não homologa START, GCB, MCB, mudança de modo ou setpoints. START permanece fora de produção até validação funcional completa de partida/rotação e das condições de segurança.
