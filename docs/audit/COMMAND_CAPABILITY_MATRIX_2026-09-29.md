# Matriz de comandos observada em produção — 2026-09-29

Fonte: execução **somente leitura** de `app.homologation.action_readiness()` na release implantada `20a68c2d0e146addcca708290a1564c63ffa305e`.

Esta matriz descreve o que o software considera pronto ou bloqueado. Ela **não autoriza novas escritas** e não substitui homologação de campo.

## Legenda

- **READY** — contrato de software considera a ação pronta para produção.
- **FIELD** — mapa/candidato existe, mas falta validação específica da ação em campo.
- **FW** — falta inventariar/homologar exatamente o firmware aplicável.
- **MAP** — endereço/mecanismo de escrita ainda não foi provado na evidência retida.
- **PACK** — Controller Pack não é de produção.
- **SEM** — a semântica genérica MCB/GCB não corresponde à chave GenComm disponível.
- **MISS** — não há candidato de comando documentado.
- A presença de telemetria não altera estas regras.

## Matriz

| Gerador | Controladora / firmware | START | STOP | OFF | AUTO | MAN | TEST | MCB O | MCB C | GCB O | GCB C |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| GEN132 | InteliCompact NT / N/D | PACK | PACK | PACK | PACK | PACK | PACK | PACK | PACK | PACK | PACK |
| GEN152 | InteliGen4 200 / N/D | FW | FW | MAP | MAP | MAP | MAP | FW | FW | FW | FW |
| GEN153 | InteliGen 200 / 1.8.1.1 | READY | READY | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD |
| GEN154 | InteliGen 200 / 1.8.1.1 | READY | READY | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD |
| GEN157 | InteliGen 200 / N/D | FW | FW | FW | FW | FW | FW | FW | FW | FW | FW |
| GEN163 | DSE4520 MKII / 4.8 | READY* | READY* | READY* | READY* | READY* | READY* | SEM | SEM | SEM | SEM |
| GEN167 | InteliGen 200 / 1.8.1.1 | READY | READY | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD | FIELD |
| GEN203 | IG4 200 / 2.1.4.1 | READY | FIELD | MAP | MAP | MAP | MAP | FIELD | FIELD | FIELD | FIELD |
| GEN204 | IG4 200 / 2.1.0.15 | READY | FIELD | MAP | MAP | MAP | MAP | FIELD | FIELD | FIELD | FIELD |
| GEN205 | DSE8620 MKII / N/D | FW | FW | MISS | FW | FW | FW | SEM | SEM | SEM | SEM |
| GEN206 | DSE GenComm Genset / N/D | FW | FW | MISS | FW | FW | FW | SEM | SEM | SEM | SEM |

## O asterisco do GEN163 é crítico

O software classifica START/STOP/OFF/AUTO/MANUAL/TEST do GEN163 como `production_ready`, mas isso **não significa que os comandos estão funcionando fisicamente**.

Evidência observada no próprio banco de produção:

- tentativas recentes de START, MANUAL e TEST não confirmaram;
- modo permaneceu `1 -> 1`;
- RPM permaneceu `0 -> 0`;
- o executor leu `status=0x0400` repetidamente;
- no contrato DSE implantado, `0x0400` representa warning;
- o payload normal do card simultaneamente apresentou `online` e `alarms=0`.

A causa estrutural já identificada é que o binding Rapid do GEN163 está desatualizado em relação ao Controller Pack: o pack possui 40 canais e o binding runtime apenas 26, sem `controller_status_flags_raw`.

Portanto, para o GEN163, **READY significa apenas que os gates de configuração do software estão satisfeitos**. A Auditoria Zero mantém essas ações sob investigação até reconciliar telemetria/runtime e entender Panel Lock, Protected Start e demais permissivos do módulo.

## Por que alguns equipamentos leem mas não deixam mudar modo

### InteliGen 200 — GEN153/154/167

O mapa do modo já possui candidato documentado:

- OFF = valor 0;
- MANUAL = valor 1;
- AUTO = valor 2;
- TEST = valor 3;
- endereço documentado no pack: 3041.

Mas essas ações ainda estão `action_field_validation_required`. Isto é intencional: conhecer o endereço não é suficiente para permitir escrita em equipamento real.

### IG4 — GEN203/204

START está homologado no estado atual. STOP e disjuntores ainda aguardam validação de ação. OFF/MAN/AUTO/TEST não possuem endereço de escrita comprovado na evidência retida.

### DSE8620 / DSE GenComm — GEN205/206

A telemetria está ativa e ambos foram observados em funcionamento, mas não existe ainda um contrato específico de comando/firmware que justifique copiar a implementação do DSE4520.

## Regra definitiva

A UI deve separar claramente três coisas:

1. **estado lido** — por exemplo, "está em AUTO";
2. **ação disponível** — por exemplo, botão AUTO habilitado;
3. **motivo do bloqueio** — por exemplo, "ação ainda não homologada em campo".

Nunca inferir (2) a partir de (1).

## Próximas provas

- transformar esta matriz em regressão automatizada;
- mostrar o motivo de bloqueio ao operador/administrador sem habilitar a ação;
- reconciliar o binding do GEN163 em procedimento controlado e depois repetir a leitura;
- somente após telemetria coerente, investigar permissivos físicos/configuração DSE sem liberar comandos por tentativa.
