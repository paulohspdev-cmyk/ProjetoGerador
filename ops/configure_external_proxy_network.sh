#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
MODE="${1:---check}"
TABLE_FAMILY="inet"
TABLE_NAME="rc_geradores_web"
API_SERVICE="rc-geradores-api"
FRONTEND_SERVICE="rc-geradores-frontend"
FIREWALL_SERVICE="rc-geradores-web-firewall"
API_DROPIN="/etc/systemd/system/${API_SERVICE}.service.d/60-external-proxy-network.conf"
FRONTEND_DROPIN="/etc/systemd/system/${FRONTEND_SERVICE}.service.d/60-external-proxy-network.conf"
FIREWALL_UNIT="/etc/systemd/system/${FIREWALL_SERVICE}.service"
NFT_PERSIST="/etc/rc-geradores-web.nft"
PROJECT_ROOT_DEFAULT="/opt/rc-geradores"

fail() { echo "ERRO: $*" >&2; return 1; }
ok() { echo "OK: $*"; }

case "${MODE}" in
  --check|--check-runtime|--apply|--remove) ;;
  -h|--help)
    cat <<'EOF'
Uso: sudo bash ops/configure_external_proxy_network.sh [--check|--check-runtime|--apply|--remove]

Prepara API e frontend para receber HTTP diretamente do Nginx Proxy Manager
sem expor 3000/8090 para a rede inteira.

--check          valida somente a configuração declarada.
--check-runtime  exige firewall persistente, drop-ins systemd e listeners ativos.
--apply          aplica firewall persistente, drop-ins e reinicia API/frontend.
--remove         remove a política externa e volta API/frontend ao loopback.

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
  [[ "${WEB_TLS_MODE}" == "external_proxy" ]]     || fail "este helper só é válido com RC_WEB_TLS_MODE=external_proxy"
  [[ -n "${ALLOWED_RAW//[[:space:],]/}" ]]     || fail "RC_EXTERNAL_PROXY_ALLOWED_CIDRS não configurado"
  [[ -n "${TRUSTED_RAW//[[:space:],]/}" ]]     || fail "RC_TRUSTED_PROXY_CIDRS não configurado"

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

render_firewall_unit() {
  local file="$1" nft_bin="$2"
  cat >"${file}" <<EOF
[Unit]
Description=RC Geradores External Proxy Firewall
Conflicts=nftables.service
Before=${API_SERVICE}.service ${FRONTEND_SERVICE}.service

[Service]
Type=oneshot
ExecStartPre=-${nft_bin} delete table ${TABLE_FAMILY} ${TABLE_NAME}
ExecStart=${nft_bin} -f ${NFT_PERSIST}
ExecStop=-${nft_bin} delete table ${TABLE_FAMILY} ${TABLE_NAME}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
}

render_api_dropin() {
  local file="$1"
  cat >"${file}" <<EOF
[Unit]
BindsTo=${FIREWALL_SERVICE}.service
PartOf=${FIREWALL_SERVICE}.service
After=${FIREWALL_SERVICE}.service

[Service]
ExecStart=
ExecStart=${PROJECT_ROOT}/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8090
EOF
}

render_frontend_dropin() {
  local file="$1"
  cat >"${file}" <<EOF
[Unit]
BindsTo=${FIREWALL_SERVICE}.service
PartOf=${FIREWALL_SERVICE}.service
After=${FIREWALL_SERVICE}.service

[Service]
Environment=NITRO_HOST=0.0.0.0
Environment=NITRO_PORT=3000
EOF
}

nft_peer_present() {
  local cidr="$1" file="$2" needle="${cidr}"
  [[ "${needle}" == */32 ]] && needle="${needle%/32}"
  [[ "${needle}" == */128 ]] && needle="${needle%/128}"
  grep -Fq "${needle}" "${file}"
}

