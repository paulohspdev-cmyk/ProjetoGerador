# Auditoria AZ-06/AZ-09 — Rapid SCADA e DSE GEN163

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`  
Gerador: GEN163  
Controladora: DSE4520 MKII  
Firmware inventariado: 4.8

## Resumo executivo

O GEN163 está em um estado de **release parcialmente reconciliada**:

- código/backend e Controller Pack novos estão implantados;
- o binding Rapid ainda corresponde a uma versão anterior do perfil;
- o caminho de comando lê informações diretamente da DSE que não chegam ao caminho normal de telemetria/card;
- o smoke de deploy atual não detecta essa divergência.

Isso explica de forma concreta por que o card pode mostrar uma realidade diferente da observada pelo executor de comando.

## Controller Pack x binding runtime

Controller Pack atual:

- `packId=dse/dse-4520-mkii`;
- lifecycle de produção;
- status `field_validated`;
- 40 canais Rapid declarados.

Binding runtime observado:

- 26 canais;
- Rapid Device 207;
- Rapid Line 103.

### Canais esperados que faltam

1. `controller_status_flags_raw`
2. `mains_frequency`
3. `mains_voltage_l1`
4. `mains_voltage_l2`
5. `mains_voltage_l3`
6. `mains_voltage_l1_l2`
7. `mains_voltage_l2_l3`
8. `mains_voltage_l3_l1`
9. `bus_frequency`
10. `bus_voltage_l1`
11. `bus_voltage_l2`
12. `bus_voltage_l3`
13. `bus_voltage_l1_l2`
14. `bus_voltage_l2_l3`
15. `bus_voltage_l3_l1`

### Canal extra legado no binding

- `alarm_class_raw`

O pack atual não espera esse canal como parte do conjunto desejado.

## Consequência sobre warning/alarmes

O backend só deriva `alarm_active` DSE quando `controller_status_flags_raw` existe nos valores recebidos.

O executor de comando DSE leu repetidamente:

`status=0x0400`

O contrato atual interpreta esse bit como warning ativo.

Mas como `controller_status_flags_raw` não está no binding Rapid do GEN163:

- o overlay normal não recebe esse bitfield;
- `_derive_dse_status()` não pode derivar `alarm_active`;
- o payload normal pode retornar `alarms=0`;
- o card pode ficar visualmente online/verde enquanto o executor enxerga warning.

## Evidência dos comandos

Eventos registrados para GEN163 incluíram diversas tentativas de:

- START;
- MANUAL;
- TEST.

Em falhas observadas:

- modo: `1 -> 1`;
- RPM: `0 -> 0`;
- status: `0x0400`.

A mensagem resultante é:

`FC16 recebido pela DSE, mas ... não foi confirmado ... Verifique Panel Lock, Protected Start e permissivos/configuração do módulo.`

A mensagem é tecnicamente coerente como falha de confirmação, mas hoje permanece no card porque o frontend não possui TTL.

## Problema adicional: accepted x confirmed

No START, o executor aceita duas condições:

- RPM acima do limite; ou
- um timer interno que antes estava 0/FFFF passa a valor ativo.

Quando o timer ativa mas o RPM ainda não subiu:

- `accepted=true`;
- `start_pending=true`;
- `running_confirmed=false`.

O wrapper `send_homologated_command()` converte qualquer `accepted=true` para:

`state="controller_accepted"`

Portanto o modelo atual ainda não possui estados explícitos suficientes. O contrato correto deve separar:

- `submitted`;
- `controller_accepted`;
- `pending`;
- `confirmed`;
- `failed`.

## Por que o deploy não detectou o binding antigo

O `vm-smoke.sh` atual valida:

- arquivo de bindings é JSON/lista;
- binding tem `generator_id`;
- gerador existe;
- tipo/modelo/transporte/porta/unit correspondem ao cadastro;
- Rapid Device corresponde ao cadastro;
- o binding possui pelo menos um canal.

Ele **não compara**:

`set(binding.channels) == set(controller_pack.rapid.channels)`

Logo:

- pack com 40 canais;
- binding com 26 canais;

ainda pode passar no smoke.

## O provisionador conseguiria reconciliar

`rapid/provisioning/provision_generator.py` contém `_reconcile_existing()`.

Para binding existente, o código:

- cria backup de BaseDAT, ScadaCommConfig, binding e template;
- atualiza template;
- percorre todos os canais do pack;
- preserva CnlNum de canais existentes;
- cria CnlNum para canais novos;
- marca canais antigos fora do pack como `orphaned_channels`;
- atualiza `rapid-bindings.json`;
- registra auditoria;
- restaura backup se ocorrer exceção;
- controla parada/retorno dos serviços Rapid quando restart é usado.

### Porém

O script não possui `--dry-run`.

Executá-lo agora alteraria configuração real do Rapid SCADA. Por isso **não foi executado nesta auditoria**.

## Por que a divergência permaneceu após o deploy

O `deploy_release_v2.sh` executa smoke, mas não chama `provision_generator.py` para reconciliar todos os bindings existentes após mudança de Controller Pack.

O serviço `rc-geradores-provision` também não reconcilia automaticamente o parque inteiro; ele executa provision/deprovision somente quando recebe requisição explícita no socket privilegiado.

Resultado: atualizar código/pack não atualiza necessariamente o runtime Rapid já materializado.

## Procedimento seguro antes de tocar no GEN163

A correção futura deve ser dividida em PRs e etapas:

### Etapa 1 — checker somente leitura

Criar ferramenta que produza, por gerador:

- pack ID/schema;
- canais esperados;
- canais no binding;
- missing;
- extra/orphaned;
- Line/Device;
- resultado PASS/FAIL.

Nenhuma mutação.

### Etapa 2 — release gate

Adicionar o checker ao smoke/deploy.

Uma release não pode ser declarada saudável se um binding existente divergir do pack selecionado.

### Etapa 3 — dry-run do provisionador

Antes de executar reconcile real, implementar modo que calcule:

- arquivos que seriam alterados;
- canais novos;
- canais preservados;
- canais órfãos;
- necessidade de restart;
- backup/rollback alvo.

### Etapa 4 — reconcile controlado do GEN163

Somente após as etapas anteriores e em PR próprio do domínio Rapid:

- backup explícito;
- reconcile do GEN163;
- validar XML/DAT/binding;
- validar serviços;
- validar leitura dos 40 canais;
- verificar `controller_status_flags_raw`;
- verificar rede/barramento;
- comparar com leitura direta DSE.

### Etapa 5 — somente depois, investigar comando

Se `0x0400` continuar ativo com telemetria reconciliada:

- identificar warning real;
- verificar Panel Lock;
- verificar Protected Start;
- verificar permissivos;
- verificar configuração de Remote Start/control keys.

Nenhuma nova escrita deve ser liberada apenas para "testar se funciona".

## Critério de fechamento AZ-06/AZ-09 para GEN163

- pack x binding = coerente;
- 40 canais esperados materializados ou uma justificativa documentada para exceções;
- status flags chegam pelo Rapid;
- warning lido diretamente e warning mostrado no card são coerentes;
- rede/barramento possuem estado known/N-D correto;
- accepted/pending/confirmed separados;
- cada falha de comando permanece auditável;
- nenhum comando adicional é liberado por inferência.
