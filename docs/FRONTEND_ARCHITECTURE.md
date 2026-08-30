# Arquitetura do frontend RC Geradores

## Objetivo

Manter o frontend previsível, componentizado e seguro para evolução do SCADA, sem misturar assets, estilos globais, componentes, dados, integração HTTP e scripts operacionais.

## Estrutura oficial

```text
src/
├── assets/        # catálogo e resolução de assets visuais usados pela aplicação
├── components/    # componentes React reutilizáveis e telas compostas
│   ├── auth/
│   ├── generators/
│   ├── layout/
│   ├── scada/
│   └── ui/        # primitives/biblioteca de UI
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

## Regras

1. **Design tokens**: cor, tipografia, raio, sombra e estado operacional globais pertencem a `src/styles/tokens.css`.
2. **Estilo global**: reset/base em `src/styles/base.css`; utilitários globais em `src/styles/utilities.css`.
3. **CSS específico de componente**: permanece colocalizado com o componente quando não é reutilizável globalmente. Não mover CSS local para `styles/` apenas por organização visual.
4. **Assets**: referências e resolução de assets pertencem a `src/assets/`. Binários que precisam de URL pública permanecem em `public/`.
5. **Componentes**: componentes da aplicação devem ficar abaixo de 30 KiB. Se ultrapassarem o limite, dividir por responsabilidade antes de adicionar novas funções.
6. **UI primitives**: `src/components/ui/` é biblioteca base; telas de negócio não devem ser implementadas ali.
7. **Integração**: chamadas HTTP e contratos externos ficam em `src/lib/`; componentes não devem duplicar clientes de API.
8. **Dados industriais**: nenhum token, componente ou estilo pode inventar telemetria, estado ou limite industrial.
9. **Scripts**: `scripts/` é para qualidade/desenvolvimento; `ops/` continua exclusivo para VM, deploy e operação.
10. **Guardrail**: `npm run check:architecture` é obrigatório no pipeline `Quality and Security`.

## Comandos de validação

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm run build
```

`npm run check` executa arquitetura, lint e build em sequência.
