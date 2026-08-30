#!/usr/bin/env bash
set -Eeuo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
TLS_DIR="/etc/ssl/rc-geradores"
TLS_CERT="$TLS_DIR/fullchain.pem"
TLS_KEY="$TLS_DIR/privkey.pem"
NGINX_SITE="/etc/nginx/sites-available/rc-geradores"
STAMP="$(date +%Y%m%d-%H%M%S)"
ROLLBACK_DIR="/var/lib/rc-geradores/backups/web-hardening-${STAMP}"
SELF_SIGNED=0

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || fail "execute como root"
[[ -f "$BASE/ops/nginx/rc-geradores.conf" ]] || fail "configuração Nginx não encontrada no release"
[[ -f "$ENV_FILE" ]] || fail "arquivo de ambiente não encontrado: $ENV_FILE"

for cmd in nginx openssl curl sed cp install hostname; do
  command -v "$cmd" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: $cmd"
done

mkdir -p "$ROLLBACK_DIR"
cp -a "$ENV_FILE" "$ROLLBACK_DIR/rc-geradores.env.before"
[[ -f "$NGINX_SITE" ]] && cp -a "$NGINX_SITE" "$ROLLBACK_DIR/nginx-site.before" || true

rollback_web() {
  cp -a "$ROLLBACK_DIR/rc-geradores.env.before" "$ENV_FILE" 2>/dev/null || true
  if [[ -f "$ROLLBACK_DIR/nginx-site.before" ]]; then
    cp -a "$ROLLBACK_DIR/nginx-site.before" "$NGINX_SITE" 2>/dev/null || true
  fi
  nginx -t >/dev/null 2>&1 && systemctl restart nginx >/dev/null 2>&1 || true
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback_web; fi' EXIT

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
BASE="${RC_PROJECT_ROOT:-$BASE}"
VM_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

set_env RC_AUTH_COOKIE_SECURE 1
CURRENT_PUBLIC="${RC_PUBLIC_BASE_URL:-}"
if [[ "$CURRENT_PUBLIC" == http://* ]]; then
  set_env RC_PUBLIC_BASE_URL "https://${CURRENT_PUBLIC#http://}"
elif [[ -z "$CURRENT_PUBLIC" && -n "$VM_IP" ]]; then
  set_env RC_PUBLIC_BASE_URL "https://${VM_IP}"
fi

CURRENT_CORS="${RC_CORS_ORIGINS:-}"
if [[ -n "$CURRENT_CORS" ]]; then
  set_env RC_CORS_ORIGINS "${CURRENT_CORS//http:\/\//https:\/\/}"
elif [[ -n "$VM_IP" ]]; then
  set_env RC_CORS_ORIGINS "https://localhost,https://127.0.0.1,https://${VM_IP}"
fi
chmod 0640 "$ENV_FILE"
chown root:rcgeradores "$ENV_FILE"

install -d -m 0755 -o root -g root "$TLS_DIR"

if [[ -n "${RC_TLS_CERT_FILE:-}" || -n "${RC_TLS_KEY_FILE:-}" ]]; then
  [[ -n "${RC_TLS_CERT_FILE:-}" && -n "${RC_TLS_KEY_FILE:-}" ]] || fail "RC_TLS_CERT_FILE e RC_TLS_KEY_FILE devem ser configurados juntos"
  [[ -f "$RC_TLS_CERT_FILE" && -f "$RC_TLS_KEY_FILE" ]] || fail "certificado/chave TLS configurados não existem"
  CERT_SRC="$(readlink -f "$RC_TLS_CERT_FILE")"
  KEY_SRC="$(readlink -f "$RC_TLS_KEY_FILE")"
  if [[ "$CERT_SRC" != "$(readlink -f "$TLS_CERT" 2>/dev/null || echo "$TLS_CERT")" ]]; then
    install -m 0644 -o root -g root "$RC_TLS_CERT_FILE" "$TLS_CERT"
  fi
  if [[ "$KEY_SRC" != "$(readlink -f "$TLS_KEY" 2>/dev/null || echo "$TLS_KEY")" ]]; then
    install -m 0600 -o root -g root "$RC_TLS_KEY_FILE" "$TLS_KEY"
  fi
elif [[ ! -s "$TLS_CERT" || ! -s "$TLS_KEY" ]]; then
  SELF_SIGNED=1
  TLS_NAME="${VM_IP:-rc-geradores.local}"
  if [[ "$TLS_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    TLS_SAN="IP:${TLS_NAME},DNS:rc-geradores.local"
  else
    TLS_SAN="DNS:${TLS_NAME},DNS:rc-geradores.local"
  fi
  openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 825 \
    -keyout "$TLS_KEY" -out "$TLS_CERT" \
    -subj "/CN=${TLS_NAME}" -addext "subjectAltName=${TLS_SAN}" >/dev/null 2>&1
  chmod 0600 "$TLS_KEY"
  chmod 0644 "$TLS_CERT"
fi

openssl x509 -in "$TLS_CERT" -noout -checkend 86400 >/dev/null || fail "certificado TLS inválido ou expira em menos de 24h"
openssl pkey -in "$TLS_KEY" -noout -check >/dev/null || fail "chave TLS inválida"

cp "$BASE/ops/nginx/rc-geradores.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/rc-geradores
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/rc-scada
nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx

for _ in $(seq 1 20); do
  if curl -kfsS --max-time 5 https://127.0.0.1/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -kfsS --max-time 8 https://127.0.0.1/api/health >/dev/null || fail "proxy HTTPS não respondeu"
curl -sSI --max-time 8 http://127.0.0.1/api/health | grep -qi '^Location: https://' || fail "HTTP não está redirecionando para HTTPS"

trap - EXIT
echo "HTTPS configurado com sucesso. Backup anterior: $ROLLBACK_DIR"
if (( SELF_SIGNED == 1 )); then
  echo "ATENÇÃO: certificado autoassinado em uso; instale certificado confiável antes de exposição pública."
fi
