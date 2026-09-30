# Inventário de produção — 2026-09-29

## Identidade da release

- Host observado: `scada`
- Aplicação: `/opt/rc-geradores`
- Marcador canônico: `/var/lib/rc-geradores/deployed-commit`
- Valor observado: `20a68c2d0e146addcca708290a1564c63ffa305e`
- Esse SHA é o head atual do PR #86, ainda aberto.
- Todos os 22 arquivos do delta entre `main@903716e` e esse head foram comparados com a VM e coincidem integralmente.

A pasta implantada não contém `.git`. Isso é aceitável para um artefato de release desde que o marcador `deployed-commit` seja tratado como fonte de versão. O diagnóstico atual, porém, ainda tenta usar `git rev-parse` e precisa ser corrigido para consultar o marcador.

## Serviços observados

Ativos e habilitados:

- `rc-geradores-api`
- `rc-geradores-bridge`
- `rc-geradores-provision`
- `rc-geradores-worker`
- `rc-geradores-frontend`
- `rc-geradores-web-firewall`
- `scadaserver6`
- `scadacomm6`
- `scadaagent6`

Modo web: `external_proxy`.

As portas 3000/8090 escutam em `0.0.0.0`, mas a tabela nftables observada permite loopback e o peer do proxy configurado e depois aplica `drop` para essas portas. A auditoria de rede continuará em AZ-13.

## Banco

Arquivo operacional: `/var/lib/rc-geradores/rc-geradores.db`.

- `PRAGMA quick_check = ok`
- 48 tabelas de aplicação
- 11 geradores
- 11 assets
- 11 controller instances
- 10 snapshots de telemetria
- 29 registros em `industrial_alarms`
- 112 registros em `events`
- 21.277 registros em `process_events`
- 893 registros em `audit_log`

Os números são fotografia do momento da auditoria e não devem ser usados como expectativa fixa em teste.

## Parque técnico observado

| Tag | Modelo | Firmware inventariado | Binding | Estado/capabilities observados |
|---|---|---:|---|---|
| GEN132 | InteliCompact NT | N/D | não | não configurado; sem comandos |
| GEN152 | InteliGen4 200 | N/D | sim | online; telemetria; comandos bloqueados |
| GEN153 | InteliGen 200 | 1.8.1.1 | sim | online; START/STOP |
| GEN154 | InteliGen 200 | 1.8.1.1 | sim | online; START/STOP |
| GEN157 | InteliGen 200 | N/D | sim | offline/stale; comandos bloqueados |
| GEN163 | DSE4520 MKII | 4.8 | sim | online; START/STOP/OFF/AUTO/MANUAL/TEST segundo payload atual |
| GEN167 | InteliGen 200 | 1.8.1.1 | sim | online; START/STOP |
| GEN203 | IG4 200 | 2.1.4.1 | sim | online; START somente |
| GEN204 | IG4 200 | 2.1.0.15 | sim | online; START somente |
| GEN205 | DSE8620 MKII | N/D | sim | online/running; pack read-only |
| GEN206 | DSE GenComm Genset | N/D | sim | online/running; pack read-only |

"Comandos bloqueados" não deve ser interpretado automaticamente como defeito: leitura e escrita são homologações independentes.

## Divergência de binding do GEN163

Controller Pack implantado `dse/dse-4520-mkii`:

- 40 canais Rapid declarados.

Binding runtime observado:

- 26 canais;
- 15 canais esperados ausentes;
- 1 canal extra legado (`alarm_class_raw`).

Canais ausentes incluem:

- `controller_status_flags_raw`
- tensão/frequência de barramento;
- tensão/frequência de rede.

Isso prova que o código/pack foi implantado sem que o binding/runtime Rapid do GEN163 fosse reconciliado integralmente.

## Divergência entre telemetria e caminho de comando DSE

No payload normal do GEN163:

- `status=online`
- `alarms=0`
- `mode=AUTO`
- RPM 0
- capabilities de START/STOP/OFF/AUTO/MANUAL/TEST = true.

Nos eventos de comando do mesmo equipamento, o executor lê repetidamente:

- `status=0x0400`
- modo `1 -> 1`
- RPM `0 -> 0`
- START/MANUAL/TEST sem confirmação.

No contrato DSE atual, `0x0400` é warning. Como `controller_status_flags_raw` não está no binding runtime do GEN163, o card não recebe esse estado pela telemetria normal.

Este é um achado confirmado de "card não corresponde à realidade".

## Regras derivadas

1. Deploy de Controller Pack que muda canais deve obrigatoriamente reconciliar bindings/templates antes de declarar release saudável.
2. O smoke pós-deploy deve comparar `pack rapid channels` x `runtime binding channels`.
3. Estado utilizado pelo executor de comando e estado mostrado no card precisam vir do mesmo contrato de telemetria ou ter reconciliação explícita.
4. Um warning observado na controladora não pode desaparecer silenciosamente por ausência de canal no binding.
5. `deployed-commit` deve ser exposto pelo diagnóstico/version endpoint.
