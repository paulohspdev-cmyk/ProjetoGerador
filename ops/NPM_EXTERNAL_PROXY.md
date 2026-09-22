# Nginx Proxy Manager — external_proxy

Este projeto usa o Nginx Proxy Manager (NPM) como único terminador HTTPS quando
`RC_WEB_TLS_MODE=external_proxy`. Nesse modo, o RC Geradores não deve manter
uma segunda terminação TLS local em `/etc/nginx/sites-enabled/rc-geradores`.

## Topologia suportada

```text
cliente HTTPS
    |
    v
Nginx Proxy Manager
    |-- /api/  -> http://10.10.10.130:8090
    `-- /      -> http://10.10.10.130:3000
```

Na topologia de fábrica validada durante a auditoria, o NPM está em
`10.10.10.131` e a VM RC Geradores em `10.10.10.130`. Confirme esses
endereços antes de qualquer mudança.

O certificado, redirect HTTP->HTTPS, HSTS e demais opções TLS pertencem ao
Proxy Host do NPM. API e frontend continuam escutando apenas em loopback na VM
quando executados diretamente; o acesso externo deve ser definido de forma
controlada conforme a rede da instalação.

## Variáveis obrigatórias

Depois de conhecer o hostname real publicado no NPM:

```dotenv
RC_WEB_TLS_MODE=external_proxy
RC_AUTH_COOKIE_SECURE=1
RC_TRUSTED_PROXY_CIDRS=10.10.10.131/32
RC_PUBLIC_BASE_URL=https://HOSTNAME_REAL
RC_CORS_ORIGINS=https://HOSTNAME_REAL
```

Nunca use `0.0.0.0/0` ou `::/0` em `RC_TRUSTED_PROXY_CIDRS`.

## Cutover sem interrupção

1. Não altere o checkout de produção nem execute deploy.
2. No NPM, altere o Proxy Host para encaminhar a localização padrão `/` por
   HTTP para `10.10.10.130:3000`.
3. No mesmo Proxy Host, crie uma Custom Location `/api/` por HTTP para
   `10.10.10.130:8090`.
4. Mantenha WebSocket Support habilitado para o Proxy Host.
5. Teste pelo hostname real do NPM:
   - `GET /login` deve responder 200;
   - `GET /api/health` deve responder 200;
   - login/logout devem funcionar;
   - downloads e rotas administrativas devem continuar no mesmo host HTTPS.
6. Se qualquer teste falhar, reverta o Proxy Host do NPM. Não mexa no Nginx
   local nesse caso.
7. Somente depois do NPM direto estar validado, atualize
   `/etc/rc-geradores.env` com o hostname e o CIDR confiável.
8. Desabilite o site TLS local do RC Geradores. Se o Nginx local não servir
   nenhum outro sistema, ele pode permanecer parado/desabilitado.
9. Execute:
   ```bash
   sudo bash /opt/rc-geradores/ops/preflight_vm.sh factory/auditoria-producao SHA_VALIDADO
   ```
10. O preflight só deve aprovar quando não existir terminação TLS local legada
    e `RC_TRUSTED_PROXY_CIDRS` estiver configurado.

## Validação pós-deploy

O deploy transacional valida o frontend em runtime, exige HTML com
`Cache-Control: no-store` e faz GET de todos os assets JS/CSS hashados
referenciados. Qualquer asset ausente reprova a release e aciona rollback.

Depois de um deploy candidato, confirme também:

```bash
curl -fsSI https://HOSTNAME_REAL/login
curl -fsS https://HOSTNAME_REAL/api/health
```

Um HTTP 500 da API candidata inclui `X-Request-ID`; use essa referência para
correlacionar a resposta com o journal da API.

## O que não fazer

- Não apontar o NPM para o HTTPS local da VM.
- Não manter NPM -> Nginx TLS local -> frontend/API como arquitetura final.
- Não confiar na Internet inteira em `RC_TRUSTED_PROXY_CIDRS`.
- Não remover o proxy local antes de validar o encaminhamento direto do NPM.
- Não fazer merge/deploy apenas porque o Proxy Host respondeu; os gates CI,
  Quality/Security, E2E e o preflight da VM continuam obrigatórios.
