#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
DROPIN_NAME="50-rc-geradores-network.conf"
SERVICES=(scadaserver6 scadaagent6 scadaweb6)
MODE="${1:---check}"

fail() { echo "ERRO: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

case "${MODE}" in
  --check|--apply) ;;
  -h|--help)
    cat <<'EOF'
Uso: sudo bash ops/configure_rapid_network.sh [--check|--apply]

Protege as portas nativas do Rapid SCADA usando IPAddressAllow/IPAddressDeny
do systemd. Loopback é sempre permitido. RC_RAPID_ADMIN_ALLOWED_CIDRS é
opcional: vazio significa somente loopback; redes administrativas adicionais
podem ser informadas separadas por vírgula.

--check  valida apenas a configuração.
--apply  grava drop-ins, reinicia somente serviços que já estavam ativos e
         restaura a configuração anterior automaticamente em caso de falha.
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

RAW_CIDRS="${RC_RAPID_ADMIN_ALLOWED_CIDRS:-}"

CIDR_OUTPUT="$(
  python3 - "${RAW_CIDRS}" <<'PY'
import ipaddress
import sys

raw = sys.argv[1]
seen = set()
for token in raw.split(","):
    token = token.strip()
    if not token:
        continue
    try:
        network = ipaddress.ip_network(token, strict=False)
    except ValueError as exc:
        raise SystemExit(f"CIDR administrativo inválido: {token}: {exc}")
    if network.prefixlen == 0:
        raise SystemExit(f"CIDR administrativo amplo demais: {network}")
    text = str(network)
    if text not in seen:
        seen.add(text)
        print(text)
PY
)" || fail "RC_RAPID_ADMIN_ALLOWED_CIDRS inválido"

ADMIN_CIDRS=()
if [[ -n "${CIDR_OUTPUT}" ]]; then
  mapfile -t ADMIN_CIDRS <<<"${CIDR_OUTPUT}"
fi

for cidr in "${ADMIN_CIDRS[@]}"; do
  case "${cidr}" in
    0.0.0.0/0|::/0) fail "CIDR administrativo amplo demais: ${cidr}" ;;
  esac
done

if ((${#ADMIN_CIDRS[@]} > 0)); then
  ok "CIDRs administrativos adicionais: ${ADMIN_CIDRS[*]}"
else
  ok "CIDRs administrativos adicionais: nenhum (Rapid nativo somente em loopback)"
fi
[[ "${MODE}" == "--check" ]] && exit 0
[[ ${EUID} -eq 0 ]] || fail "--apply exige root"

TMP="$(mktemp -d /tmp/rc-rapid-network-XXXXXX)"
cleanup() { rm -rf "${TMP}"; }
trap cleanup EXIT

declare -A ACTIVE_BEFORE
declare -A HAD_DROPIN
for svc in "${SERVICES[@]}"; do
  ACTIVE_BEFORE["${svc}"]=0
  systemctl is-active --quiet "${svc}.service" && ACTIVE_BEFORE["${svc}"]=1 || true
  dir="/etc/systemd/system/${svc}.service.d"
  target="${dir}/${DROPIN_NAME}"
  HAD_DROPIN["${svc}"]=0
  if [[ -f "${target}" ]]; then
    HAD_DROPIN["${svc}"]=1
    cp -a "${target}" "${TMP}/${svc}.conf"
  fi
done

rollback() {
  echo "RESTAURANDO política Rapid anterior..." >&2
  for svc in "${SERVICES[@]}"; do
    dir="/etc/systemd/system/${svc}.service.d"
    target="${dir}/${DROPIN_NAME}"
    if [[ "${HAD_DROPIN[$svc]}" == "1" ]]; then
      install -d -m 0755 "${dir}"
      install -m 0644 "${TMP}/${svc}.conf" "${target}"
    else
      rm -f "${target}"
    fi
  done
  systemctl daemon-reload
  for svc in "${SERVICES[@]}"; do
    if [[ "${ACTIVE_BEFORE[$svc]}" == "1" ]]; then
      systemctl restart "${svc}.service" >/dev/null 2>&1 || true
    fi
  done
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback; fi; cleanup; exit $rc' EXIT

for svc in "${SERVICES[@]}"; do
  dir="/etc/systemd/system/${svc}.service.d"
  target="${dir}/${DROPIN_NAME}"
  staged="${TMP}/${svc}.new"
  {
    echo "[Service]"
    echo "IPAddressDeny=any"
    echo "IPAddressAllow=127.0.0.0/8"
    echo "IPAddressAllow=::1/128"
    for cidr in "${ADMIN_CIDRS[@]}"; do
      echo "IPAddressAllow=${cidr}"
    done
  } >"${staged}"
  install -d -m 0755 "${dir}"
  install -m 0644 "${staged}" "${target}"
done

systemctl daemon-reload

for svc in "${SERVICES[@]}"; do
  if [[ "${ACTIVE_BEFORE[$svc]}" == "1" ]]; then
    systemctl restart "${svc}.service"
    systemctl is-active --quiet "${svc}.service" || fail "${svc} não voltou ativo"
  fi
done

for svc in "${SERVICES[@]}"; do
  props="$(systemctl show "${svc}.service" -p IPAddressAllow -p IPAddressDeny)"
  grep -q 'IPAddressDeny=.*0.0.0.0/0' <<<"${props}" || fail "${svc} sem deny IPv4"
  grep -q 'IPAddressDeny=.*::/0' <<<"${props}" || fail "${svc} sem deny IPv6"
  grep -q 'IPAddressAllow=.*127.0.0.0/8' <<<"${props}" || fail "${svc} sem allow loopback IPv4"
  for cidr in "${ADMIN_CIDRS[@]}"; do
    grep -Fq "${cidr}" <<<"${props}" || fail "${svc} não aplicou ${cidr}"
  done
done

python3 - <<'PY'
import socket
import subprocess

ports = {
    "scadaserver6.service": 10000,
    "scadaagent6.service": 10002,
    "scadaweb6.service": 10008,
}
for service, port in ports.items():
    active = subprocess.run(
        ["systemctl", "is-active", "--quiet", service],
        check=False,
    ).returncode == 0
    if not active:
        continue
    with socket.create_connection(("127.0.0.1", port), timeout=3):
        pass
    print(f"OK: {service} loopback:{port}")
PY

trap - EXIT
cleanup
echo "Rapid SCADA network policy: OK"
