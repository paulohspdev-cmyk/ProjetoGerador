# Arquitetura oficial do frontend RC Geradores

Este documento define a organização obrigatória do frontend. O objetivo é manter componentização, design tokens e separação de responsabilidades sem transformar o projeto em uma árvore artificial de pastas.

## Estrutura

```text
src/
├── assets/          # catálogo e referências de assets estáticos
├── components/      # componentes React
│   ├── auth/        # autenticação
│   ├── generators/  # experiência de geradores
│   ├── layout/      # shell, sidebar, topbar e tema
│   ├── scada/       # telas e componentes funcionais SCADA
│   └── ui/          # primitives reutilizáveis
├── data/            # tipos e dados de domínio do frontend, nunca imagens ou estilos
├── hooks/           # hooks compartilhados
├── lib/             # APIs, utilitários e integrações de frontend
├── routes/          # rotas TanStack
└── styles/
    ├── index.css    # única entrada global de CSS
    ├── tokens.css   # design tokens globais e temas
    └── base.css     # reset/base global mínimo

scripts/             # automações de desenvolvimento e qualidade
ops/                 # instalação, deploy, restore e operação da VM
public/               # arquivos servidos estaticamente
```

## Regras

1. **Design tokens**
   - Cor de produto, estado, borda, superfície, tipografia, radius, shadow e tema devem nascer em `src/styles/tokens.css`.
   - Componentes consomem tokens semânticos (`primary`, `online`, `alert`, `offline`, etc.).
   - Cores literais são aceitáveis apenas quando fazem parte de uma ilustração física/industrial que não muda com o tema, por exemplo o desenho de uma controladora.

2. **CSS**
   - CSS global somente em `src/styles/`.
   - CSS específico de um componente pode ficar junto do componente proprietário em `src/components/**`.
   - Não criar novamente `src/styles.css`.

3. **Assets**
   - Mapeamentos, nomes e resolução de assets pertencem a `src/assets/`.
   - Arquivos públicos continuam em `public/` quando precisam de URL estável.
   - `src/data/` não deve concentrar regras de localização de imagens.

4. **Componentização**
   - `src/components/ui/` contém primitives genéricas.
   - Componentes de domínio ficam no módulo funcional correspondente.
   - Uma tela deve extrair subcomponentes quando passa a misturar apresentação, formulário, tabela, diálogo e regras independentes.
   - Providers devem cuidar de estado/orquestração e não de markup de telas.

5. **Scripts**
   - `scripts/` é para desenvolvimento/qualidade.
   - `ops/` é para operação da VM e produção. Não mover scripts de instalação/deploy para `scripts/` apenas para satisfazer convenção estética.

6. **Qualidade automática**
   - `npm run check:architecture` valida a estrutura.
   - `npm run lint` valida código.
   - `npm run build` valida o bundle de produção.
   - `npm run quality` executa os três em sequência.
   - O workflow `Quality and Security` executa a validação arquitetural em toda PR.

## Design tokens existentes

O sistema possui tokens semânticos para tema claro/escuro, incluindo:

- `background`, `foreground`, `card`, `panel`, `popover`;
- `primary`, `secondary`, `muted`, `accent`, `destructive`;
- estados industriais `online`, `alert`, `offline`, `idle`, `wire`, `info`;
- borda/input/ring;
- gráficos;
- sidebar;
- tipografia, radius, sombras e glow.

## Política industrial

Refatorações de frontend não autorizam novos comandos nem criam telemetria. START/STOP permanecem os únicos comandos homologados para o caminho atual da InteliGen 200. kW, MCB, GCB, rede, paralelismo e outros estados só podem ser mostrados quando houver canal homologado no Controller Pack/Rapid SCADA.
