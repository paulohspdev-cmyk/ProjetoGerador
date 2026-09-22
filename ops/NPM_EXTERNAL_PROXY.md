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
Proxy Host do NPM. Por padrão API e frontend continuam em loopback. O helper
`configure_external_proxy_network.sh` cria drop-ins systemd para disponibilizar
3000/8090 à rede e, na mesma operação, instala uma política nftables que aceita
nessas portas somente loopback e os CIDRs explicitamente autorizados do NPM.

## Variáveis obrigatórias

Depois de conhecer o hostname real publicado no NPM:

```dotenv
RC_WEB_TLS_MODE=external_proxy
RC_AUTH_COOKIE_SECURE=1
RC_EXTERNAL_PROXY_ALLOWED_CIDRS=10.10.10.131/32
RC_TRUSTED_PROXY_CIDRS=10.10.10.131/32
RC_PUBLIC_BASE_URL=https://HOSTNAME_REAL
RC_CORS_ORIGINS=https://HOSTNAME_REAL
```

Nunca use `0.0.0.0/0` ou `::/0` em `RC_EXTERNAL_PROXY_ALLOWED_CIDRS`
ou `RC_TRUSTED_PROXY_CIDRS`. A lista confiável da API deve cobrir todos os
peers autorizados pelo firewall.

## Cutover sem interrupção

1. Não altere o checkout de produção nem execute deploy.
2. Confirme o IP real do NPM e o hostname HTTPS publicado.
3. Atualize apenas as variáveis de borda em `/etc/rc-geradores.env`:
   ```dotenv
   RC_WEB_TLS_MODE=external_proxy
   RC_EXTERNAL_PROXY_ALLOWED_CIDRS=10.10.10.131/32
   RC_TRUSTED_PROXY_CIDRS=10.10.10.131/32
   RC_PUBLIC_BASE_URL=https://HOSTNAME_REAL
   RC_CORS_ORIGINS=https://HOSTNAME_REAL
   ```
4. A partir de um checkout da release candidata, valide e prepare os upstreams:
   ```bash
   sudo RC_ENV_FILE=/etc/rc-geradores.env \
     bash ops/configure_external_proxy_network.sh --check

   sudo RC_ENV_FILE=/etc/rc-geradores.env \
     bash ops/configure_external_proxy_network.sh --apply
   ```
   Esse passo reinicia somente API/frontend. O firewall nftables é aplicado
   antes da exposição e permite 3000/8090 apenas para loopback e para o NPM.
   O caminho HTTPS local antigo continua disponível durante esta preparação.
5. Confirme localmente:
   ```bash
   curl -fsS http://127.0.0.1:8090/api/health
   curl -fsS http://127.0.0.1:3000/login >/dev/null
   sudo bash ops/configure_external_proxy_network.sh --check-runtime
   ```
6. Só agora altere o Proxy Host no NPM:
   - localização padrão `/` -> `http://10.10.10.130:3000`;
   - Custom Location `/api/` -> `http://10.10.10.130:8090`;
   - mantenha WebSocket Support habilitado.
7. Verifique a rota real sem interromper serviços:
   ```bash
   sudo bash ops/verify_npm_route.sh
   ```
   O helper faz requisições controladas a `/login` e `/api/health` pelo
   próprio NPM e observa apenas metadados TCP. Ele só aprova quando vê
   `NPM -> VM:3000` para o frontend, `NPM -> VM:8090` para a API e nenhum
   salto `NPM -> VM:443`. Assim, responder HTTP 200 não basta para declarar
   o corte concluído se o tráfego ainda estiver passando pelo Nginx TLS local.
8. Teste pelo hostname HTTPS real:
   - `GET /login` deve responder 200;
   - `GET /api/health` deve responder 200;
   - login/logout devem funcionar;
   - downloads e rotas administrativas devem permanecer no mesmo host.
9. Se o NPM direto falhar, reverta o Proxy Host ao upstream anterior. A política
   nftables pode permanecer aplicada; para voltar totalmente a loopback use:
   ```bash
   sudo bash ops/configure_external_proxy_network.sh --remove
   ```
10. Somente depois de `verify_npm_route.sh` aprovar o caminho direto,
    desabilite a terminação TLS local do RC Geradores. Se o Nginx local não
    servir outro sistema, pare e desabilite o serviço; não é necessário apagar
    certificados durante o cutover.
11. Execute o preflight da release validada:
    ```bash
    sudo bash /opt/rc-geradores/ops/preflight_vm.sh \
      factory/auditoria-producao SHA_VALIDADO
    ```
12. O preflight só aprova quando:
    - a política nftables externa está aplicada;
    - os drop-ins de API/frontend estão carregados;
    - o peer do NPM está configurado e confiável;
    - não existe terminação TLS local legada.

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
- Não abrir 3000/8090 sem a política nftables gerenciada pelo helper.
- Não remover o caminho TLS local antes de validar o encaminhamento direto do NPM.
- Não fazer merge/deploy apenas porque o Proxy Host respondeu; os gates CI,
  Quality/Security, E2E e o preflight da VM continuam obrigatórios.
