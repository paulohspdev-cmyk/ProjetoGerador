#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
NPM_ADDRESS=""
CAPTURE_SECONDS="${RC_NPM_ROUTE_CAPTURE_SECONDS:-8}"

usage() {
  cat <<'EOF'
Uso: sudo bash ops/verify_npm_route.sh [--npm-address IP]

Valida, sem interromper serviços, se o Nginx Proxy Manager encaminha:
  /login      -> frontend direto na porta 3000
  /api/health -> API direta na porta 8090

A verificação captura apenas metadados TCP entre o NPM e esta VM durante
requisições controladas pelo hostname público. Nenhum payload é registrado.

Requer:
  RC_WEB_TLS_MODE=external_proxy
  RC_PUBLIC_BASE_URL=https://HOSTNAME
  RC_EXTERNAL_PROXY_ALLOWED_CIDRS contendo o IP /32 (ou /128) do NPM,
  ou --npm-address IP.
EOF
}

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --npm-address)
      [[ $# -ge 2 ]] || fail "--npm-address exige um IP"
      NPM_ADDRESS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "argumento desconhecido: $1"
      ;;
  esac
done

[[ ${EUID} -eq 0 ]] || fail "execute como root"
[[ -f "${ENV_FILE}" ]] || fail "arquivo de ambiente não encontrado: ${ENV_FILE}"
command -v curl >/dev/null 2>&1 || fail "curl não encontrado"
command -v tcpdump >/dev/null 2>&1 || fail "tcpdump não encontrado"
command -v python3 >/dev/null 2>&1 || fail "python3 não encontrado"
command -v ip >/dev/null 2>&1 || fail "iproute2 não encontrado"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

[[ "${RC_WEB_TLS_MODE:-}" == "external_proxy" ]] || fail "RC_WEB_TLS_MODE precisa ser external_proxy"
PUBLIC_BASE="${RC_PUBLIC_BASE_URL:-}"
[[ -n "${PUBLIC_BASE}" ]] || fail "RC_PUBLIC_BASE_URL não configurado"

read -r PUBLIC_SCHEME PUBLIC_HOST <<EOF
$(python3 - "${PUBLIC_BASE}" <<'PY'
import sys
from urllib.parse import urlsplit

raw = sys.argv[1].strip()
url = urlsplit(raw)
if url.scheme != "https" or not url.hostname:
    raise SystemExit("RC_PUBLIC_BASE_URL deve ser https://HOSTNAME")
print(url.scheme, url.hostname)
PY
)
EOF

[[ "${PUBLIC_SCHEME}" == "https" && -n "${PUBLIC_HOST}" ]] || fail "RC_PUBLIC_BASE_URL inválido"

if [[ -z "${NPM_ADDRESS}" ]]; then
  NPM_ADDRESS="$(
    python3 - "${RC_EXTERNAL_PROXY_ALLOWED_CIDRS:-}" <<'PY'
import ipaddress
import sys

raw = sys.argv[1]
hosts = []
for token in raw.split(","):
    token = token.strip()
    if not token:
        continue
    network = ipaddress.ip_network(token, strict=False)
    if network.prefixlen == network.max_prefixlen:
        hosts.append(str(network.network_address))
hosts = list(dict.fromkeys(hosts))
if len(hosts) != 1:
    raise SystemExit(
        "não foi possível inferir um único IP do NPM; use --npm-address IP"
    )
print(hosts[0])
PY
  )" || fail "não foi possível inferir o endereço do NPM"
fi

python3 - "${NPM_ADDRESS}" <<'PY'
import ipaddress
import sys
ipaddress.ip_address(sys.argv[1])
PY

LOCAL_ADDRESS="$(
  ip route get "${NPM_ADDRESS}" 2>/dev/null |
    awk '{
      for (i = 1; i <= NF; i++) {
        if ($i == "src" && (i + 1) <= NF) {
          print $(i + 1)
          exit
        }
      }
    }'
)"
[[ -n "${LOCAL_ADDRESS}" ]] || fail "não foi possível descobrir o IP local usado até o NPM"

