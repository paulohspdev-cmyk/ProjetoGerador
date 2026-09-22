#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
MODE="${1:---check}"
TABLE_FAMILY="inet"
TABLE_NAME="rc_geradores_web"
API_SERVICE="rc-geradores-api"
FRONTEND_SERVICE="rc-geradores-frontend"
API_DROPIN="/etc/systemd/system/${API_SERVICE}.service.d/60-external-proxy-network.conf"
FRONTEND_DROPIN="/etc/systemd/system/${FRONTEND_SERVICE}.service.d/60-external-proxy-network.conf"
PROJECT_ROOT_DEFAULT="/opt/rc-geradores"

fail() { echo "ERRO: $*" >&2; return 1; }
ok() { echo "OK: $*"; }

case "${MODE}" in
  --check|--apply|--remove) ;;
  -h|--help)
    cat <<'EOF'
Uso: sudo bash ops/configure_external_proxy_network.sh [--check|--apply|--remove]

Prepara API e frontend para receber HTTP diretamente do Nginx Proxy Manager sem
expor 3000/8090 para a rede inteira.

--check   valida configuração e, quando já aplicado, a política de runtime.
--apply   cria drop-ins systemd, aplica firewall nftables e reinicia API/frontend.
--remove  remove a política externa, volta API/frontend ao bind loopback padrão.

Variáveis obrigatórias em external_proxy:
  RC_EXTERNAL_PROXY_ALLOWED_CIDRS=IP/CIDR do NPM
  RC_TRUSTED_PROXY_CIDRS=deve incluir os mesmos peers do NPM

Nunca use 0.0.0.0/0 ou ::/0.
EOF
    exit 0
    ;;
  *) fail "modo inválido: ${MODE}" ;;
esac

[[ -f "${ENV_FILE}" ]] || fail "arquivo de ambiente não encontrado: ${ENV_FILE}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

PROJECT_ROOT="${RC_PROJECT_ROOT:-${PROJECT_ROOT_DEFAULT}}"
WEB_TLS_MODE="${RC_WEB_TLS_MODE:-managed}"
ALLOWED_RAW="${RC_EXTERNAL_PROXY_ALLOWED_CIDRS:-}"
TRUSTED_RAW="${RC_TRUSTED_PROXY_CIDRS:-}"

if [[ "${MODE}" != "--remove" ]]; then
  [[ "${WEB_TLS_MODE}" == "external_proxy" ]] || fail "este helper só é válido com RC_WEB_TLS_MODE=external_proxy"
  [[ -n "${ALLOWED_RAW//[[:space:],]/}" ]] || fail "RC_EXTERNAL_PROXY_ALLOWED_CIDRS não configurado"
  [[ -n "${TRUSTED_RAW//[[:space:],]/}" ]] || fail "RC_TRUSTED_PROXY_CIDRS não configurado"
fi

parse_networks() {
  python3 - "$1" "$2" <<'PY'
import ipaddress
import sys

raw, setting = sys.argv[1:3]
seen = set()
for token in raw.split(","):
    token = token.strip()
    if not token:
        continue
    try:
        network = ipaddress.ip_network(token, strict=False)
    except ValueError as exc:
        raise SystemExit(f"{setting}: CIDR inválido {token}: {exc}")
    if network.prefixlen == 0:
        raise SystemExit(f"{setting}: CIDR amplo demais {network}")
    text = str(network)
    if text not in seen:
        seen.add(text)
        print(text)
PY
}

if [[ "${MODE}" != "--remove" ]]; then
  ALLOWED_OUTPUT="$(parse_networks "${ALLOWED_RAW}" "RC_EXTERNAL_PROXY_ALLOWED_CIDRS")"     || fail "RC_EXTERNAL_PROXY_ALLOWED_CIDRS inválido"
  TRUSTED_OUTPUT="$(parse_networks "${TRUSTED_RAW}" "RC_TRUSTED_PROXY_CIDRS")"     || fail "RC_TRUSTED_PROXY_CIDRS inválido"

  mapfile -t ALLOWED_CIDRS <<<"${ALLOWED_OUTPUT}"
  mapfile -t TRUSTED_CIDRS <<<"${TRUSTED_OUTPUT}"
  (("${#ALLOWED_CIDRS[@]}" > 0)) || fail "nenhum CIDR do NPM válido"
  (("${#TRUSTED_CIDRS[@]}" > 0)) || fail "nenhum proxy confiável válido"

  python3 - "${ALLOWED_OUTPUT}" "${TRUSTED_OUTPUT}" <<'PY'
