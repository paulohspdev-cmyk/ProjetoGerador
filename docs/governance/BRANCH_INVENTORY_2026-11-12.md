# Inventário de branches — 12/11/2026

**Fotografia de auditoria, não autorização de exclusão.** O repositório tinha 135 branches antes da criação da branch de governança `docs/repository-organization-20261112`, totalizando **136** neste inventário. Nomes e SHAs consultados no GitHub. Status de ancestry só considerado quando o commit `origin/<branch>` no clone da VM coincide com o SHA atual do GitHub; referências divergentes ficam sem julgamento.

## Resumo de triagem preliminar
- **Não ancestral de main — avaliar diff:** 105
- **PR #235 aberto — revisar:** 1
- **PR #236 aberto — revisar:** 1
- **Release/backup — retenção explícita:** 12
- **SHA não validado no clone da VM:** 11
- **Auditoria em andamento — preservar:** 1
- **Ancestral de main — revisar:** 2
- **PR #237 aberto — revisar:** 1
- **PR #62 aberto — revisar:** 1
- **Oficial — preservar:** 1

| Branch | SHA abreviado | Data no clone, se SHA validado | Classificação preliminar |
|---|---|---|---|
| [`audit/cleanup-20260919`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/cleanup-20260919) | `556f5713c228` | 2026-09-19 | Não ancestral de main — avaliar diff |
| [`audit/frontend-responsive-20260918`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/frontend-responsive-20260918) | `e6a3e1b8deee` | 2026-09-18 | Não ancestral de main — avaliar diff |
| [`audit/generator-registration-20261014`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/generator-registration-20261014) | `54ac69fbf531` | — | PR #235 aberto — revisar |
| [`audit/system-matrix-20261014`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/system-matrix-20261014) | `27caa91c2189` | — | PR #236 aberto — revisar |
| [`audit/zero-baseline-governance`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/zero-baseline-governance) | `73f481dadc1b` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`audit/zero-evidence-2026-09-29`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/audit/zero-evidence-2026-09-29) | `c354f68b19ab` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`backup/main-pre-vm-sync-20260910`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/backup/main-pre-vm-sync-20260910) | `3470cd9271ac` | 2026-09-02 | Release/backup — retenção explícita |
| [`backup/vm-installed-c6a48bc-20260901`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/backup/vm-installed-c6a48bc-20260901) | `c6a48bc8b96d` | 2026-09-01 | Release/backup — retenção explícita |
| [`checkpoint/pre-complete-system-20260828`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/checkpoint/pre-complete-system-20260828) | `d3156d550443` | 2026-08-28 | Release/backup — retenção explícita |
| [`chore/dse6120-promotion-finalize-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/chore/dse6120-promotion-finalize-20261002) | `3384d5ebc44f` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`chore/fix-brace-expansion-audit`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/chore/fix-brace-expansion-audit) | `2369f6832ebd` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`docs/dedicated-release-validation-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/docs/dedicated-release-validation-20261011) | `a41dbc94260e` | — | SHA não validado no clone da VM |
| [`docs/production-release-evidence-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/docs/production-release-evidence-20261011) | `e15fea81e7d7` | — | SHA não validado no clone da VM |
| [`docs/repository-organization-20261112`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/docs/repository-organization-20261112) | `bdd6dee20f4e` | — | Auditoria em andamento — preservar |
| [`export/frontend-isolado-20260908`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/export/frontend-isolado-20260908) | `3470cd9271ac` | 2026-09-02 | Ancestral de main — revisar |
| [`factory/auditoria-producao`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/factory/auditoria-producao) | `903716ec7463` | 2026-09-29 | Ancestral de main — revisar |
| [`factory/generator-detail-scada-20260929`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/factory/generator-detail-scada-20260929) | `698677ce4f78` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`feat/deif-agc150-catalog-20261105`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/deif-agc150-catalog-20261105) | `9ee30fad445c` | — | PR #237 aberto — revisar |
| [`feat/dse6120-catalog-final-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/dse6120-catalog-final-20261002) | `f0c10484b5f6` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`feat/dse6120-catalog-pending-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/dse6120-catalog-pending-20261002) | `d341a50e4c42` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`feat/dse6120-pack-readonly-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/dse6120-pack-readonly-20261002) | `7f8c27bc8bb9` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`feat/dse-controller-library`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/dse-controller-library) | `5c6ad4d35c16` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`feat/g113-ignt-readonly-preflight`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/g113-ignt-readonly-preflight) | `e3f20c7ad897` | — | SHA não validado no clone da VM |
| [`feat/g132-intelicompact-pack`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/g132-intelicompact-pack) | `035845f07dcc` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`feat/gateway-umbrella-foundation`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/gateway-umbrella-foundation) | `0555ae6db284` | 2026-09-04 | PR #62 aberto — revisar |
| [`feat/generator-fullscreen-auto-rotate`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/generator-fullscreen-auto-rotate) | `d85b48249f42` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`feat/ig4-prod-bridge`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/ig4-prod-bridge) | `ef6bb4af39f4` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feat/ig4-prod-capabilities`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/ig4-prod-capabilities) | `9d55501f1d39` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feat/ig4-prod-control`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/ig4-prod-control) | `30dda0ae516a` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feat/ig4-prod-policy`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/ig4-prod-policy) | `3a999423c5ad` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feat/ig4-prod-start-stop-203-204`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/ig4-prod-start-stop-203-204) | `47514f52f6cc` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feat/libera-catalogo-controladoras`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feat/libera-catalogo-controladoras) | `e3eca53a33ed` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`feature/gen163-dse-start-4-8`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/gen163-dse-start-4-8) | `20a68c2d0e14` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`feature/generator-approved-modem-gate`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/generator-approved-modem-gate) | `9dc21d1739af` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feature/generator-selects-approved-modem`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/generator-selects-approved-modem) | `b41017ed4393` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feature/modem-admission-api`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/modem-admission-api) | `c1bc654aab3d` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feature/modem-admission-client`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/modem-admission-client) | `6d0b7af300b1` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feature/modem-admission-store`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/modem-admission-store) | `48559e119a9b` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`feature/modem-admission-ui`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/feature/modem-admission-ui) | `5266f5ba297c` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/auditoria-funcional-profissional`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/auditoria-funcional-profissional) | `4967a84d7d79` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/auditoria-total-20260908`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/auditoria-total-20260908) | `76a0787b20a8` | 2026-09-09 | Não ancestral de main — avaliar diff |
| [`fix/bridge-command-concurrency-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/bridge-command-concurrency-20261011) | `d9d2c210ef43` | — | SHA não validado no clone da VM |
| [`fix/card-bars-responsive`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/card-bars-responsive) | `2a2db90b6cfe` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/card-original-size`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/card-original-size) | `bb0cfe6503f3` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/card-zero-fallback-and-density`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/card-zero-fallback-and-density) | `5d9ce6e32b06` | 2026-08-29 | Não ancestral de main — avaliar diff |
| [`fix/cards-operational-truth`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/cards-operational-truth) | `5156a027ea4e` | 2026-09-19 | Não ancestral de main — avaliar diff |
| [`fix/cards-vertical-grid-consistency`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/cards-vertical-grid-consistency) | `ff10a3a92efd` | 2026-08-29 | Não ancestral de main — avaliar diff |
| [`fix/ci-source-security-gates-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/ci-source-security-gates-20261011) | `bfa9b88eb944` | — | SHA não validado no clone da VM |
| [`fix/comandos-homologados-reconexao`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/comandos-homologados-reconexao) | `6b6c8e7013e2` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/comap-mains-bus-topology`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/comap-mains-bus-topology) | `a9c5a646e440` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/command-api-confirmation-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/command-api-confirmation-20261011) | `a16ce1b5b8f5` | — | SHA não validado no clone da VM |
| [`fix/compact-kw-tapered-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/compact-kw-tapered-pointer-20261001) | `4db305ef62c1` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/compact-old-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/compact-old-pointer-20261001) | `96fa4f5753e8` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/compact-pointer-match-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/compact-pointer-match-20261001) | `228a3966372b` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/compact-pointer-visible-20261001b`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/compact-pointer-visible-20261001b) | `fc85be820da1` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/control-row-two-lines`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/control-row-two-lines) | `7859cf5237fa` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/controller-packs-audit`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/controller-packs-audit) | `76ca7f2766d9` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/deploy-backup-retention-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/deploy-backup-retention-20261002) | `6630b984b0ca` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/detail-kw-gauge-fallback-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/detail-kw-gauge-fallback-20261001) | `5c74b3246038` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/detail-old-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/detail-old-pointer-20261001) | `8648ff07ba0a` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/detail-tapered-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/detail-tapered-pointer-20261001) | `f76479baddfe` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse4520-gencomm-readonly`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse4520-gencomm-readonly) | `c8c4a8bdad8a` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/dse6120-mkii-model-alias-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse6120-mkii-model-alias-20261002) | `344fda890a6e` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`fix/dse-gcb-controller-pack-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-gcb-controller-pack-20261001) | `aecbce8818d2` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse-gcb-feedback-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-gcb-feedback-20261001) | `9bdc7e2d3f58` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse-gcb-rapid-template-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-gcb-rapid-template-20261001) | `2d401a1cd4ab` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse-gcb-truth-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-gcb-truth-20261002) | `44c0037df4a5` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse-remove-generic-led-feedback-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-remove-generic-led-feedback-20261001) | `4878a8def489` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/dse-remove-rapid-led-feedback-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/dse-remove-rapid-led-feedback-20261001) | `b60b2b7d5b33` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/frontend-command-timeout-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/frontend-command-timeout-20261011) | `0729c3d52062` | — | SHA não validado no clone da VM |
| [`fix/frontend-proxy-cache-poison-20260930`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/frontend-proxy-cache-poison-20260930) | `6fd54fd54c1c` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/gauge-needle-unified-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/gauge-needle-unified-20261002) | `f1dd75d16c38` | 2026-10-02 | Não ancestral de main — avaliar diff |
| [`fix/generator-card-needles-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-card-needles-20261001) | `e4326cff0c7b` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/generator-compact-kw-needle-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-compact-kw-needle-20261001) | `4753b2f57b21` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/generator-detail-layout-gauges-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-detail-layout-gauges-20261001) | `94a960cda0ed` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/generator-detail-visible-pass-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-detail-visible-pass-20261001) | `6b957456e274` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/generator-overview-cards`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-overview-cards) | `93b83c9aabf0` | 2026-08-29 | Não ancestral de main — avaliar diff |
| [`fix/generator-rpm-needle-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-rpm-needle-20261001) | `802dde55a44b` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/generator-vertical-kw-needle-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/generator-vertical-kw-needle-20261001) | `41a08173d526` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/hide-mains-history-genset-only`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/hide-mains-history-genset-only) | `8768037ec3b9` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/hide-mains-history-genset-only-v2`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/hide-mains-history-genset-only-v2) | `709c1e1e109a` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/ig4-fuel-capacity-truth`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/ig4-fuel-capacity-truth) | `f311ad9d2191` | 2026-09-19 | Não ancestral de main — avaliar diff |
| [`fix/ig4-stop-operational-breaker-states`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/ig4-stop-operational-breaker-states) | `22eaa69410a2` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/ig200-physical-feedback-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/ig200-physical-feedback-20261011) | `c1e94a1eca5f` | — | SHA não validado no clone da VM |
| [`fix/lab-controller-onboarding`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/lab-controller-onboarding) | `be3427e075a7` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/login-opens-generators`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/login-opens-generators) | `649b59d66154` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/modem-first-direct-vpn-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/modem-first-direct-vpn-20261002) | `c7e12dedb5a3` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/modem-first-frontend-api-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/modem-first-frontend-api-20261002) | `f60592d4d218` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/modem-first-frontend-ui-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/modem-first-frontend-ui-20261002) | `085e352e51d7` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/ops-bootstrap-rbac-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/ops-bootstrap-rbac-20261011) | `5f10e3d07394` | — | SHA não validado no clone da VM |
| [`fix/preserve-runtime-sockets`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/preserve-runtime-sockets) | `970ca956ff03` | 2026-09-01 | Não ancestral de main — avaliar diff |
| [`fix/rapid-pack-binding-release-gate-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/rapid-pack-binding-release-gate-20261002) | `35fcab5d2f27` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/rapid-unavailable-freshness-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/rapid-unavailable-freshness-20261011) | `1d310c581f5a` | — | SHA não validado no clone da VM |
| [`fix/refine-card-controls-spacing`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/refine-card-controls-spacing) | `8bd2344d075a` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/remove-card-summary-metrics`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/remove-card-summary-metrics) | `3a5c39296299` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/remove-dead-dse-fc16-runtime-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/remove-dead-dse-fc16-runtime-20261002) | `b48bcc7b4aa8` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/remove-power-gauge-source-label`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/remove-power-gauge-source-label) | `e072376eba7f` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/remover-inventario-controladoras`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/remover-inventario-controladoras) | `481207455ecd` | 2026-09-02 | Não ancestral de main — avaliar diff |
| [`fix/restore-zip-ui`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/restore-zip-ui) | `b9604c358a8a` | 2026-08-28 | Não ancestral de main — avaliar diff |
| [`fix/shared-rpm-old-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/shared-rpm-old-pointer-20261001) | `9dcd0a9dec66` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/shared-rpm-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/shared-rpm-pointer-20261001) | `dbe7e1e3e4b2` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/shared-rpm-tapered-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/shared-rpm-tapered-pointer-20261001) | `5b264ad2cd5f` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/six-vertical-cards-header-logo`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/six-vertical-cards-header-logo) | `4c74510f1294` | 2026-08-29 | Não ancestral de main — avaliar diff |
| [`fix/start-stop-below-mode-buttons`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/start-stop-below-mode-buttons) | `4d4960e4f547` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`fix/vertical-dse-flow-gcb-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-dse-flow-gcb-20261001) | `17d5d6370786` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/vertical-dse-pointer-gcb-20261001b`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-dse-pointer-gcb-20261001b) | `70e0d24ad0d9` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/vertical-gauge-color-flow-speed-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-gauge-color-flow-speed-20261001) | `0a9c6b1fcfcf` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/vertical-kw-size-old-pointer-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-kw-size-old-pointer-20261001) | `3df391484a71` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/vertical-kw-tapered-pointer-flow-20261001`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-kw-tapered-pointer-flow-20261001) | `6fc5143930ee` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`fix/vertical-reference-fit`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-reference-fit) | `f93cba616730` | 2026-09-18 | Não ancestral de main — avaliar diff |
| [`fix/vertical-truth-feedback-20261011`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vertical-truth-feedback-20261011) | `a0f77d046d36` | — | SHA não validado no clone da VM |
| [`fix/vm-frontend-build-deps`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vm-frontend-build-deps) | `98bf876ac8c5` | 2026-08-28 | Não ancestral de main — avaliar diff |
| [`fix/vm-production-readiness`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/fix/vm-production-readiness) | `3fcc48dbd832` | 2026-08-28 | Não ancestral de main — avaliar diff |
| [`hotfix/api-polling-stability`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/hotfix/api-polling-stability) | `5c05ff061806` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`hotfix/tv-4k-modem-stability`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/hotfix/tv-4k-modem-stability) | `28f2b688777d` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`hotfix/tv-4k-modem-stability-v2`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/hotfix/tv-4k-modem-stability-v2) | `c75afdad5422` | 2026-09-29 | Não ancestral de main — avaliar diff |
| [`__ignore__`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/__ignore__) | `ffe894779666` | 2026-09-03 | Não ancestral de main — avaliar diff |
| [`lab/ig4-command-homologation`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/lab/ig4-command-homologation) | `13efb5cd17a3` | 2026-09-01 | Não ancestral de main — avaliar diff |
| [`main`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/main) | `ab39aba32da7` | 2026-10-29 | Oficial — preservar |
| [`noop-temp`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/noop-temp) | `ffe894779666` | 2026-09-03 | Não ancestral de main — avaliar diff |
| [`ops/empty-fleet-baseline-2026-09-30`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/ops/empty-fleet-baseline-2026-09-30) | `7eb3091aea06` | 2026-09-30 | Não ancestral de main — avaliar diff |
| [`prod-hardening-v4`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/prod-hardening-v4) | `cec3133b303b` | 2026-09-19 | Release/backup — retenção explícita |
| [`production/observed-2026-09-29`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/production/observed-2026-09-29) | `20a68c2d0e14` | 2026-09-29 | Release/backup — retenção explícita |
| [`refactor/frontend-architecture-10-10`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/frontend-architecture-10-10) | `232e87154279` | 2026-08-30 | Não ancestral de main — avaliar diff |
| [`refactor/gauge-compact-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/gauge-compact-20261002) | `c0180d2f5814` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`refactor/gauge-detail-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/gauge-detail-20261002) | `c23315702223` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`refactor/gauge-shared-core-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/gauge-shared-core-20261002) | `d83109582014` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`refactor/gauge-vertical-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/gauge-vertical-20261002) | `231c0f285833` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`refactor/shared-gauge-needle-cleanup-20261002`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/refactor/shared-gauge-needle-cleanup-20261002) | `3f4e00113e57` | 2026-10-01 | Não ancestral de main — avaliar diff |
| [`release/ig4-200-readonly-20260901`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/ig4-200-readonly-20260901) | `753f249454ec` | 2026-09-01 | Release/backup — retenção explícita |
| [`release/modem-first-production-2026-09-30`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/modem-first-production-2026-09-30) | `20a68c2d0e14` | 2026-09-29 | Release/backup — retenção explícita |
| [`release/production-2026-09-02-card-layout`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/production-2026-09-02-card-layout) | `025cabae7a5c` | 2026-09-02 | Release/backup — retenção explícita |
| [`release/production-2026-09-02-card-ui`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/production-2026-09-02-card-ui) | `7b7ed84e4fbf` | 2026-09-02 | Release/backup — retenção explícita |
| [`release/production-2026-09-02-control`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/production-2026-09-02-control) | `4ea1209d7ad3` | 2026-09-02 | Release/backup — retenção explícita |
| [`release/production-2026-09-02`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/production-2026-09-02) | `7ccd961db485` | 2026-09-01 | Release/backup — retenção explícita |
| [`release/stabilizacao-scada-20260901`](https://github.com/paulohspdev-cmyk/ProjetoGerador/tree/release/stabilizacao-scada-20260901) | `9881e88d669e` | 2026-09-02 | Release/backup — retenção explícita |

## Regra obrigatória antes de qualquer limpeza
1. Correlacionar branch, commit, PR, issue e finalidade.
2. Conferir patches únicos, inclusive casos squash/cherry-pick; ancestry sozinha não comprova que todo código está na `main`.
3. Identificar release, backup ou instalação que depende daquela referência.
4. Registrar proposta de remoção com SHA completo, prova e possibilidade de recuperação.
5. Só excluir após revisão e aprovação explícita do proprietário. **Nenhuma branch foi excluída.**

Plano e acompanhamento: [Organização do repositório](REPOSITORY_ORGANIZATION_2026-11-12.md) e [issue #238](https://github.com/paulohspdev-cmyk/ProjetoGerador/issues/238).
