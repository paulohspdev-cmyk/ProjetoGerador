#!/usr/bin/env bash
set -Eeuo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
REF="${1:-origin/main}"
EXPECTED_SHA="${2:-${RC_EXPECTED_RELEASE_SHA:-}}"
TEST_PORT="${RC_DEPLOY_TEST_PORT:-3101}"
DB_FILE="/var/lib/rc-geradores/rc-geradores.db"
CONTROL_SOCKET="/run/rc-geradores/control.sock"
PROVISION_SOCKET="/run/rc-geradores/provision.sock"

fail() { echo "ERRO: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Uso: sudo bash ops/preflight_vm.sh [ref] [sha-esperado]

Executa somente validações e fetch Git. Não para, reinicia ou altera serviços.
Exemplo:
  sudo bash ops/preflight_vm.sh rc-pr31-test abcdef123456...
EOF
  exit 0
fi

[[ ${EUID} -eq 0 ]] || fail "execute como root"
[[ -d "${BASE}/.git" ]] || fail "repositório não encontrado em ${BASE}"
[[ -f "${BASE}/package.json" ]] || fail "package.json não encontrado em ${BASE}"
[[ -f "${ENV_FILE}" ]] || fail "arquivo de ambiente não encontrado: ${ENV_FILE}"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
BASE="${RC_PROJECT_ROOT:-${BASE}}"
DB_FILE="${RC_DB_FILE:-${RC_DATA_DIR:-/var/lib/rc-geradores}/rc-geradores.db}"
CONTROL_SOCKET="${RC_RAPID_CONTROL_SOCKET:-${CONTROL_SOCKET}}"
PROVISION_SOCKET="${RC_PROVISION_SOCKET:-${PROVISION_SOCKET}}"
TEST_PORT="${RC_DEPLOY_TEST_PORT:-${TEST_PORT}}"

for cmd in git tar npm node curl systemctl runuser ss python3 dotnet nginx openssl hostname id find awk jq df; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: ${cmd}"
done
ok "comandos obrigatórios disponíveis"

id rcgeradores >/dev/null 2>&1 || fail "usuário rcgeradores não existe"
ok "usuário rcgeradores disponível"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
[[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 22 )) || fail "Node 22+ obrigatório; atual: $(node --version 2>/dev/null || echo ausente)"
ok "Node $(node --version)"

python3 -m venv --help >/dev/null 2>&1 || fail "python3-venv não está disponível"
ok "python3-venv disponível"

dotnet --list-sdks 2>/dev/null | grep -q '^8\.' || fail ".NET SDK 8 ausente"
dotnet --list-runtimes 2>/dev/null | grep -q '^Microsoft.NETCore.App 8\.' || fail ".NET Runtime 8 ausente"
ok ".NET SDK/runtime 8 disponíveis"

SCADA_COMMON="$(find /opt/scada -type f -name ScadaCommon.dll -print -quit 2>/dev/null || true)"
[[ -n "${SCADA_COMMON}" && -f "${SCADA_COMMON}" ]] || fail "ScadaCommon.dll não encontrado em /opt/scada"
ok "ScadaCommon.dll: ${SCADA_COMMON}"

for file in \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat; do
  [[ -f "${file}" ]] || fail "arquivo Rapid SCADA ausente: ${file}"
done
ok "arquivos Rapid SCADA essenciais presentes"

for svc in scadaserver6 scadacomm6 nginx; do
  systemctl is-active --quiet "${svc}" || fail "serviço pré-requisito inativo: ${svc}"
done
ok "Rapid SCADA e Nginx ativos antes do deploy"

nginx -t >/dev/null 2>&1 || fail "configuração Nginx atual inválida"
ok "configuração Nginx atual válida"

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|[:.])${TEST_PORT}$"; then
  fail "porta de smoke ${TEST_PORT} já está ocupada; defina RC_DEPLOY_TEST_PORT para uma porta livre"
fi
ok "porta de smoke ${TEST_PORT} livre"

DIRTY="$(git -c safe.directory="${BASE}" -C "${BASE}" status --porcelain --untracked-files=no)"
[[ -z "${DIRTY}" ]] || { echo "${DIRTY}" >&2; fail "há alterações locais rastreadas em ${BASE}"; }
ok "checkout sem alterações rastreadas"

