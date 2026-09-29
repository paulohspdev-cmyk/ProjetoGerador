# DSE documentation audit — 2026-09-28

Primeira rodada de expansão oficial DSE para o RC Geradores.

## Fontes prioritárias

Foram priorizadas páginas e downloads da própria Deep Sea Electronics. O portal oficial associa o documento **Gencomm Control Keys (056-051)** a várias famílias 4xxx, 6xxx, 7xxx, 8xxx e produtos de sincronismo/ATS.

## Resultado operacional

- O pack `dse-gencomm-v1` permanece o pack compartilhado de **telemetria read-only** para os modelos cuja compatibilidade está registrada no manifest e em `MODEL_EVIDENCE.md`.
- Modelos de função diferente não são forçados para o mesmo mapa.
- Novos modelos atuais foram adicionados ao catálogo para seleção e auditoria sem inventar suporte.
- Escrita continua fail-closed.

## Modelos adicionados ao catálogo nesta rodada

- DSE7450 — gerador DC/Hybrid; GenComm oficial, mapa específico pendente.
- DSE8710 — sincronismo/load sharing rear-mounted; GenComm oficial, pack/model map específico pendente.
- DSE8760 — ATS/mains rear-mounted; separar de geradores.
- DSE8860 — ATS/mains graphical; separar de geradores.
- DSE8661 — ATS/mains two-part; separar de geradores.
- DSE335 MKII — ATS; separar de geradores.

## Próximos packs DSE

1. `dse8710-gencomm-v1` — rear-mounted synchronising/load share.
2. família mains/ATS para DSE8660/DSE8661/DSE8760/DSE8860.
3. pack bus-tie DSE8680.
4. pack DC/Hybrid DSE7450.
5. revisão legacy 53xx/55xx/75xx a partir de protocolo oficial específico.

Cada novo pack deve manter mapa, unidades, sentinelas, transporte, lifecycle e evidência próprios. O executor GenComm só deve ser reutilizado quando o contrato for realmente compatível.

## Regra para comandos

Documentação oficial de control keys é evidência de que a função existe no protocolo; não é autorização automática para escrever em qualquer unidade instalada. A promoção de START/STOP/AUTO/MAN/TEST/transferência exige modelo, firmware, função disponível, permissivos e ensaio físico controlado.

## Segunda rodada — legacy e 52xx

A varredura oficial também encontrou DSE402, DSE4110, DSE550, DSE6010/DSE6020, DSE6110/DSE6120, DSE6110/DSE6120 MKII, DSE7110/DSE7120 e variantes marine DSE5310M/DSE5510M. Esses produtos entram no catálogo como inventory-only quando a documentação pública não comprova o mapa GenComm necessário para provisionamento.

O DSE5220 é a exceção desta rodada: o protocolo GenComm v1.29 usado pelo pack legacy cita explicitamente DSE5210 e DSE5220. Por isso o `dse5210-gencomm-v1` passa a reconhecer DSE5220 como alias e continua estritamente read-only.
