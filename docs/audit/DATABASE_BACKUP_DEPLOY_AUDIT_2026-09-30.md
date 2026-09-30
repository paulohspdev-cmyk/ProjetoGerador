# Auditoria AZ-11/AZ-13 — banco, backup, deploy e rollback

Data: 2026-09-30  
Release observada: `20a68c2d0e146addcca708290a1564c63ffa305e`

## Banco de produção

Arquivo:

`/var/lib/rc-geradores/rc-geradores.db`

Estado verificado:

- journal mode: WAL;
- `PRAGMA user_version=5`;
- `PRAGMA integrity_check=ok`;
- 0 violações de foreign key;
- schema migrations 1–5 registradas.

Migrações versionadas atuais:

1. baseline;
2. papel operador/RBAC;
3. potência nominal;
4. capacidade de combustível;
5. topologia de potência.

### Avaliação

A base está estruturalmente íntegra no momento da auditoria.

`db.connect()` habilita `foreign_keys=ON` e usa timeout SQLite de 15 s. O schema usa WAL.

As migrações possuem rollback de transação quando aplicável e as alterações posteriores são idempotentes por inspeção de coluna/schema.

## Backup completo

O backup manager:

- usa SQLite backup API;
- executa quick_check;
- possui integrity_check e foreign_key_check;
- inclui banco e bindings;
- exclui segredos do arquivo completo observado;
- possui retenção padrão 14;
- possui fluxo de restore com staging/rollback.

### Último backup completo observado

`rc-geradores-full-20260928-174326-...tar.gz`

Verificação realizada diretamente no arquivo:

- arquivo existe;
- tamanho ~4 MB;
- 1038 membros;
- contém `product/product-db.sqlite3`;
- contém `product/rapid-bindings.json`;
- nenhum membro com nome de secret/password/totp/env;
- SQLite extraído em área temporária: `quick_check=ok`;
- `integrity_check=ok`;
- 0 violações FK;
- schema version 5.

Conclusão: **o último backup completo observado está estruturalmente válido**.

## A11-001 — backup diário não está mais agendado

Histórico:

- job `job-daily-full-backup` foi criado em 08/09;
- backups diários eram executados por volta de 05:30 UTC;
- 24/09: backup falhou por permission denied no diretório de backups;
- 25/09: backup falhou novamente pelo mesmo tipo de permissão;
- 25/09 07:48 UTC: existe audit event de **delete** do scheduler job `job-daily-full-backup`;
- 28/09: houve um backup completo OK, fora do agendamento atualmente existente;
- em 30/09: tabela `scheduler_jobs` possui 0 registros.

Portanto não existe backup completo periódico ativo neste momento.

Os muitos diretórios `deploy-...` são snapshots transacionais do deploy e não substituem a política de backup completo periódico.

## A11-002 — não há off-site configurado

Estado observado:

- `RC_BACKUP_OFFSITE_DIR`: não configurado;
- `RC_BACKUP_OFFSITE_REQUIRED`: não habilitado;
- retenção local: 14.

Isto é risco de continuidade: falha da VM/disco pode afetar produção e backups locais ao mesmo tempo.

Não será habilitado automaticamente pela auditoria; requer definição de destino e política operacional.

## Deploy

O deploy atual possui mecanismos positivos:

- exige checkout Git;
- resolve commit exato;
- cria backup transacional;
- cria snapshot SQLite após interromper serviços que escrevem;
- valida snapshot;
- faz checkout detached do SHA solicitado;
- recria venv;
- recompila leitor Rapid;
- roda migrações;
- faz smoke;
- grava `deployed-commit`;
- valida que `deployed-commit == HEAD`;
- possui rollback em falhas.

## Identidade da release — verificada

Estado atual:

- Git HEAD: `20a68c2d0e146addcca708290a1564c63ffa305e`;
- `deployed-commit`: mesmo SHA;
- branch: detached;
- working tree: limpo;
- `diagnostics.version_info().gitSha = 20a68c2d0e14`.

A rastreabilidade local da release está correta.

O drift existente é outro: esse SHA pertence ao PR #86 ainda aberto e não à `main` consolidada.

## A13-001 — smoke não valida Controller Pack x binding

Já confirmado no caso GEN163:

- pack: 40 canais;
- binding: 26 canais;
- deploy/smoke foi considerado saudável.

O smoke atual valida identidade cadastral e apenas exige que `channels` não esteja vazio.

Precisa comparar conjunto esperado do pack com conjunto materializado no binding.

## A13-002 — reconcile Rapid não faz parte do deploy

O deploy não chama automaticamente `provision_generator.py` para bindings existentes.

Isso evita mutação inesperada — uma decisão segura — mas cria uma obrigação:

**mudança de pack que altera canais precisa ser detectada e bloquear a release até reconcile controlado.**

Não é correto simplesmente adicionar reconcile automático ao deploy, porque o provisionador para/retoma serviços Rapid e altera BaseDAT/XML/bindings.

## Requisito antes de integrar reconcile ao fluxo

Se no futuro reconcile fizer parte de uma release transacional, o rollback do deploy também precisará incluir, de forma coordenada:

- `commline.dat`;
- `device.dat`;
- `cnl.dat`;
- `ScadaCommConfig.xml`;
- template de comunicação;
- `rapid-bindings.json`.

O provisionador já possui seu próprio backup, mas o release gate precisa tratar código + DB + Rapid runtime como uma unidade verificável.

## Prioridades

1. recriar/agendar backup completo periódico;
2. corrigir causa operacional/ownership que falhou em 24/25 antes de depender do schedule;
3. decidir backup off-site;
4. adicionar checker pack x binding ao smoke;
5. adicionar dry-run ao reconcile;
6. manter HEAD + deployed-commit como dupla verificação de release;
7. proibir deploy de PR aberto como fluxo normal.

## Critério de fechamento AZ-11/AZ-13

- backup periódico ativo e teste de execução OK;
- restore testado em ambiente não produtivo;
- política off-site decidida;
- schema/FK/integrity fazem parte do smoke aplicável;
- pack x binding faz parte do release gate;
- release candidate usa SHA aprovado;
- rollback cobre todos os artefatos que a release realmente muta.
