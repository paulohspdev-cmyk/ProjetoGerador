# Produção segura — RC Geradores v4

Esta revisão separa infraestrutura de produção, experimentos LAB e dados que dependem de confirmação de campo.

## Regras obrigatórias

- `RC_ENVIRONMENT=production`.
- `RC_ENABLE_DSE_LAB_CONTROL=0` e `RC_ENABLE_IG4_LAB_CONTROL=0`.
- `RC_API_DOCS=0`.
- `RC_WEB_TLS_MODE=external_proxy` quando HTTPS for terminado no Nginx Proxy Manager.
- Administradores e operadores devem habilitar TOTP/2FA antes de executar ações privilegiadas.
- Portas reverse TCP devem usar allowlist de origem antes de exposição definitiva.
- Backup off-site só é considerado pronto quando há destino e chave reais fora da VM.
- Potência nominal, cliente, unidade/site e firmware devem ser cadastrados com dados reais. O sistema não cria valores fictícios para satisfazer o checklist.

## Comandos industriais

A interface reconhece as ações:

`start`, `stop`, `auto`, `manual`, `test`, `mcb_open`, `mcb_close`, `gcb_open`, `gcb_close`, `paralleling`.

Uma ação só aparece como executável quando todos os requisitos são verdadeiros:

1. o usuário possui permissão `operate`;
2. em produção, a conta privilegiada tem 2FA;
3. a controladora está habilitada e alcançável;
4. o Controller Pack é de produção e `field_validated`;
5. `capabilities.<ação>` é `true`;
6. existe um contrato `commands.<ação>` no Controller Pack v4;
7. transporte, binding, Modbus Unit, porta e Rapid Device conferem;
8. a confirmação explícita da ação foi enviada;
9. o executor de produção daquela controladora está implementado.

Hoje o InteliGen 200 possui contratos de produção para START e STOP. Demais ações permanecem fail-closed até homologação física do mapa e do retorno do controlador.

## API externa

Tokens de leitura podem usar `ops.read`.

Permissões industriais são separadas por ação: `generator.start`, `generator.stop`, `generator.mode`, `breaker.control` e `paralleling.control`.

Qualquer token com permissão industrial exige allowlist de geradores e CIDRs/IPs de origem. O token não substitui a capability do Controller Pack.

## Checklist da tela Sistema / Saúde

O backend publica `productionReadiness` com bloqueios e avisos. Estado online de geradores/controladoras não é requisito quando o equipamento está propositalmente desligado.

Bloqueios incluem ambiente incorreto, LAB ativo, reverse TCP exposto sem allowlist, backup off-site obrigatório não configurado, 2FA ausente em conta privilegiada, Controller Pack/binding inválido, potência nominal ausente e firmware não cadastrado.

Avisos incluem unidade/site, cliente, canal de notificação e cadastros de teste.

## HTTPS

Com `RC_WEB_TLS_MODE=external_proxy`, deploy, preflight e smoke não criam, substituem, validam ou renovam certificados TLS locais e não executam o script `configure_https.sh`. O Nginx Proxy Manager fica responsável por certificado, redirect HTTP→HTTPS e política do proxy. A aplicação continua validando API e frontend diretamente nos upstreams locais.