git -c safe.directory="${BASE}" -C "${BASE}" fetch --prune origin
git -c safe.directory="${BASE}" -C "${BASE}" fetch origin main
COMMIT="$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse "${REF}^{commit}")"
[[ -n "${COMMIT}" ]] || fail "não foi possível resolver ref ${REF}"
if [[ -n "${EXPECTED_SHA}" && "${COMMIT}" != "${EXPECTED_SHA}" ]]; then
  fail "ref ${REF} resolveu ${COMMIT}, mas o commit validado esperado é ${EXPECTED_SHA}"
fi
ok "release resolvida: ${REF} -> ${COMMIT}"

if [[ -f "${DB_FILE}" ]]; then
  python3 - "${DB_FILE}" <<'PY'
import sqlite3, sys
path = sys.argv[1]
conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
try:
    rows = [r[0] for r in conn.execute("PRAGMA quick_check")]
    if rows != ["ok"]:
        raise SystemExit("SQLite quick_check falhou: " + "; ".join(rows))

    reverse_conflicts = conn.execute(
        """
        SELECT listen_port, modbus_unit, COUNT(*) AS qty,
               GROUP_CONCAT(tag, ', ') AS tags
        FROM generators
        WHERE transport='reverse_tcp' AND listen_port > 0
        GROUP BY listen_port, modbus_unit
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    if reverse_conflicts:
        detail = "; ".join(
            f"porta {port}/Unit {unit}: {qty} ({tags})"
            for port, unit, qty, tags in reverse_conflicts
        )
        raise SystemExit("Conflito de identidade reverse TCP antes da migração: " + detail)

    device_conflicts = conn.execute(
        """
        SELECT rapid_device_num, COUNT(*) AS qty,
               GROUP_CONCAT(tag, ', ') AS tags
        FROM generators
        WHERE rapid_device_num IS NOT NULL
        GROUP BY rapid_device_num
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    if device_conflicts:
        detail = "; ".join(
            f"Rapid Device {device}: {qty} ({tags})"
            for device, qty, tags in device_conflicts
        )
        raise SystemExit("Conflito de Rapid Device antes da migração: " + detail)
finally:
    conn.close()
PY
  ok "SQLite atual íntegro e sem identidades industriais duplicadas: ${DB_FILE}"
else
  ok "banco ainda não existe; deploy fará inicialização"
fi

if [[ -n "${RC_TLS_CERT_FILE:-}" || -n "${RC_TLS_KEY_FILE:-}" ]]; then
  [[ -n "${RC_TLS_CERT_FILE:-}" && -n "${RC_TLS_KEY_FILE:-}" ]] || fail "RC_TLS_CERT_FILE e RC_TLS_KEY_FILE devem ser configurados juntos"
  [[ -f "${RC_TLS_CERT_FILE}" && -f "${RC_TLS_KEY_FILE}" ]] || fail "certificado/chave TLS configurados não existem"
  openssl x509 -in "${RC_TLS_CERT_FILE}" -noout -checkend 86400 >/dev/null || fail "certificado TLS configurado inválido ou expira em menos de 24h"
  openssl pkey -in "${RC_TLS_KEY_FILE}" -noout -check >/dev/null || fail "chave TLS configurada inválida"
  ok "certificado/chave TLS externos válidos"
fi

FREE_KB="$(df -Pk "${BASE}" | awk 'NR==2 {print $4}')"
[[ "${FREE_KB}" =~ ^[0-9]+$ ]] || fail "não foi possível calcular espaço livre em ${BASE}"
MIN_FREE_MB="${RC_DEPLOY_MIN_FREE_MB:-1024}"
[[ "${MIN_FREE_MB}" =~ ^[0-9]+$ ]] || fail "RC_DEPLOY_MIN_FREE_MB inválido"
(( FREE_KB >= MIN_FREE_MB * 1024 )) || fail "espaço livre insuficiente: mínimo ${MIN_FREE_MB} MiB"
ok "espaço livre suficiente: $((FREE_KB / 1024)) MiB"

if [[ -S "${CONTROL_SOCKET}" ]]; then ok "socket de controle atual presente: ${CONTROL_SOCKET}"; else echo "INFO: socket de controle ainda não presente: ${CONTROL_SOCKET}"; fi
if [[ -S "${PROVISION_SOCKET}" ]]; then ok "socket de provisionamento atual presente: ${PROVISION_SOCKET}"; else echo "INFO: socket de provisionamento ainda não presente: ${PROVISION_SOCKET}"; fi

echo "============================================================"
echo " PRE-FLIGHT APROVADO — NENHUM SERVIÇO FOI ALTERADO"
echo " Release: ${COMMIT}"
echo "============================================================"
