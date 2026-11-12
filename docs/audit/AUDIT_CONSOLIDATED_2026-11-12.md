# Consolidado de auditorias históricas — RC Geradores

Data da triagem: **12/11/2026**. Os relatórios originais de 14/10/2026 permanecem preservados nos PRs [#235](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/235) e [#236](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/236) e nas respectivas branches de origem. Sua baseline foi `afec24a` — **não** o commit atual da `main`.

Este consolidado contém as conclusões técnicas relevantes **sem importar 23 mil linhas de inventários brutos de uma instalação**, que podem expor detalhes operacionais e representam uma fotografia já desatualizada. Fechar os PRs de auditoria após esta integração **não** significa que os bugs listados foram corrigidos.

## Estado do GitHub examinado

- Código oficial anterior a esta rodada: `8ff49c5f`, CI, E2E e Quality and Security aprovados.
- CAD-01 (salvamento precoce): corrigido **no código da main** pelo PR [#249](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/249), após CI e E2E; **não implantado na VM**.
- SYS-006 (Bearer vazio causando HTTP 500): correção no PR [#250](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/250), com oito testes de regressão e CI/E2E exigidos; conferir merge antes de marcar concluído.
- Os demais itens abaixo são **pendências a reproduzir na main atual** antes de qualquer correção. A issue [#106](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/106) é o acompanhamento de remediação.

## CAD — Cadastro, edição, modems e diagramas

| ID | Diagnóstico da auditoria de outubro | Estado da triagem |
|---|---|---|
| CAD-01 | POST de cadastro ao clicar Continuar em vez de confirmar | Código corrigido no PR #249; deploy não realizado |
| CAD-02 | PATCH pode informar erro de modem após gravar campos | Revalidar e corrigir atomicidade |
| CAD-03 | POST pode criar registro e retornar 500 | Revalidar transação e idempotência |
| CAD-04 | Reconfiguração + edição podem aplicar parcialmente | Revalidar rollback e compensação |
| CAD-05 | Campos obrigatórios só com espaços podem ser aceitos | Revalidar validação frontend/backend |
| CAD-06 | Editores simultâneos sobrescrevem dados | Definir versão/conflito/concorrência |
| CAD-07 | Troca de modem preserva metadados de vínculo antigo | Revalidar limpeza transacional |
| CAD-08 | Relação “mede” pode virar ligação elétrica | Corrigir semântica do diagrama com teste |
| CAD-09 | Rótulo de gerador pode diferir do Device Rapid | Definir política de propagação de nome |
| CAD-10 | Perfil de cadastro de serial pode não salvar parâmetros | Testar permissões e fluxo serial |
| CAD-11 | Frontend/backend resolvem porta do modem de modo diferente | Unificar admissionPort/listen_port |
| CAD-12 | Falha de refresh pode fechar edição como sucesso | Propagar erro e permitir recuperação |
| CAD-13 | PATCH genérico pode modificar enabled sem lifecycle | Revalidar autorização e contrato de estado |
| CAD-14 | Fechamento durante salvamento não esclarece se persistiu | Tratar cancelamento e resultado tardio |

## SYS — Auditoria sistêmica

| ID | Achado de outubro | Próximo aceite |
|---|---|---|
| SYS-001 | Webhook sem destinatários pode sinalizar sucesso indevido | Distinguir processamento de entrega efetiva |
| SYS-002 | Ferramenta pip de produção tinha advisories | Atualizar ferramenta com testes de instalação/rollback; não confundir com API exposta |
| SYS-003 | Rotas sem response_model explícito | Formalizar contratos críticos gradualmente, sem assumir 132 bugs |
| SYS-006 | Bearer vazio pode causar HTTP 500 | PR #250; HTTP 401 + regressões, sem alterar tokens válidos |
| SYS-007 | Overlay de telemetria realiza consultas redundantes de catálogo | Medir custo e otimizar sem alterar valores industriais |

## Evidências históricas úteis

- Em outubro, a auditoria de cadastro usou 16 cenários API/banco isolados e caracterizou defeitos de confirmação e persistência.
- A auditoria sistêmica inventariou 132 rotas, 50 tabelas, 313 ocorrências de controle JSX e 354 casos de autorização; dois casos de Bearer vazio produziram 500.
- Esses números se referem à **baseline de outubro** e não descrevem necessariamente a versão atual, o estado da VM ou a homologação física.
- Os PRs originais continham material bruto de inventário e testes de caracterização de defeitos. **Não integrar testes cujo “sucesso” depende de reproduzir comportamento incorreto.** Corrigir e inverter os asserts no domínio responsável, como feito em CAD-01.

## Regra para encerrar cada pendência

1. Reproduzir na `main` atual em ambiente isolado; não confiar apenas na fotografia histórica.
2. Corrigir em PR de um domínio primário, com teste que falha antes e passa depois.
3. Validar CI, segurança e E2E quando aplicável; atualização de docs/ledger.
4. Em comunicação industrial, exigir evidência de firmware, Unit ID, transporte e feedback real antes de declarar homologação.
5. Realizar deploy separado na instalação dedicada, com backup, rollback, smoke e SHA registrado. O GitHub verde **não** significa que a VM está sincronizada.

Fontes originais permanecem consultáveis:
- [PR #235 — auditoria cadastro](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/235)
- [PR #236 — auditoria sistêmica](https://github.com/paulohspdev-cmyk/ProjetoGerador/pull/236)
- [Issue #106 — plano de remediação](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/106)
- [Issue #238 — organização GitHub](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/238)