import ipaddress
import sys

allowed = [ipaddress.ip_network(x) for x in sys.argv[1].splitlines() if x.strip()]
trusted = [ipaddress.ip_network(x) for x in sys.argv[2].splitlines() if x.strip()]
missing = []
for src in allowed:
    if not any(src.subnet_of(dst) for dst in trusted if src.version == dst.version):
        missing.append(str(src))
if missing:
    raise SystemExit(
        "RC_TRUSTED_PROXY_CIDRS não cobre peer(s) autorizados do NPM: "
        + ", ".join(missing)
    )
PY

  IPV4=()
  IPV6=()
  for cidr in "${ALLOWED_CIDRS[@]}"; do
    if [[ "${cidr}" == *:* ]]; then IPV6+=("${cidr}"); else IPV4+=("${cidr}"); fi
  done
fi

render_nft() {
  local file="$1"
  {
    echo "table inet ${TABLE_NAME} {"
    echo "  chain input {"
    echo "    type filter hook input priority -10; policy accept;"
    echo '    iifname "lo" tcp dport { 3000, 8090 } accept'
    if (("${#IPV4[@]}" > 0)); then
      printf '    ip saddr { '
      local first=1 cidr
      for cidr in "${IPV4[@]}"; do
        (( first == 1 )) || printf ', '
        printf '%s' "${cidr}"
        first=0
      done
      echo ' } tcp dport { 3000, 8090 } accept'
    fi
    if (("${#IPV6[@]}" > 0)); then
      printf '    ip6 saddr { '
      local first6=1 cidr6
      for cidr6 in "${IPV6[@]}"; do
        (( first6 == 1 )) || printf ', '
        printf '%s' "${cidr6}"
        first6=0
      done
      echo ' } tcp dport { 3000, 8090 } accept'
    fi
    echo '    tcp dport { 3000, 8090 } drop'
    echo "  }"
    echo "}"
  } >"${file}"
}

runtime_check() {
  command -v nft >/dev/null 2>&1 || fail "nft não instalado"
  [[ -f "${API_DROPIN}" ]] || fail "drop-in da API não aplicado: ${API_DROPIN}"
  [[ -f "${FRONTEND_DROPIN}" ]] || fail "drop-in do frontend não aplicado: ${FRONTEND_DROPIN}"
  grep -q -- '--host 0.0.0.0 --port 8090' "${API_DROPIN}" || fail "drop-in da API não expõe o upstream externo"
  grep -q '^Environment=HOST=0.0.0.0$' "${FRONTEND_DROPIN}" || fail "drop-in do frontend não expõe o upstream externo"
  nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/tmp/rc-external-proxy-nft.txt 2>/dev/null     || fail "tabela nftables ${TABLE_FAMILY} ${TABLE_NAME} não aplicada"
  grep -q '3000' /tmp/rc-external-proxy-nft.txt || fail "firewall sem porta frontend"
  grep -q '8090' /tmp/rc-external-proxy-nft.txt || fail "firewall sem porta API"
  grep -q 'drop' /tmp/rc-external-proxy-nft.txt || fail "firewall sem regra de bloqueio"
  for cidr in "${ALLOWED_CIDRS[@]}"; do
    grep -Fq "${cidr}" /tmp/rc-external-proxy-nft.txt       || fail "firewall não contém peer do NPM: ${cidr}"
  done
  rm -f /tmp/rc-external-proxy-nft.txt
}

if [[ "${MODE}" == "--check" ]]; then
  ok "CIDRs do NPM: ${ALLOWED_CIDRS[*]}"
  if [[ -f "${API_DROPIN}" || -f "${FRONTEND_DROPIN}" ]] || nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
    runtime_check
    ok "bind externo e firewall do NPM estão aplicados"
  else
    ok "configuração válida; política externa ainda não aplicada"
  fi
  exit 0
