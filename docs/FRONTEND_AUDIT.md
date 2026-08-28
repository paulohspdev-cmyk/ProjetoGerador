# Auditoria do frontend RC Geradores

## Estado atual

O frontend React/TanStack já está integrado ao backend RC Geradores. Este documento substitui a auditoria antiga que ainda descrevia `localStorage`, seeds e comandos simulados.

Tecnologias principais:

- React 19 + TypeScript
- TanStack Start / Router
- Vite
- Tailwind CSS
- React Query
- Radix UI / componentes shadcn
- Leaflet
- Recharts

## Fontes de dados

### Geradores

`GeneratorsProvider.tsx` usa exclusivamente `/api/generators` para listar, cadastrar e remover geradores. Não existe `SEED_GENERATORS` como fonte operacional.

### Autenticação

`AuthProvider.tsx` usa os endpoints `/api/auth/*` e `/api/users`. Senha, sessão e RBAC são tratados no backend; a sessão web usa cookie HTTP-only.

### Operações auxiliares

`ScadaOpsProvider.tsx` usa API persistente para configurações, reconhecimento de alarmes, relatórios, ordens de serviço, agenda, regras de automação, clientes, backups e webhooks.

### Telemetria

A interface só apresenta uma grandeza industrial quando a métrica aparece em `availableMetrics`, que é derivado do binding Rapid SCADA do Controller Pack. Métrica não homologada aparece como `N/D` e não recebe estimativa ou valor demonstrativo.

O fluxo operacional é:

```text
Controladora -> transporte -> Rapid SCADA -> RC API -> React -> interface
```

O banco do produto guarda cadastro e gestão. Telemetria e histórico industrial vêm do Rapid SCADA.

## Comandos industriais

Na tela de detalhe:

- `START` e `STOP` chamam a API e somente ficam disponíveis para perfil autorizado;
- o backend restringe o controle ao Controller Pack homologado;
- `AUTO`, `TEST`, `MCB`, `GCB` e paralelismo permanecem bloqueados;
- nenhum botão industrial altera somente estado local para fingir uma operação real.

O primeiro Controller Pack de produção é o **ComAp InteliGen 200**. Telemetria validada: RPM, frequência e tensões do gerador. START/STOP foram validados em campo. As demais capacidades permanecem desabilitadas no manifest.

## Dados legados

`src/data/scada.ts` ainda exporta algumas coleções vazias para manter compatibilidade com telas antigas durante a migração. Elas não contêm dados demonstrativos e não são fonte de telemetria.

## Critério para produção

Antes de uma versão ser instalada em VM:

1. o CI da `main` deve estar verde;
2. `npm run build` e TypeScript devem passar;
3. nenhum dado/série industrial demonstrativo conhecido pode existir no frontend;
4. comandos não homologados devem permanecer bloqueados;
5. a VM deve passar `sudo /opt/rc-geradores/ops/vm-smoke.sh`;
6. quando houver gerador provisionado, o smoke deve validar binding, portas da bridge e serviços Rapid.
