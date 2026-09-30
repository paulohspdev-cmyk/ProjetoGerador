# Evidência de drift de produção — 2026-09-29

## Resultado

A VM observada em `/opt/rc-geradores` não corresponde à `main` `903716ec7463bee84a54856cdd27b94e78531fe4`.

O conteúdo implantado corresponde ao head `20a68c2d0e146addcca708290a1564c63ffa305e` do PR #86 para **todos os 22 arquivos alterados por esse PR em relação à baseline**.

O PR #86 está aberto/não integrado à `main`.

## Método

1. Fixada baseline `903716e`.
2. Comparada baseline com head `20a68c2` do PR #86.
3. Obtida a lista completa de 22 arquivos do delta.
4. Cada arquivo foi lido no GitHub no head do PR.
5. Cada arquivo correspondente foi lido em `/opt/rc-geradores`.
6. Os conteúdos foram comparados integralmente.
7. Resultado: 22/22 iguais.

## Arquivos do delta

- `backend/app/bridge.py`
- `backend/app/bridge_runtime.py`
- `backend/app/control.py`
- `backend/app/dse_control.py`
- `backend/app/main.py`
- `backend/app/power_topology.py`
- `backend/app/rapid.py`
- `backend/tests/control_multi_device.py`
- `backend/tests/homologation.py`
- `backend/tests/power_topology.py`
- `controllers/production/comap/ig4-200/manifest.json`
- `controllers/production/dse/dse-4520-mkii/manifest.json`
- `controllers/production/dse/dse-4520-mkii/modbus/source-registers.txt`
- `frontend/src/data/generators.ts`
- `frontend/src/features/generators/PowerFlowCard.tsx`
- `frontend/src/features/generators/detail/generator-detail-format.ts`
- `frontend/src/features/generators/detail/generator-detail-model.ts`
- `frontend/src/features/generators/vertical-card/VerticalControls.tsx`
- `frontend/src/features/generators/vertical-card/VerticalPowerFlow.tsx`
- `frontend/src/features/generators/vertical-card/VerticalTelemetrySections.tsx`
- `frontend/src/features/generators/vertical-card/vertical-reference-card.css`
- `frontend/src/lib/api.ts`

## Verificação Git direta

Uma inspeção inicial do gerenciador não mostrou `.git`, mas a verificação direta posterior confirmou que o checkout Git existe.

Estado observado:

- `git rev-parse HEAD = 20a68c2d0e146addcca708290a1564c63ffa305e`;
- `/var/lib/rc-geradores/deployed-commit` contém o mesmo SHA;
- checkout detached;
- `git status --porcelain` sem alterações locais;
- origin aponta para o repositório esperado.

Portanto a identidade da release está comprovada tanto pelo Git quanto pelo marcador de deploy.

## Impacto

- comportamento da produção pode não ser reproduzível a partir da `main`;
- auditorias feitas somente contra `main` podem produzir diagnóstico errado;
- rollback e rastreabilidade ficam frágeis;
- um PR ainda aberto está servindo, na prática, como release de produção.

## Regra corretiva

Nenhum novo deploy deverá ocorrer até existir mecanismo persistente de release contendo pelo menos:

- SHA/release esperado;
- data/hora;
- resultado de CI;
- resultado de smoke;
- versão de schema;
- Controller Packs habilitados;
- rollback target.

Deploy de branch/PR aberto deixa de ser fluxo normal.