if [[ -x "/opt/rc-geradores/ops/configure_external_proxy_network.sh" ]]; then
  bash /opt/rc-geradores/ops/configure_external_proxy_network.sh --check-runtime >/dev/null     || fail "política external_proxy da VM não está íntegra"
fi

WORKDIR="$(mktemp -d /tmp/rc-npm-route.XXXXXX)"
CAPTURE="${WORKDIR}/tcpdump.log"
LOGIN_BODY="${WORKDIR}/login.body"
HEALTH_BODY="${WORKDIR}/health.body"

cleanup() {
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

echo "Verificando rota NPM ${NPM_ADDRESS} -> VM ${LOCAL_ADDRESS} para ${PUBLIC_HOST}"

timeout "${CAPTURE_SECONDS}" tcpdump -i any -nn -l   "host ${NPM_ADDRESS} and host ${LOCAL_ADDRESS} and tcp"   >"${CAPTURE}" 2>/dev/null &
TCPDUMP_PID=$!

sleep 0.5

LOGIN_STATUS="$(
  curl -sS --max-time 6     --resolve "${PUBLIC_HOST}:443:${NPM_ADDRESS}"     -o "${LOGIN_BODY}" -w '%{http_code}'     "https://${PUBLIC_HOST}/login" || true
)"
HEALTH_STATUS="$(
  curl -sS --max-time 6     --resolve "${PUBLIC_HOST}:443:${NPM_ADDRESS}"     -o "${HEALTH_BODY}" -w '%{http_code}'     "https://${PUBLIC_HOST}/api/health" || true
)"

sleep 1
kill "${TCPDUMP_PID}" 2>/dev/null || true
wait "${TCPDUMP_PID}" 2>/dev/null || true

[[ "${LOGIN_STATUS}" == "200" ]] || fail "/login via NPM retornou HTTP ${LOGIN_STATUS:-sem resposta}"
[[ "${HEALTH_STATUS}" == "200" ]] || fail "/api/health via NPM retornou HTTP ${HEALTH_STATUS:-sem resposta}"

FRONTEND_DIRECT=0
API_DIRECT=0
LEGACY_TLS=0

grep -qE "IP ${NPM_ADDRESS//./\\.}\.[0-9]+ > ${LOCAL_ADDRESS//./\\.}\.3000:" "${CAPTURE}"   && FRONTEND_DIRECT=1 || true
grep -qE "IP ${NPM_ADDRESS//./\\.}\.[0-9]+ > ${LOCAL_ADDRESS//./\\.}\.8090:" "${CAPTURE}"   && API_DIRECT=1 || true
grep -qE "IP ${NPM_ADDRESS//./\\.}\.[0-9]+ > ${LOCAL_ADDRESS//./\\.}\.443:" "${CAPTURE}"   && LEGACY_TLS=1 || true

if (( LEGACY_TLS == 1 )); then
  echo "ERRO: NPM ainda encaminha tráfego para o TLS local na porta 443" >&2
fi
if (( FRONTEND_DIRECT == 0 )); then
  echo "ERRO: não foi observado encaminhamento direto do NPM para frontend:3000" >&2
fi
if (( API_DIRECT == 0 )); then
  echo "ERRO: não foi observado encaminhamento direto do NPM para API:8090" >&2
fi

if (( LEGACY_TLS == 1 || FRONTEND_DIRECT == 0 || API_DIRECT == 0 )); then
  echo
  echo "Rota observada não está pronta para remover o Nginx local."
  exit 1
fi

ok "/login responde pelo NPM e alcança frontend:3000 diretamente"
ok "/api/health responde pelo NPM e alcança API:8090 diretamente"
ok "nenhum salto NPM -> TLS local:443 foi observado"
echo "APROVADO: rota external_proxy pronta para retirada do Nginx TLS local."
