# ComAp documentation audit — 2026-09-28

Auditoria de cobertura de controladoras ComAp no RC Geradores.

## Fontes oficiais prioritárias

- Catálogo geral: https://www.comap-control.com/products/controllers/
- Single gen-set / InteliLite: https://www.comap-control.com/products/controllers/single-gen-set-controllers/
- Paralleling gen-set: https://www.comap-control.com/products/controllers/paralleling-gen-set-controllers/
- Switchgear / mains / ATS: https://www.comap-control.com/products/switchgear-control-and-protections/
- Engine controllers: https://www.comap-control.com/products/controllers/engine-controllers/
- Microgrid controllers: https://www.comap-control.com/products/controllers/microgrid-controllers/
- BESS controllers: https://www.comap-control.com/products/controllers/bess-controllers/

## Regra de suporte

A matriz `controllers/catalog/COMAP_COVERAGE_MATRIX.json` classifica cada item ComAp em:

- `production_field_validated`: existe Controller Pack field-validated para o modelo/alias.
- `production_read_only`: existe pack documental de produção estritamente read-only.
- `registration_only`: modelo reconhecido, mas sem pack exato/mapeamento autoritativo suficiente para provisionamento automático.
- `classified_non_genset`: mains, ATS, BESS, engine, gateway, light-tower, microgrid ou outra função fora do pack convencional de gerador.

## Packs atualmente field-validated

### InteliGen 200

`controllers/production/comap/inteligen-200` usa export InteliConfig retido e validação de campo. START/STOP existem no pack, mas firmware de escrita continua sujeito aos gates de homologação.

### InteliGen4 200

`controllers/production/comap/ig4-200` mantém mapa exportado e field validation. O pack permanece sem comandos habilitados.

### IG-NT / InteliGen NT GC

`controllers/production/comap/ig-nt` foi validado em campo por FC03 com identidade ASCII `IGS-NT`. O alias oficial `InteliGen NT GC` é aceito; InteliGen NTC e BaseBox não herdam esse mapa sem evidência própria.

## Linhas oficiais auditadas

### InteliGen

O portfólio oficial atual/legacy inclui InteliGen 1000, InteliGen 1000 SC, InteliGen 500 G2, InteliGen4 200, InteliGen NT GC, InteliGen NTC GC, InteliGen NT BaseBox e InteliGen NTC BaseBox. A ComAp identifica InteliGen 500 G2 como sucessor de InteliGen 500, NT GC e NTC GC; isso não implica compatibilidade automática de mapa.

### InteliSys

InteliSys 2000, InteliSys NTC BaseBox e InteliSys Gas estão no portfólio/documentação oficial; InteliSys CU e InteliSys NT BaseBox permanecem catalogados como gerações anteriores.

### InteliLite / InteliNano

Auditados InteliLite 4 AMF 8/9/20/25, InteliLite 4 MRS 16, IL-NT AMF 8/9/20/25, IL-NT MRS 10/11/15/16/19, gerações InteliLite AMF/MRS anteriores e InteliNano AMF 5 / NT Plus / NT MRS 3.

A ComAp publica o `IL-NT IA-NT IC-NT Communication Guide` em páginas de vários IL-NT e InteliCompact. O guia comprova capacidade/protocolo da família, mas não autoriza copiar um mapa de uma variante para outra sem identificação do export.

### InteliCompact

InteliCompact NT MINT e SPtM permanecem `registration_only`. A página oficial do SPtM oferece o Communication Guide e Reference Guide, porém o pack LAB atual ainda não contém um mapa exato retido.

### InteliMains / ATS

InteliMains 1010/1010 SC/510/210 G2/210 e gerações NT/GSC/BaseBox são classificadas como mains, não como genset. InteliATS2 50/70 e InteliATS NT permanecem ATS.

### Marine / engine / microgrid / BESS

InteliGen 1000 Marine é genset marine; InteliMains 1010 Marine é breaker/mains marine. InteliDrive 700 Marine, DCU, IPC, Lite, FLX, WP e variantes são engine controllers. InteliNeo 6000/5500 e InteliGen 500 Microgrid/InteliSys Hybrid ficam em microgrid; InteliNeo 530 BESS em BESS.

## Regra de promoção

Documentação oficial de produto, comunicação remota ou Modbus comprova existência da capacidade; não comprova que qualquer mapa de registradores de outra geração seja compatível.

Para promover um novo pack ComAp para produção read-only é necessário pelo menos um destes caminhos:

1. export Modbus/InteliConfig identificado inequivocamente para o modelo e preservado com SHA-256; ou
2. tabela oficial de objetos/registradores específica da geração/modelo; ou
3. validação de campo read-only com identidade do controlador e conjunto mínimo de registradores.

Comandos industriais exigem ainda modelo, firmware, contrato de escrita, permissivos, binding e evidência física específica.
