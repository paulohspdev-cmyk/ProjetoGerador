# Organização do repositório RC Geradores

> Auditoria de 12/11/2026. Este documento define **processo e inventário**, não homologa equipamentos e não altera o runtime. Controle principal: [#238](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/238).

## 1. Fonte oficial e regras de publicação

- **`main`**: ramo de integração do produto. Mudanças devem entrar por PR com verificações aprovadas; não fazer push direto para `main`.
- **Release de produção**: commit SHA exato, aprovado em testes, acompanhado de backup, evidências e rollback. Não supor que `HEAD` é necessariamente o binário/processo implantado.
- **VM**: configuração operacional, banco, templates efetivos, variáveis e builds podem estar fora do Git; são auditados separadamente. Não copiar arquivos da VM para Git sem remover segredos.
- **Instalação**: dedicada por cliente. Não converter acidentalmente para SaaS nem ativar 2FA nesta instalação sem decisão explícita.
- **Industrial**: não executar START/STOP, FC06/FC16 ou mudar permissivos durante testes de código. Leitura de telemetria deve respeitar FC03/FC04 e os Controller Packs homologados.
- **Uma mudança funcional por domínio**: veja `AGENTS.md`, `PRODUCTION_CONTRACT.md`, `CHANGE_BOUNDARIES.md` e `REGRESSION_MATRIX.md`.

## 2. Fotografia verificada em 12/11/2026

| Item | Evidência | Consequência |
|---|---|---|
| GitHub `main` | `ab39aba32da77cd559ad9fd6d29d0cad058561ca`; 432 arquivos versionados | Baseline atual do GitHub |
| VM checkout | `e3f20c7ad8979234f2fbbba2ace5123628160f8d`, branch `feat/g113-ignt-readonly-preflight`, Git limpo | Um commit à frente da `main`, com **dois arquivos de pré-homologação somente leitura** |
| Marcador implantado | `afec24a685e23707d7d2c230f6a3e373a8cd8ff6` | Divergência de deploy; não corrigir marcador sem identificar release efetivo |
| Branches GitHub | 135 | Inventário necessário antes de qualquer exclusão |
| Pull requests abertos | #62, #235, #236, #237, todos draft | Decisão individual por domínio |
| Último CI da `main` | Falha em `GeneratorsBoard.tsx` (21 KiB, limite de 20 KiB) | [#239](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/239) |
| Último Quality and Security | 8 alertas npm: 5 críticos e 3 altos no run de 29/10/2026 | [#240](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/240); reexecutar audit em ambiente isolado |
| Último E2E separado da `main` | Sucesso no run de 29/10/2026 | Não substitui CI geral ou homologação física |

Fontes CI: [CI](https://github.com/paulohspdev-cmyk/ProjetoGerador/actions/runs/40946624416), [Quality and Security](https://github.com/paulohspdev-cmyk/ProjetoGerador/actions/runs/40946624464), [E2E](https://github.com/paulohspdev-cmyk/ProjetoGerador/actions/runs/40946624237). Resultados são uma fotografia, não garantia de situação atual.

## 3. Organização por domínio

| Diretório | Responsabilidade | Exigências |
|---|---|---|
| `backend/` | FastAPI, cadastro, autorização, estado de produto, workers | Testes backend, RBAC e contratos |
| `backend/app/bridge*.py` | Transporte reverse TCP/RTU, framing e sessões | Homologação de protocolo, regressão sem escrita e rollback |
| `frontend/` | TanStack, telas, cards e navegação | Verificações de arquitetura, lint, tipos, build e E2E |
| `controllers/` | Catálogo, laboratório e packs industriais | Evidência por modelo/firmware, capacidades fechadas por padrão |
| `rapid/` | Templates e provisionamento Rapid SCADA | Diff entre templates versionados e efetivos + `dry-run` |
| `ops/` e `infrastructure/` | Deploy, rede, firewall, systemd, backup | Backup, preflight, smoke, rollback, controle de drift |
| `tests/` e `backend/tests/` | Testes e contratos transversais | Testes mínimos de regressão para cada correção |
| `docs/` | Contratos, decisões, auditorias, handoff | Atualizar estado e apontar evidências |

As áreas com responsabilidade excessiva devem ser divididas **por PR**, preservando comportamento: `GeneratorsBoard.tsx`, integrações de bridge e módulos que misturam comando e telemetria. Não reorganizar diretórios inteiros num único commit.

## 4. Política de branches

Novos nomes:
- `fix/<problema>` para bugs;
- `feat/<recurso>` para novos recursos;
- `security/<problema>` para vulnerabilidades;
- `refactor/<dominio>` para refatorações sem mudança funcional;
- `docs/<tema>` para documentação;
- `release/<data-ou-versao>` apenas para release formal;
- `backup/<contexto>` apenas para preservação deliberada, com referência e retenção definidos.

As 135 branches existentes **não são lixo por definição**. Classificar cada uma como:
1. **Ativa** — PR aberto ou trabalho que ainda será integrado.
2. **Já integrada** — resultado incorporado na `main`, confirmar por ancestry/diff, não apenas por nome.
3. **Histórica para preservação** — backup, release, experimento de campo ou referência de rollback.
4. **Candidata a remoção** — sem PR, sem alterações únicas e sem papel de recovery.

Antes de remover: registrar nome, SHA, último commit, autor, PR relacionado, ancestria/patch em relação à `main`, backups e motivo da decisão. Revisão do proprietário obrigatória. Nunca excluir `main` ou refs de release/backup sem estratégia formal. **Não houve remoção de branches nesta auditoria**.

## 5. Pull requests abertos em 12/11/2026

| PR | Tema | Tratamento |
|---|---|---|
| [#62](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/62) | Gateway universal | Revisar escopo, atualidade e sobreposição com bridge de produção |
| [#235](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/235) | Cadastro/edição/modems | Manter auditoria separada de correção |
| [#236](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/236) | Auditoria de superfícies e contratos | Consolidar evidência, sem misturar mudanças funcionais |
| [#237](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/237) | DEIF AGC 150 somente leitura | Exigir evidência real e testes de Controller Pack |

Não fechar, integrar ou converter em prontos automaticamente.

## 6. Ordem segura da remediação

1. **P0 Segurança** — atualizar dependências em branch isolada, revisar advisories e lockfile; rodar `npm audit --audit-level=high`, `npm run check`, build e E2E. Ver [#240](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/240).
2. **P0 CI** — dividir responsabilidades de `GeneratorsBoard.tsx` sem elevar o limite de 20 KiB nem alterar comportamento dos cards; regressão/E2E. Ver [#239](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/239).
3. **P1 Produção** — reconciliar SHA do checkout, `deployed-commit`, build `.output`, processos, configuração e templates Rapid; executar deploy transacional somente após backup e smoke.
4. **P1 Branches** — executar inventário completo, revisar propostas de arquivo/remoção com o proprietário e preservar os SHAs históricos.
5. **P2 Qualidade** — refatorações por domínio, revisão de complexidade/duplicação, testes de uso, logs, performance e documentação.
6. **Conclusão** — `main` íntegra, CI/segurança verdes, releases por SHA, referências antigas classificadas e rollback testado.

## 7. Checklist de um PR

- [ ] Resolve uma issue e declara exatamente um domínio.
- [ ] Mostra comportamento anterior, causa, contrato esperado e caminhos alterados.
- [ ] Não altera outro domínio por conveniência.
- [ ] Adiciona/registra regressão; lint, tipos, build, CI e testes do domínio.
- [ ] Em código industrial: confirma pack, firmware, mapa Modbus, estado real e ausência de comando não autorizado.
- [ ] Registra risco, backup, plano de rollback e impacto na VM.
- [ ] Atualiza `PROJECT_STATE.md` quando mudar estado conhecido e `BUG_LEDGER.md` quando aplicável.
- [ ] Não realiza deploy automático para máquinas de cliente sem aprovação.

## 8. Proteções e acesso

O endpoint GitHub de consulta detalhada às proteções da `main` retornou 403 para a integração, e a listagem de branch marcava `protected=false`. Um administrador deve verificar **Settings → Rules → Rulesets / Branch protection** e configurar restrições de push direto, reviews e checks obrigatórios conforme disponibilidade do plano. Não inventar política aplicada sem validar na interface.

O repositório é público: antes de publicar logs e exports, verificar credenciais, endereços sensíveis, chaves SSH, dados de clientes, backups e material de campo. Nunca commitar `.env`, segredos ou arquivos operacionais da VM.

---

**Estado desta entrega:** documentação e tarefas preparadas via PR de governança. Sem remoções de branch, sem alteração no runtime ou na VM, sem aprovação automática e sem mudanças de código industrial.