runtime_check() {
  [[ ${EUID} -eq 0 ]] || fail "--check-runtime exige root"
  command -v nft >/dev/null 2>&1 || fail "nft não instalado"
  [[ -f "${API_DROPIN}" ]] || fail "drop-in da API não aplicado: ${API_DROPIN}"
  [[ -f "${FRONTEND_DROPIN}" ]] || fail "drop-in do frontend não aplicado: ${FRONTEND_DROPIN}"
  [[ -f "${FIREWALL_UNIT}" ]] || fail "unit persistente do firewall não aplicada"
  [[ -f "${NFT_PERSIST}" ]] || fail "configuração nft persistente não aplicada"

  grep -q "BindsTo=${FIREWALL_SERVICE}.service" "${API_DROPIN}" \
    || fail "API não está vinculada ao firewall external_proxy"
  grep -q "BindsTo=${FIREWALL_SERVICE}.service" "${FRONTEND_DROPIN}" \
    || fail "frontend não está vinculado ao firewall external_proxy"
  grep -q "PartOf=${FIREWALL_SERVICE}.service" "${API_DROPIN}" \
    || fail "API não acompanha restart do firewall external_proxy"
  grep -q "PartOf=${FIREWALL_SERVICE}.service" "${FRONTEND_DROPIN}" \
    || fail "frontend não acompanha restart do firewall external_proxy"
  systemctl show "${API_SERVICE}.service" -p BindsTo --value | grep -Fq "${FIREWALL_SERVICE}.service" \
    || fail "systemd ainda não carregou BindsTo do firewall na API"
  systemctl show "${FRONTEND_SERVICE}.service" -p BindsTo --value | grep -Fq "${FIREWALL_SERVICE}.service" \
    || fail "systemd ainda não carregou BindsTo do firewall no frontend"
  systemctl show "${API_SERVICE}.service" -p PartOf --value | grep -Fq "${FIREWALL_SERVICE}.service" \
    || fail "systemd ainda não carregou PartOf do firewall na API"
  systemctl show "${FRONTEND_SERVICE}.service" -p PartOf --value | grep -Fq "${FIREWALL_SERVICE}.service" \
    || fail "systemd ainda não carregou PartOf do firewall no frontend"
  grep -q -- '--host 0.0.0.0 --port 8090' "${API_DROPIN}" \
    || fail "drop-in da API não expõe o upstream externo"
  grep -q '^Environment=NITRO_HOST=0.0.0.0$' "${FRONTEND_DROPIN}" \
    || fail "drop-in do frontend não expõe o upstream externo"
  grep -q '^Environment=NITRO_PORT=3000$' "${FRONTEND_DROPIN}" \
    || fail "drop-in do frontend não fixa a porta Nitro esperada"

  command -v nft >/dev/null 2>&1 || fail "nft não instalado"
  grep -Fq "ExecStart=$(command -v nft) -f ${NFT_PERSIST}" "${FIREWALL_UNIT}" \
    || fail "unit persistente do firewall aponta para configuração inesperada"
  grep -q '^Conflicts=nftables.service$' "${FIREWALL_UNIT}" \
    || fail "firewall RC não bloqueia coexistência com nftables.service"
  if systemctl is-active --quiet nftables.service || systemctl is-enabled --quiet nftables.service; then
    fail "nftables.service global não pode coexistir com o firewall dedicado do RC Geradores"
  fi
  systemctl is-enabled --quiet "${FIREWALL_SERVICE}.service" \
    || fail "serviço persistente do firewall não está habilitado"
  systemctl is-active --quiet "${FIREWALL_SERVICE}.service" \
    || fail "serviço persistente do firewall não está ativo"

  local runtime_nft="/tmp/rc-external-proxy-nft-$$.txt"
  nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >"${runtime_nft}" 2>/dev/null \
    || fail "tabela nftables ${TABLE_FAMILY} ${TABLE_NAME} não aplicada"
  grep -q '3000' "${runtime_nft}" || fail "firewall runtime sem porta frontend"
  grep -q '8090' "${runtime_nft}" || fail "firewall runtime sem porta API"
  grep -q 'drop' "${runtime_nft}" || fail "firewall runtime sem regra de bloqueio"
  grep -q '3000' "${NFT_PERSIST}" || fail "firewall persistente sem porta frontend"
  grep -q '8090' "${NFT_PERSIST}" || fail "firewall persistente sem porta API"
  grep -q 'drop' "${NFT_PERSIST}" || fail "firewall persistente sem regra de bloqueio"
  for cidr in "${ALLOWED_CIDRS[@]}"; do
    nft_peer_present "${cidr}" "${runtime_nft}" \
      || fail "firewall runtime não contém peer do NPM: ${cidr}"
    nft_peer_present "${cidr}" "${NFT_PERSIST}" \
      || fail "firewall persistente não contém peer do NPM: ${cidr}"
  done
  rm -f "${runtime_nft}"

  ss -lntH | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\*):3000$' \
    || fail "frontend não está exposto pelo drop-in em 0.0.0.0:3000"
  ss -lntH | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\*):8090$' \
    || fail "API não está exposta pelo drop-in em 0.0.0.0:8090"
}

