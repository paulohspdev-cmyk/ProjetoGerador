# Auditoria AZ-10 — ComAp

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Regra central

Telemetria, mapa documentado e comando homologado são três níveis diferentes.

A Auditoria Zero não promove capability ComAp apenas porque um registrador ou candidato existe.

## InteliCompact NT — GEN132

- pack: `comap/intelicompact-nt`;
- estado do pack: `investigation`;
- binding: ausente;
- firmware: não inventariado;
- comandos de produção: nenhum;
- há candidatos documentais para várias ações, mas nenhum contrato produtivo.

Conclusão: permanecer fail-closed.

## InteliGen4 200 — GEN152

- pack selecionado: `comap/ig4-200`;
- pack field validated;
- binding presente e coerente;
- firmware do equipamento ainda não inventariado no domínio;
- pack conhece firmwares testados `2.0.3.1`, `2.1.4.1`, `2.1.0.15`;
- START possui contrato no pack, mas o GEN152 fica bloqueado por `firmware_inventory_required`;
- OFF/MAN/AUTO/TEST permanecem sem endereço de escrita provado na evidência retida.

Conclusão: o bloqueio atual é correto.

## InteliGen 200 — GEN153/GEN154/GEN167

Estado de homologação:

- pack `comap/inteligen-200`;
- firmware aplicável inventariado pelo domínio: `1.8.1.1`;
- binding presente/coerente;
- START: `production_ready`;
- STOP: `production_ready`;
- OFF/MAN/AUTO/TEST: `action_field_validation_required`;
- MCB/GCB: `action_field_validation_required`.

### Defeito de implementação já identificado

O pack declara feedback físico para START/STOP:

- START: RPM > 100 em até 15 s;
- STOP: RPM <= 100 em até 30 s.

O executor atual aceita o retorno reservado do controlador, espera aproximadamente 2 s, lê RPM, mas não usa esse feedback para decidir sucesso.

Portanto `production_ready` hoje significa "gates de homologação/configuração satisfeitos", mas o executor ainda precisa ser corrigido para cumprir integralmente o contrato de feedback.

Nenhuma nova ação deve ser promovida antes dessa correção.

## InteliGen 200 — GEN157

- pack: field validated;
- binding presente;
- firmware exato: ainda não inventariado;
- START/STOP e demais ações permanecem bloqueadas por `firmware_inventory_required`;
- na janela de auditoria, porta 15001 estava sem sessão remota e o equipamento aparecia stale/offline.

Conclusão: não é correto copiar permissões dos GEN153/154/167 para GEN157.

## IG4 200 — GEN203/GEN204

- pack `comap/ig4-200`;
- firmwares inventariados pertencem à lista testada;
- binding coerente;
- START: `production_ready`;
- STOP: `action_field_validation_required`;
- MCB/GCB: `action_field_validation_required`;
- OFF/MAN/AUTO/TEST: `write_address_not_proven_in_retained_export`.

O executor START é mais rigoroso que o IG200:

- relê estado antes da escrita;
- exige retorno reservado esperado;
- exige Running/RPM antes de manter sucesso.

Gap já registrado:

- pack declara 8 s de feedback;
- implementação observa aproximadamente 6 s.

O número deve vir do contrato, não de constante duplicada.

## Por que "lê mas não deixa mudar AUTO/MAN/TEST"

Nos ComAp auditados isso não é um único bug.

Há três motivos diferentes:

1. **firmware ainda não inventariado** — GEN152/GEN157;
2. **ação documentada mas ainda sem validação de campo** — IG200 OFF/MAN/AUTO/TEST;
3. **endereço de escrita ainda não provado** — IG4 OFF/MAN/AUTO/TEST.

A UI futura deve mostrar o motivo do bloqueio em linguagem operacional, sem habilitar o botão.

## Critério de fechamento AZ-10

A trilha de auditoria está fechada quanto ao estado atual. As correções/homologações futuras devem ser separadas:

- corrigir feedback START/STOP IG200;
- alinhar timeout IG4 ao pack;
- inventariar firmware GEN152/GEN157;
- homologar ações adicionais individualmente;
- nunca generalizar uma evidência de um modelo/firmware para outro.
