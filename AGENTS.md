# RC Geradores — instruções obrigatórias para agentes de IA

Este repositório controla uma plataforma SCADA/geradores com superfícies industriais reais. Antes de alterar código, leia nesta ordem:

1. `docs/governance/PROJECT_STATE.md`
2. `docs/governance/PRODUCTION_CONTRACT.md`
3. `docs/governance/CHANGE_BOUNDARIES.md`
4. `docs/audit/AUDIT_ZERO_MASTER.md`
5. `docs/governance/REGRESSION_MATRIX.md`
6. `docs/governance/AI_HANDOFF.md`

## Regras não negociáveis

- Nunca trate `main` como área de experimento.
- Um PR deve pertencer a um único domínio de mudança.
- Não misture card Vertical, card Compacto, infraestrutura, Rapid SCADA, banco, Controller Pack ou comandos industriais no mesmo PR.
- Nenhuma telemetria, cor, estado, alarme, nominal, limite ou comando pode ser inferido ou inventado pelo frontend.
- Escrita industrial só pode existir quando o Controller Pack, firmware, transporte, binding, executor e feedback estiverem explicitamente homologados.
- "FC16 aceito" ou "escrita Modbus aceita" não significa "ação física confirmada".
- Estado desconhecido deve ser neutro/N/D, nunca verde, vermelho ou sucesso por inferência.
- Toda correção de bug precisa de reprodução/regressão automatizada antes ou junto da correção.
- Toda alteração deve atualizar `docs/governance/PROJECT_STATE.md` quando mudar o estado conhecido do projeto.
- Antes de começar trabalho novo, verifique o SHA implantado e compare com o SHA/base documentado. Divergência é incidente de drift.
- Ao terminar um PR, registre: objetivo, domínio, arquivos tocados, testes, evidência, impacto em produção, rollback e próximo passo.

Se o contexto de um chat/IDE estiver incompleto, não adivinhe. Recomece pela documentação acima e pelo histórico do GitHub.