fi

[[ ${EUID} -eq 0 ]] || fail "${MODE} exige root"
command -v systemctl >/dev/null 2>&1 || fail "systemctl ausente"
command -v nft >/dev/null 2>&1 || fail "nft ausente"

if [[ "${MODE}" == "--remove" ]]; then
  rm -f "${API_DROPIN}" "${FRONTEND_DROPIN}"
  if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
    nft delete table "${TABLE_FAMILY}" "${TABLE_NAME}"
  fi
  systemctl daemon-reload
  systemctl restart "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service"
  ok "política external_proxy removida; units voltaram ao bind padrão"
  exit 0
fi

TMP="$(mktemp -d /tmp/rc-external-proxy-network-XXXXXX)"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

API_BACKUP="${TMP}/api-dropin.before"
FRONTEND_BACKUP="${TMP}/frontend-dropin.before"
NFT_BACKUP="${TMP}/nft.before"
API_EXISTED=0
FRONTEND_EXISTED=0
NFT_EXISTED=0

if [[ -f "${API_DROPIN}" ]]; then cp -a "${API_DROPIN}" "${API_BACKUP}"; API_EXISTED=1; fi
if [[ -f "${FRONTEND_DROPIN}" ]]; then cp -a "${FRONTEND_DROPIN}" "${FRONTEND_BACKUP}"; FRONTEND_EXISTED=1; fi
if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >"${NFT_BACKUP}" 2>/dev/null; then NFT_EXISTED=1; fi

rollback() {
  trap - ERR
  set +e
  if (( API_EXISTED == 1 )); then
    install -d -m 0755 "$(dirname "${API_DROPIN}")"
    cp -a "${API_BACKUP}" "${API_DROPIN}"
  else
    rm -f "${API_DROPIN}"
  fi
  if (( FRONTEND_EXISTED == 1 )); then
    install -d -m 0755 "$(dirname "${FRONTEND_DROPIN}")"
    cp -a "${FRONTEND_BACKUP}" "${FRONTEND_DROPIN}"
  else
    rm -f "${FRONTEND_DROPIN}"
  fi
  if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
    nft delete table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1 || true
  fi
  if (( NFT_EXISTED == 1 )); then nft -f "${NFT_BACKUP}" >/dev/null 2>&1 || true; fi
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl restart "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service" >/dev/null 2>&1 || true
}
trap 'rc=$?; rollback; exit "$rc"' ERR

install -d -m 0755 "$(dirname "${API_DROPIN}")" "$(dirname "${FRONTEND_DROPIN}")"
cat >"${API_DROPIN}" <<EOF
[Service]
ExecStart=
ExecStart=${PROJECT_ROOT}/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090
EOF
cat >"${FRONTEND_DROPIN}" <<'EOF'
[Service]
Environment=HOST=0.0.0.0
Environment=PORT=3000
EOF

NFT_NEW="${TMP}/nft.new"
NFT_BATCH="${TMP}/nft.batch"
render_nft "${NFT_NEW}"
: >"${NFT_BATCH}"
if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
  echo "delete table ${TABLE_FAMILY} ${TABLE_NAME}" >>"${NFT_BATCH}"
fi
cat "${NFT_NEW}" >>"${NFT_BATCH}"
nft -c -f "${NFT_BATCH}"
nft -f "${NFT_BATCH}"

systemctl daemon-reload
systemctl restart "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service"

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8090/api/health >/dev/null 2>&1     && curl -fsS --max-time 2 http://127.0.0.1:3000/login >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -fsS --max-time 3 http://127.0.0.1:8090/api/health >/dev/null   || fail "API não respondeu após aplicar bind externo"
curl -fsS --max-time 3 http://127.0.0.1:3000/login >/dev/null   || fail "frontend não respondeu após aplicar bind externo"

runtime_check
ss -lntH | awk '{print $4}' | grep -Eq '(^|:)3000$' || fail "frontend não está escutando em 3000"
ss -lntH | awk '{print $4}' | grep -Eq '(^|:)8090$' || fail "API não está escutando em 8090"

trap - ERR
ok "upstreams externos ativos e protegidos por nftables para: ${ALLOWED_CIDRS[*]}"