if [[ "${MODE}" == "--check" ]]; then
  ok "CIDRs do NPM: ${ALLOWED_CIDRS[*]}"
  ok "configuração external_proxy válida"
  exit 0
fi

if [[ "${MODE}" == "--check-runtime" ]]; then
  runtime_check
  ok "bind externo e firewall persistente do NPM estão aplicados"
  exit 0
fi

[[ ${EUID} -eq 0 ]] || fail "${MODE} exige root"
command -v systemctl >/dev/null 2>&1 || fail "systemctl ausente"
command -v nft >/dev/null 2>&1 || fail "nft ausente"

if [[ "${MODE}" == "--apply" ]] && {
  systemctl is-active --quiet nftables.service || systemctl is-enabled --quiet nftables.service;
}; then
  fail "nftables.service global está ativo/habilitado; recuse o cutover até reconciliar a política de firewall existente"
fi

if [[ "${MODE}" == "--remove" ]]; then
  systemctl stop "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service" >/dev/null 2>&1 || true
  rm -f "${API_DROPIN}" "${FRONTEND_DROPIN}"
  systemctl disable --now "${FIREWALL_SERVICE}.service" >/dev/null 2>&1 || true
  rm -f "${FIREWALL_UNIT}" "${NFT_PERSIST}"
  if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
    nft delete table "${TABLE_FAMILY}" "${TABLE_NAME}" || true
  fi
  systemctl daemon-reload
  systemctl start "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service"
  ok "política external_proxy removida; API/frontend voltaram ao bind loopback padrão"
  exit 0
fi

NFT_BIN="$(command -v nft)"
TMP="$(mktemp -d /tmp/rc-external-proxy-network-XXXXXX)"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

API_BACKUP="${TMP}/api-dropin.before"
FRONTEND_BACKUP="${TMP}/frontend-dropin.before"
UNIT_BACKUP="${TMP}/firewall-unit.before"
PERSIST_BACKUP="${TMP}/firewall-nft.before"
NFT_RUNTIME_BACKUP="${TMP}/nft-runtime.before"
API_EXISTED=0
FRONTEND_EXISTED=0
UNIT_EXISTED=0
PERSIST_EXISTED=0
NFT_EXISTED=0
FW_ENABLED=0
FW_ACTIVE=0

[[ -f "${API_DROPIN}" ]] && { cp -a "${API_DROPIN}" "${API_BACKUP}"; API_EXISTED=1; }
[[ -f "${FRONTEND_DROPIN}" ]] && { cp -a "${FRONTEND_DROPIN}" "${FRONTEND_BACKUP}"; FRONTEND_EXISTED=1; }
[[ -f "${FIREWALL_UNIT}" ]] && { cp -a "${FIREWALL_UNIT}" "${UNIT_BACKUP}"; UNIT_EXISTED=1; }
[[ -f "${NFT_PERSIST}" ]] && { cp -a "${NFT_PERSIST}" "${PERSIST_BACKUP}"; PERSIST_EXISTED=1; }
nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >"${NFT_RUNTIME_BACKUP}" 2>/dev/null && NFT_EXISTED=1 || true
systemctl is-enabled --quiet "${FIREWALL_SERVICE}.service" 2>/dev/null && FW_ENABLED=1 || true
systemctl is-active --quiet "${FIREWALL_SERVICE}.service" 2>/dev/null && FW_ACTIVE=1 || true

