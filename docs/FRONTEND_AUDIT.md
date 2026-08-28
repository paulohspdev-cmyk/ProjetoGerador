# Auditoria do frontend Generator Vision

## Estado atual

O frontend foi importado preservando a aplicação React/TanStack existente e validado com `npm ci` e `npm run build` antes do commit.

Tecnologias principais encontradas:

- React 19 + TypeScript
- TanStack Start / Router
- Vite
- Tailwind CSS
- React Query
- Radix UI / componentes shadcn
- Leaflet
- Recharts

## Estrutura funcional

O menu já cobre operação, monitoramento, energia, manutenção, equipamentos, automação, SCADA, biblioteca, gestão, integrações e sistema.

As telas e componentes de geradores já incluem cards compactos, power flow, MCB/GCB, START/STOP, modos OFF/ON/AUT/TEST, detalhe do equipamento, RPM, grandezas elétricas, motor, alarmes e eventos.

## Pontos que ainda são protótipo

### Geradores

`GeneratorsProvider.tsx` persiste o cadastro em `localStorage` e usa `SEED_GENERATORS` como fonte inicial. A migração será feita para `/api/generators` sem redesenhar os componentes.

### Autenticação

`AuthProvider.tsx` guarda usuários, senha e sessão no navegador. Isto é somente protótipo. A produção deverá usar autenticação no backend, hash de senha, sessão/token seguro, RBAC e auditoria.

### Operações auxiliares

`ScadaOpsProvider.tsx` mantém alarmes reconhecidos, relatórios, ordens de serviço, agenda, regras, clientes, backups e webhooks em `localStorage`. Estes estados deverão ser movidos gradualmente para o backend.

### Comandos

Os componentes simulam START/STOP, modos, MCB/GCB e paralelismo no navegador. Em produção nenhum comando industrial deve depender desse estado local. Os botões serão ligados a uma API de controle com capacidade por modelo, autenticação, confirmação, intertravamentos e auditoria.

## Regra de integração

O frontend não será reescrito para se adaptar ao Rapid SCADA. O backend normaliza os dados industriais para o contrato já esperado pelos componentes React.

Fluxo alvo:

```text
Controladora -> transporte -> Rapid SCADA -> RC API -> React Query/Providers -> interface atual
```

O banco do produto guarda cadastro e gestão. Telemetria, estados industriais, histórico e alarmes devem vir do Rapid SCADA sempre que aplicável.
