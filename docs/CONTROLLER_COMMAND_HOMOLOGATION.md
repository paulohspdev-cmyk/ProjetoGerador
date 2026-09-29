# Homologação de comandos das controladoras

## Regra

Nenhum comando é liberado por documentação isolada. A promoção para produção exige, por
**modelo + firmware exato + ação**:

1. Controller Pack `production`;
2. pack `field_validated` para qualquer capacidade de escrita;
3. mapa/contrato de comando documentado;
4. binding industrial único e coerente;
5. firmware da unidade inventariado;
6. ensaio físico testemunhado;
7. resposta do controlador registrada;
8. feedback independente pós-comando confirmado;
9. estado final seguro confirmado;
10. revisão do patch que habilita `capabilities.<ação>` e adiciona o firmware a `firmware.tested`.

## Ferramentas

`ops/controller_homologation.py matrix`

Mostra todos os gates por gerador e por ação. Não envia comandos.

`ops/controller_homologation.py template --tag GENxxx --action start --output evidence.json`

Gera o formulário de evidência. Não envia comandos.

`ops/controller_homologation.py validate evidence.json`

Valida a completude da evidência.

`ops/controller_homologation.py proposal evidence.json`

Gera uma **proposta** de promoção. Nunca altera manifest nem libera comando automaticamente.

`ops/controller_readonly_homologation_probe.py --tag GENxxx --execute-readonly`

Executa somente funções Modbus de leitura de registradores (FC03/FC04). Não existe caminho FC05/06/15/16 nessa ferramenta. O feedback de disjuntores é obtido pelos estados agregados homologados, sem abrir uma superfície extra de coils na bridge.

## Estado por família

### ComAp InteliGen 200

START/STOP possuem histórico de validação de campo, mas a evidência antiga não registrou o
firmware exato. Portanto o hardening atual exige nova comprovação por firmware.

Há candidatos documentados para MAN/AUTO/TEST pelo setpoint `Controller Mode` do export
retido e para GCB/MCB pelos comandos reservados do controlador. Permanecem capability=false
até ensaio por firmware.

`paralleling` não é tratado como comando genérico; depende da aplicação e do fechamento
sincronizado do disjuntor.

### ComAp IG4 200

Telemetria e firmwares 2.0.3.1, 2.1.4.1 e 2.1.0.15 estão homologados para leitura. O caminho
LAB de START já existe, porém comandos continuam desabilitados em produção até ensaio físico.

O export retido não prova um endereço de escrita para mudança de modo; não inferir.

### ComAp InteliCompact NT

Ainda em `lab/investigation`. Antes de qualquer escrita é obrigatório obter variante exata,
firmware e export/guia de comunicação autoritativo, validar identidade e telemetria read-only.

### DSE GenComm (inclui DSE4520 MKII e DSE8620 MKII)

O documento GenComm Control Keys define as chaves de STOP/AUTO/MANUAL/TEST/START e
transferência. O pack de produção continua read-only porque funções suportadas variam por
modelo e devem ser lidas da página de disponibilidade antes do ensaio.

Transfer-to-generator / transfer-to-mains não é automaticamente equivalente a
`GCB_CLOSE` / `MCB_CLOSE` para todos os modelos; essa semântica precisa ser validada por modelo.