restore_file() {
  local existed="$1" backup="$2" target="$3"
  if (( existed == 1 )); then
    install -d -m 0755 "$(dirname "${target}")"
    cp -a "${backup}" "${target}"
  else
    rm -f "${target}"
  fi
}

rollback() {
  trap - ERR
  set +e
  systemctl stop "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service" >/dev/null 2>&1 || true
  systemctl disable --now "${FIREWALL_SERVICE}.service" >/dev/null 2>&1 || true

  restore_file "${API_EXISTED}" "${API_BACKUP}" "${API_DROPIN}"
  restore_file "${FRONTEND_EXISTED}" "${FRONTEND_BACKUP}" "${FRONTEND_DROPIN}"
  restore_file "${UNIT_EXISTED}" "${UNIT_BACKUP}" "${FIREWALL_UNIT}"
  restore_file "${PERSIST_EXISTED}" "${PERSIST_BACKUP}" "${NFT_PERSIST}"

  if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
    nft delete table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1 || true
  fi
  if (( NFT_EXISTED == 1 )); then
    nft -f "${NFT_RUNTIME_BACKUP}" >/dev/null 2>&1 || true
  fi

  systemctl daemon-reload >/dev/null 2>&1 || true
  if (( FW_ENABLED == 1 )); then
    systemctl enable "${FIREWALL_SERVICE}.service" >/dev/null 2>&1 || true
  fi
  if (( FW_ACTIVE == 1 )); then
    systemctl start "${FIREWALL_SERVICE}.service" >/dev/null 2>&1 || true
  fi
  systemctl start "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service" >/dev/null 2>&1 || true
}
trap 'rc=$?; rollback; exit "$rc"' ERR

NFT_NEW="${TMP}/nft.new"
UNIT_NEW="${TMP}/firewall.service"
API_NEW="${TMP}/api.conf"
FRONTEND_NEW="${TMP}/frontend.conf"
render_nft "${NFT_NEW}"
render_firewall_unit "${UNIT_NEW}" "${NFT_BIN}"
render_api_dropin "${API_NEW}"
render_frontend_dropin "${FRONTEND_NEW}"

NFT_CHECK="${TMP}/nft.check"
: >"${NFT_CHECK}"
if nft list table "${TABLE_FAMILY}" "${TABLE_NAME}" >/dev/null 2>&1; then
  echo "delete table ${TABLE_FAMILY} ${TABLE_NAME}" >>"${NFT_CHECK}"
fi
cat "${NFT_NEW}" >>"${NFT_CHECK}"
nft -c -f "${NFT_CHECK}"

systemctl stop "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service"
install -m 0644 "${NFT_NEW}" "${NFT_PERSIST}"
install -m 0644 "${UNIT_NEW}" "${FIREWALL_UNIT}"
install -d -m 0755 "$(dirname "${API_DROPIN}")" "$(dirname "${FRONTEND_DROPIN}")"
install -m 0644 "${API_NEW}" "${API_DROPIN}"
install -m 0644 "${FRONTEND_NEW}" "${FRONTEND_DROPIN}"
systemctl daemon-reload

# O serviço persistente é ativado antes dos upstreams. BindsTo garante que uma
# falha/remoção futura do firewall derrube API/frontend em vez de deixá-los abertos.
systemctl enable --now "${FIREWALL_SERVICE}.service"
systemctl start "${API_SERVICE}.service" "${FRONTEND_SERVICE}.service"

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8090/api/health >/dev/null 2>&1     && curl -fsS --max-time 2 http://127.0.0.1:3000/login >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -fsS --max-time 3 http://127.0.0.1:8090/api/health >/dev/null   || fail "API não respondeu após aplicar bind externo"
curl -fsS --max-time 3 http://127.0.0.1:3000/login >/dev/null   || fail "frontend não respondeu após aplicar bind externo"

runtime_check

trap - ERR
ok "upstreams externos ativos, persistentes e protegidos para: ${ALLOWED_CIDRS[*]}"
