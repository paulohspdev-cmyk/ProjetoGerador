# Auditoria e remediação — 2026-10-06

## Escopo

Revisão read-only inicial do Git/GitHub e da VM de produção, seguida de remediações separadas por domínio conforme `CHANGE_BOUNDARIES.md`.

## Estado final validado

### Git e release

- `main`, checkout de produção e marcador `deployed-commit` foram alinhados por deploy controlado.
- CI, E2E e Quality and Security do `main` estão verdes.
- O repositório mantém branches não mescladas ou branches históricas deliberadamente preservadas nas categorias release/backup/checkpoint/audit.
- 98 branches já mescladas foram removidas.

### Dependências

- `source-map-js` foi atualizado de 1.2.1 para 1.2.2.
- `npm audit --audit-level=high`: zero vulnerabilidades.
- `pip-audit -r backend/requirements.txt`: nenhuma vulnerabilidade conhecida.

### VM

- serviços essenciais RC Geradores e Rapid SCADA ativos;
- zero unidades systemd em estado failed após correção do `fwupd`;
- recursos de CPU, RAM, disco e inodes sem pressão operacional observada;
- `vm-smoke.sh`: aprovado;
- `preflight_vm.sh`: aprovado.

### Banco

- SQLite principal íntegro;
- `PRAGMA quick_check`: `ok`;
- `PRAGMA integrity_check`: `ok`;
- `PRAGMA foreign_key_check`: sem violações;
- journal mode WAL.

### Rapid / bridge

- 13 bindings runtime presentes;
- 13/13 bindings coerentes com cadastro e Controller Pack;
- listeners reverse/local esperados presentes;
- saúde de device permanece informativa porque equipamentos podem estar desligados;
- reinício da bridge provocado por `needrestart` durante atualização do `fwupd` foi acompanhado até a saúde retornar ao baseline observado de 7/13 Normal.

### Backup

- job `job-daily-full-backup` restaurado;
- intervalo padrão: 86400 segundos;
- política é idempotente e passa a ser garantida por instalação/deploy;
- backup completo imediato executado com sucesso;
- retenção de deploy em 30 confirmada.

## Pendências externas

### Off-site

Nenhum volume externo, NFS, storage remoto ou outro destino off-site estava montado na VM durante a auditoria. O sistema não deve apontar `RC_BACKUP_OFFSITE_DIR` para outro diretório do mesmo disco apenas para silenciar o alerta. A política local está corrigida; resiliência contra perda total da VM requer storage externo real.

### Enforcement de merge no GitHub

Os workflows e o gate de fronteiras funcionam. Foi observado historicamente um merge realizado enquanto checks estavam vermelhos. A integração GitHub disponível para esta remediação não possui permissão administrativa para branch protection/rulesets. O enforcement de checks obrigatórios em `main` deve ser ativado por um administrador do repositório.

## Regra de continuidade

A partir desta data, usar `PROJECT_STATE.md` e este relatório como fotografia operacional mais recente, mantendo `AUDIT_ZERO_FINAL_2026-09-30.md` como relatório histórico da fase de diagnóstico.
