# Arquitetura do frontend RC Geradores

## Objetivo

Manter o frontend previsível, componentizado e seguro para evolução do SCADA, sem misturar assets, estilos globais, componentes, dados, integração HTTP e scripts operacionais. A organização também deve impedir que a camada visual invente significado industrial.

## Estrutura oficial

```text
src/
├── assets/        # catálogo e resolução de assets visuais usados pela aplicação
├── components/    # componentes React reutilizáveis e telas compostas
│   ├── auth/
│   ├── generators/
│   │   ├── detail/      # composição da tela detalhada por responsabilidade
│   │   └── power-flow/  # diagrama e primitives do fluxo de potência
│   ├── layout/
│   ├── scada/
│   └── ui/        # primitives/biblioteca base de UI
├── data/          # tipos e dados estáticos de domínio/navegação; não armazena assets
├── hooks/         # hooks React compartilhados
├── lib/           # clientes HTTP, autenticação e utilidades sem apresentação
├── routes/        # composição e roteamento TanStack
├── styles/        # design tokens e estilos globais
│   ├── tokens.css
│   ├── base.css
│   └── utilities.css
└── styles.css     # único entrypoint global de CSS

scripts/           # automação de engenharia/qualidade executada no repositório
ops/               # instalação, deploy, restore e operação da VM de produção
public/            # arquivos estáticos servidos por URL pública
```

## Regras obrigatórias

1. **Design tokens semânticos**: cor, tipografia, raio, sombra, superfície e estado operacional globais pertencem a `src/styles/tokens.css`. Componentes pedem significado (`info`, `online`, `alert`, `offline`, `industrial-*`) em vez de repetir cores brutas.
2. **Estilo global**: reset/base em `src/styles/base.css`; utilitários globais em `src/styles/utilities.css`; `src/styles.css` é somente o entrypoint.
3. **CSS específico de componente**: permanece colocalizado quando não é reutilizável globalmente. Não mover CSS local para `styles/` apenas por aparência de organização.
4. **Assets**: referências e resolução pertencem a `src/assets/`. Binários que precisam de URL pública permanecem em `public/`. Imports por `src/data/controller-images.ts` são proibidos.
5. **Componentes de negócio**: limite de 20 KiB por arquivo em `src/components/`, exceto primitives da biblioteca `ui`. Arquivos maiores devem ser divididos por responsabilidade.
6. **UI primitives**: `src/components/ui/` pode chegar a 30 KiB por primitive quando a biblioteca exigir; telas e regras de negócio não devem ser implementadas ali.
7. **Separação por responsabilidade**: carregamento remoto, transformação de telemetria, primitives visuais e composição de tela devem ser separados quando crescerem. `GeneratorDetailScreen` é composição; seu modelo, hook, power-flow, overview, elétrica e histórico ficam separados.
8. **Integração**: chamadas HTTP e contratos externos ficam em `src/lib/`; componentes não duplicam clientes de API.
9. **Métricas**: leitura, verificação de disponibilidade e formatação reutilizável de métricas pertencem aos utilitários do domínio de geradores, evitando implementações paralelas.
10. **Dados industriais**: nenhum token, componente ou stylesheet pode inventar telemetria, nominal, escala, estado, alarme ou limite industrial. Limites operacionais só podem vir de Controller Pack/configuração homologada.
11. **kW**: sem canal real e potência nominal homologada, a interface mostra `N/D`; não cria valor nem escala automática.
12. **Comandos**: refatoração visual não amplia capacidades industriais. START/STOP continuam no caminho homologado; MCB/GCB/AUTO/TEST/paralelismo permanecem bloqueados enquanto não homologados.
13. **Scripts**: `scripts/` é para qualidade/desenvolvimento; `ops/` continua exclusivo para VM, deploy e operação.
14. **Guardrail**: `npm run check:architecture` é obrigatório no CI e no deploy oficial.

## Validação única

```bash
npm run check
```

O comando executa, nesta ordem:

```text
check:architecture
lint
typecheck
build
```

O CI acrescenta smoke do servidor, testes do backend, provisionamento e política industrial. O deploy oficial repete arquitetura, lint, typecheck e build em staging antes de tocar a produção.

## Critério de arquitetura aprovada

A arquitetura só é considerada aprovada quando:

- as pastas e entrypoints obrigatórios existem;
- nenhum componente de negócio excede 20 KiB;
- não existe shim/import legado de assets;
- os CSS industriais governados não contêm cores brutas;
- os tokens semânticos obrigatórios existem;
- os padrões conhecidos de escala/limiar inventado não reaparecem;
- lint, TypeScript e build passam;
- a política industrial permanece restrita aos comandos homologados.
