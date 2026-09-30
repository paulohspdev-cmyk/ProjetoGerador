# Fronteiras de mudança

O objetivo é impedir que uma alteração aparentemente simples cause regressões em outra área.

## Domínios oficiais

| Domínio | Caminhos principais | Regra |
|---|---|---|
| Vertical | `frontend/src/features/generators/PowerFlowCard.tsx`, `vertical-card/**`, CSS vertical | Mudança do card Vertical não pode alterar Compacto/Lista nem tema global sem PR separado. |
| Compacto | `CompactCard.tsx`, `compact-card.css` | Mudança do Compacto não pode alterar Vertical. |
| Lista | `GeneratorTable.tsx` | Isolado das demais visualizações. |
| Layout da tela Geradores | `GeneratorsBoard.tsx` | Só paginação/grid/seleção de visualização. Componentes visuais devem ficar fora daqui. |
| Semântica visual | `generator-health.ts`, status/estado compartilhado | Não define layout. Só transforma estado explicitamente conhecido em semântica. |
| API/frontend | `frontend/src/lib/**`, Providers | Não inventa telemetria nem capability. |
| Backend de produto | `backend/app/**` exceto caminhos industriais especializados | Cadastro, auth, API, persistência e normalização. |
| Comando industrial | `control.py`, executores privilegiados, bridge de comando | Mudança exige contrato, feedback e teste específico. |
| Controller Packs | `controllers/**` | Um modelo/firmware por evidência; capabilities não podem ser promovidas por inferência. |
| Rapid SCADA | `rapid/**` | Templates, bindings, reader e provisionamento; não misturar com UI. |
| Banco/migração | `db.py`, stores, migrations | Mudança de schema/persistência isolada. |
| Bridge/transporte | `bridge*.py`, transportes, rede | Não misturar com layout/frontend. |
| Deploy/infra | `ops/**`, `infrastructure/**` | Não misturar com comportamento de card/comando. |
| Testes/governança | `tests/**`, `backend/tests/**`, `docs/governance/**` | Pode acompanhar o domínio alterado, sem mudar comportamento produtivo por conta própria. |

## Regra de um domínio por PR

Um PR funcional escolhe exatamente um domínio primário. Testes e documentação desse domínio podem acompanhar o PR. Se a solução exigir outro domínio, crie um segundo PR encadeado.

Exemplos:

- "Ajustar card Vertical": não editar `CompactCard.tsx`, `compact-card.css`, Rapid ou banco.
- "Ajustar Compacto": não editar CSS/TSX Vertical.
- "Corrigir cor por status": primeiro definir a semântica em contrato/teste; depois alterar o domínio visual necessário.
- "Adicionar modo AUTO à DSE": primeiro Controller Pack/evidência; depois executor industrial; depois UI. São PRs separados.
- "Alterar template Rapid": não aproveitar o PR para mexer em card.
- "Alterar deploy": não habilitar capability industrial no mesmo PR.

## Arquivos atualmente com responsabilidade excessiva

- `GeneratorsBoard.tsx` contém decisões de layout Vertical e Compacto no mesmo arquivo. Deve ser decomposto durante a Auditoria Zero.
- `vertical-reference-card.css` é muito grande e concentra múltiplas seções do Vertical. Deve ser dividido sem mudança visual, em PR próprio de refatoração.

## Critério de rejeição

Se um diff atravessar domínios sem justificativa explícita e plano de testes independente, o PR não deve ser integrado.
