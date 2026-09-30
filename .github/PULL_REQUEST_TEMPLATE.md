## Domínio

Escolha exatamente um domínio primário: Vertical / Compacto / Lista / Semântica / API frontend / Backend / Comando industrial / Controller Pack / Rapid / Banco / Bridge / Deploy / Testes-Governança.

## Problema

Descreva o comportamento observado e a evidência. Não misture sintomas de outros domínios.

## Contrato esperado

Qual regra de `PRODUCTION_CONTRACT.md` ou requisito verificável deve valer?

## Arquivos tocados

Liste os caminhos. Explique qualquer arquivo fora do domínio primário.

## Teste de regressão

- [ ] reproduz o defeito antes da correção
- [ ] passa após a correção
- [ ] suíte do domínio passa
- [ ] CI geral passa

## Produção/campo

- SHA da VM:
- Firmware/modelo:
- Evidência:
- Comando real executado? sim/não
- Se não, o que continua não homologado?

## Risco e rollback

Informe impacto, rollback e se a bridge/sessões/controladoras podem ser afetadas.

## Continuidade

- [ ] `docs/governance/PROJECT_STATE.md` atualizado quando necessário
- [ ] `BUG_LEDGER.md`/auditoria atualizado
- [ ] próximo passo registrado
