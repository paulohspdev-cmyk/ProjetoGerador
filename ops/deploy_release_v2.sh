#!/usr/bin/env bash
set -Eeuo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
REF="${1:-origin/main}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE="/tmp/rc-geradores-deploy-${STAMP}"
BACKUP_ROOT="/var/lib/rc-geradores/backups"
BACKUP="${BACKUP_ROOT}/deploy-${STAMP}"
NEW_OUTPUT="${BASE}/.output.new-${STAMP}"
OLD_OUTPUT="${BASE}/.output.before-${STAMP}"
OLD_VENV="${BASE}/backend/.venv.before-${STAMP}"
OLD_READER="${BASE}/.rapid-reader.before-${STAMP}"
TEST_PORT="${RC_DEPLOY_TEST_PORT:-3101}"
TEST_PID=""
CONTROL_SOCKET="/run/rc-geradores/control.sock"
DB_FILE="/var/lib/rc-geradores/rc-geradores.db"
NGINX_SITE="/etc/nginx/sites-available/rc-geradores"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
TLS_DIR="/etc/ssl/rc-geradores"
SCADA_COMMON=""
PREV_HEAD=""
PREV_BRANCH=""
MARKER_EXISTED=0
VENV_SWAPPED=0
READER_SWAPPED=0
OUTPUT_SWAPPED=0
DB_SNAPSHOT=""
NGINX_SITE_EXISTED=0
NGINX_ENABLED_EXISTED=0
TLS_DIR_EXISTED=0

SERVICES=(rc-geradores-provision rc-geradores-worker rc-geradores-bridge rc-geradores-api rc-geradores-frontend)

log() { printf '\n=== %s ===\n' "$*"; }
fail() { echo "ERRO: $*" >&2; exit 1; }

cleanup() {
  if [[ -n "${TEST_PID}" ]]; then
    kill "${TEST_PID}" 2>/dev/null || true
    wait "${TEST_PID}" 2>/dev/null || true
  fi
  rm -rf "${STAGE}" "${NEW_OUTPUT}" 2>/dev/null || true
}
trap cleanup EXIT

[[ ${EUID} -eq 0 ]] || fail "execute como root: sudo bash ops/deploy_release.sh [ref]"
[[ -d "${BASE}/.git" ]] || fail "repositório não encontrado em ${BASE}"
[[ -f "${BASE}/package.json" ]] || fail "package.json não encontrado em ${BASE}"
[[ -f "${ENV_FILE}" ]] || fail "arquivo de ambiente não encontrado: ${ENV_FILE}"

# shellcheck disable=SC1090
source "${ENV_FILE}"
CONTROL_SOCKET="${RC_RAPID_CONTROL_SOCKET:-${CONTROL_SOCKET}}"
DB_FILE="${RC_DB_FILE:-${RC_DATA_DIR:-/var/lib/rc-geradores}/rc-geradores.db}"

for cmd in git tar npm node curl systemctl runuser ss python3 dotnet install cp mv nginx openssl hostname id find awk; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: ${cmd}"
done
id rcgeradores >/dev/null 2>&1 || fail "usuário de serviço rcgeradores não existe"
python3 -m venv --help >/dev/null 2>&1 || fail "python3-venv não está disponível"
dotnet --list-sdks 2>/dev/null | grep -q '^8\.' || fail ".NET SDK 8 é obrigatório para publicar o leitor Rapid"
SCADA_COMMON="$(find /opt/scada -type f -name ScadaCommon.dll -print -quit 2>/dev/null || true)"
[[ -n "${SCADA_COMMON}" && -f "${SCADA_COMMON}" ]] || fail "ScadaCommon.dll não encontrado antes do deploy"
nginx -t >/dev/null 2>&1 || fail "configuração Nginx atual é inválida; corrija antes do deploy"

log "VALIDANDO CHECKOUT ATUAL"
PREV_HEAD="$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse HEAD)"
PREV_BRANCH="$(git -c safe.directory="${BASE}" -C "${BASE}" symbolic-ref --short -q HEAD || true)"
DIRTY="$(git -c safe.directory="${BASE}" -C "${BASE}" status --porcelain --untracked-files=no)"
[[ -z "${DIRTY}" ]] || { echo "${DIRTY}" >&2; fail "há alterações locais rastreadas em ${BASE}"; }

log "RESOLVENDO RELEASE ${REF}"
git -c safe.directory="${BASE}" -C "${BASE}" fetch --prune origin
git -c safe.directory="${BASE}" -C "${BASE}" fetch origin main
COMMIT="$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse "${REF}^{commit}")"
echo "Commit: ${COMMIT}"

log "CRIANDO STAGING LIMPO"
mkdir -p "${STAGE}"
git -c safe.directory="${BASE}" -C "${BASE}" archive "${COMMIT}" | tar -x -C "${STAGE}"
cd "${STAGE}"

test -f scripts/check-architecture.mjs || fail "release sem guardrail de arquitetura"
test -f scripts/check-functional-surfaces.mjs || fail "release sem guardrail funcional"
test -f backend/requirements.txt || fail "release sem requirements do backend"
test -f rapid/reader/RcRapidReader.csproj || fail "release sem projeto do leitor Rapid"
test -f ops/systemd/rc-geradores-api.service || fail "release sem unidades systemd"
test -f ops/nginx/rc-geradores.conf || fail "release sem configuração Nginx"
test -f ops/configure_https.sh || fail "release sem hardening HTTPS"
grep -q 'require_remove = require_remove_permission' backend/app/auth.py || fail "release sem bloqueio da exclusão direta de gerador"
grep -q '"device": rapid_device' backend/app/control.py || fail "controle IG200 ainda está fixando Rapid Device"

log "VALIDANDO FRONTEND FORA DA PRODUÇÃO"
npm ci --include=dev
npm run check:architecture
npm run check:functional
npm run lint
npm run typecheck
NITRO_PRESET=node-server npm run build
npm prune --omit=dev
[[ -f .output/server/index.mjs ]] || fail "build não gerou .output/server/index.mjs"

log "SMOKE ISOLADO NA PORTA ${TEST_PORT}"
if ss -ltn 2>/dev/null | grep -q ":${TEST_PORT} "; then fail "porta ${TEST_PORT} já está ocupada"; fi
runuser -u rcgeradores -- env NODE_ENV=production HOST=127.0.0.1 PORT="${TEST_PORT}" node "${STAGE}/.output/server/index.mjs" >"/tmp/rc-deploy-${STAMP}.log" 2>&1 &
TEST_PID=$!
SMOKE_OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${TEST_PORT}/" >/dev/null 2>&1; then SMOKE_OK=1; break; fi
  sleep 0.5
done
if [[ ${SMOKE_OK} -ne 1 ]]; then cat "/tmp/rc-deploy-${STAMP}.log" >&2 || true; fail "frontend novo não respondeu"; fi
kill "${TEST_PID}" 2>/dev/null || true
wait "${TEST_PID}" 2>/dev/null || true
TEST_PID=""

log "BACKUP TRANSACIONAL DA PRODUÇÃO"
install -d -m 0750 -o root -g rcgeradores "${BACKUP}"
printf '%s\n' "${PREV_HEAD}" >"${BACKUP}/git-head-before"
printf '%s\n' "${PREV_BRANCH}" >"${BACKUP}/git-branch-before"
cp -a "${ENV_FILE}" "${BACKUP}/rc-geradores.env"
[[ -f /var/lib/rc-geradores/rapid-bindings.json ]] && cp -a /var/lib/rc-geradores/rapid-bindings.json "${BACKUP}/rapid-bindings.json" || true
if [[ -f /var/lib/rc-geradores/deployed-commit ]]; then cp -a /var/lib/rc-geradores/deployed-commit "${BACKUP}/deployed-commit-before"; MARKER_EXISTED=1; fi

mkdir -p "${BACKUP}/systemd" "${BACKUP}/web"
: >"${BACKUP}/systemd-existing.txt"
for unit in "${STAGE}"/ops/systemd/*.service; do
  name="$(basename "${unit}")"
  if [[ -f "/etc/systemd/system/${name}" ]]; then
    cp -a "/etc/systemd/system/${name}" "${BACKUP}/systemd/${name}"
    echo "${name}" >>"${BACKUP}/systemd-existing.txt"
  fi
done

if [[ -e "${NGINX_SITE}" || -L "${NGINX_SITE}" ]]; then
  cp -a "${NGINX_SITE}" "${BACKUP}/web/nginx-site-before"
  NGINX_SITE_EXISTED=1
fi
if [[ -d "${NGINX_ENABLED_DIR}" ]]; then
  cp -a "${NGINX_ENABLED_DIR}" "${BACKUP}/web/sites-enabled-before"
  NGINX_ENABLED_EXISTED=1
fi
if [[ -d "${TLS_DIR}" ]]; then
  cp -a "${TLS_DIR}" "${BACKUP}/web/tls-before"
  TLS_DIR_EXISTED=1
fi

if [[ -f "${DB_FILE}" ]]; then
  DB_SNAPSHOT="${BACKUP}/product-db-before.sqlite3"
  python3 - "${DB_FILE}" "${DB_SNAPSHOT}" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1:3]
a = sqlite3.connect(src); b = sqlite3.connect(dst)
try: a.backup(b)
finally: b.close(); a.close()
c = sqlite3.connect(f"file:{dst}?mode=ro", uri=True)
try: rows = [r[0] for r in c.execute("PRAGMA quick_check")]
finally: c.close()
if rows != ["ok"]: raise SystemExit("snapshot SQLite inválido: " + "; ".join(rows))
print("Snapshot SQLite: OK")
PY
  chmod 0640 "${DB_SNAPSHOT}"
fi

tar --exclude='.git' --exclude='node_modules' --exclude='.output*' --exclude='backend/.venv*' --exclude='.rapid-reader*' -C "${BASE}" -czf "${BACKUP}/source-before.tgz" .

echo "Backup: ${BACKUP}"

rollback() {
  trap - ERR
  set +e
  echo; echo "========================================="; echo " FALHA - ROLLBACK TRANSACIONAL"; echo "========================================="
  systemctl stop "${SERVICES[@]}" 2>/dev/null || true

  if [[ ${OUTPUT_SWAPPED} -eq 1 ]]; then rm -rf "${BASE}/.output"; [[ -d "${OLD_OUTPUT}" ]] && mv "${OLD_OUTPUT}" "${BASE}/.output"; fi
  if [[ ${VENV_SWAPPED} -eq 1 ]]; then rm -rf "${BASE}/backend/.venv"; [[ -d "${OLD_VENV}" ]] && mv "${OLD_VENV}" "${BASE}/backend/.venv"; fi
  if [[ ${READER_SWAPPED} -eq 1 ]]; then rm -rf "${BASE}/.rapid-reader"; [[ -d "${OLD_READER}" ]] && mv "${OLD_READER}" "${BASE}/.rapid-reader"; fi

  if [[ -n "${PREV_BRANCH}" ]]; then git -c safe.directory="${BASE}" -C "${BASE}" checkout -B "${PREV_BRANCH}" "${PREV_HEAD}" || true; else git -c safe.directory="${BASE}" -C "${BASE}" checkout --detach "${PREV_HEAD}" || true; fi
  git -c safe.directory="${BASE}" -C "${BASE}" reset --hard "${PREV_HEAD}" || true
  tar -C "${BASE}" -xzf "${BACKUP}/source-before.tgz" || true

  for unit in "${STAGE}"/ops/systemd/*.service; do rm -f "/etc/systemd/system/$(basename "${unit}")"; done
  if [[ -d "${BACKUP}/systemd" ]]; then cp -a "${BACKUP}/systemd"/*.service /etc/systemd/system/ 2>/dev/null || true; fi
  systemctl daemon-reload || true

  if [[ -n "${DB_SNAPSHOT}" && -f "${DB_SNAPSHOT}" ]]; then
    python3 - "${DB_SNAPSHOT}" "${DB_FILE}" <<'PY'
import os, shutil, sqlite3, sys
src, dst = sys.argv[1:3]
tmp = dst + ".rollback.tmp"
shutil.copy2(src, tmp)
c = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
try: rows=[r[0] for r in c.execute("PRAGMA quick_check")]
finally: c.close()
if rows != ["ok"]: raise SystemExit("snapshot de rollback inválido")
os.replace(tmp, dst)
PY
    chown rcgeradores:rcgeradores "${DB_FILE}" 2>/dev/null || true
    chmod 0640 "${DB_FILE}" 2>/dev/null || true
  fi

  cp -a "${BACKUP}/rc-geradores.env" "${ENV_FILE}" 2>/dev/null || true
  if [[ ${MARKER_EXISTED} -eq 1 && -f "${BACKUP}/deployed-commit-before" ]]; then cp -a "${BACKUP}/deployed-commit-before" /var/lib/rc-geradores/deployed-commit; else rm -f /var/lib/rc-geradores/deployed-commit; fi

  if [[ ${NGINX_SITE_EXISTED} -eq 1 && -e "${BACKUP}/web/nginx-site-before" ]]; then
    rm -f "${NGINX_SITE}"
    cp -a "${BACKUP}/web/nginx-site-before" "${NGINX_SITE}" 2>/dev/null || true
  else
    rm -f "${NGINX_SITE}"
  fi
  if [[ ${NGINX_ENABLED_EXISTED} -eq 1 && -d "${BACKUP}/web/sites-enabled-before" ]]; then
    rm -rf "${NGINX_ENABLED_DIR}"
    cp -a "${BACKUP}/web/sites-enabled-before" "${NGINX_ENABLED_DIR}" 2>/dev/null || true
  fi
  if [[ ${TLS_DIR_EXISTED} -eq 1 && -d "${BACKUP}/web/tls-before" ]]; then
    rm -rf "${TLS_DIR}"
    cp -a "${BACKUP}/web/tls-before" "${TLS_DIR}" 2>/dev/null || true
  else
    rm -rf "${TLS_DIR}"
  fi
  nginx -t >/dev/null 2>&1 && systemctl restart nginx >/dev/null 2>&1 || true

  systemctl start "${SERVICES[@]}" 2>/dev/null || true
  echo "Rollback concluído para ${PREV_HEAD}."
}

# A partir daqui qualquer erro inesperado também restaura a produção anterior.
trap 'rc=$?; rollback; exit "$rc"' ERR

log "PARANDO SERVIÇOS RC PARA TROCA DE RUNTIME"
systemctl stop "${SERVICES[@]}" 2>/dev/null || true

log "ALINHANDO CHECKOUT AO COMMIT ${COMMIT}"
git -c safe.directory="${BASE}" -C "${BASE}" checkout -B main "${COMMIT}"
git -c safe.directory="${BASE}" -C "${BASE}" reset --hard "${COMMIT}"
[[ "$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse HEAD)" == "${COMMIT}" ]] || { rollback; fail "HEAD não ficou no commit solicitado"; }

log "INSTALANDO VENV DO BACKEND"
rm -rf "${OLD_VENV}"
[[ -d "${BASE}/backend/.venv" ]] && mv "${BASE}/backend/.venv" "${OLD_VENV}"
VENV_SWAPPED=1
if ! python3 -m venv "${BASE}/backend/.venv"; then rollback; fail "falha ao criar venv"; fi
if ! "${BASE}/backend/.venv/bin/pip" install --disable-pip-version-check -r "${BASE}/backend/requirements.txt"; then rollback; fail "falha ao instalar dependências Python"; fi
chown -R rcgeradores:rcgeradores "${BASE}/backend/.venv"

log "COMPILANDO LEITOR RAPID"
[[ -f "${SCADA_COMMON}" ]] || { rollback; fail "ScadaCommon.dll desapareceu durante o deploy"; }
rm -rf "${OLD_READER}"
[[ -d "${BASE}/.rapid-reader" ]] && mv "${BASE}/.rapid-reader" "${OLD_READER}"
READER_SWAPPED=1
mkdir -p "${BASE}/.rapid-reader"
if ! dotnet build "${BASE}/rapid/reader/RcRapidReader.csproj" -c Release -o "${BASE}/.rapid-reader" -p:ScadaCommonPath="${SCADA_COMMON}" --nologo; then rollback; fail "falha ao compilar leitor Rapid"; fi
find "$(dirname "${SCADA_COMMON}")" -maxdepth 1 -type f -name 'Scada*.dll' -exec cp --update=none {} "${BASE}/.rapid-reader/" \; 2>/dev/null || true
chmod -R a+rX "${BASE}/.rapid-reader"

log "INSTALANDO UNIDADES SYSTEMD VERSIONADAS"
for unit in "${BASE}"/ops/systemd/*.service; do install -m 0644 "${unit}" "/etc/systemd/system/$(basename "${unit}")"; done
systemctl daemon-reload

log "EXECUTANDO MIGRAÇÕES/INICIALIZAÇÃO COM SNAPSHOT PRÉVIO"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
export PYTHONPATH="${BASE}/backend"
if ! "${BASE}/backend/.venv/bin/python" - <<'PY'
from app import db, domain_store, ops_store, platform_store, transport_store
db.init_db(); ops_store.init_ops_db(); platform_store.init_platform_db(); transport_store.init_transport_db(); domain_store.init_domain_db(); domain_store.sync_legacy_generators()
with db.connect() as conn:
    rows=[r[0] for r in conn.execute("PRAGMA quick_check")]
if rows != ["ok"]: raise SystemExit("SQLite quick_check pós-migração falhou: " + "; ".join(rows))
from app.main import app
print(app.title, app.version, "backend preflight OK")
PY
then rollback; fail "backend/migração falhou"; fi

log "TROCA ATÔMICA DO FRONTEND"
rm -rf "${NEW_OUTPUT}" "${OLD_OUTPUT}"
cp -a "${STAGE}/.output" "${NEW_OUTPUT}"
chown -R rcgeradores:rcgeradores "${NEW_OUTPUT}"
[[ -d "${BASE}/.output" ]] && mv "${BASE}/.output" "${OLD_OUTPUT}"
mv "${NEW_OUTPUT}" "${BASE}/.output"
OUTPUT_SWAPPED=1

log "APLICANDO HARDENING WEB/HTTPS"
chmod +x "${BASE}/ops/configure_https.sh"
if ! RC_HTTPS_SKIP_APP_SMOKE=1 bash "${BASE}/ops/configure_https.sh"; then rollback; fail "não foi possível aplicar HTTPS"; fi
# shellcheck disable=SC1090
source "${ENV_FILE}"
CONTROL_SOCKET="${RC_RAPID_CONTROL_SOCKET:-${CONTROL_SOCKET}}"

log "REINICIANDO SERVIÇOS"
for svc in "${SERVICES[@]}"; do systemctl restart "${svc}" 2>/dev/null || { rollback; fail "falha ao reiniciar ${svc}"; }; done
sleep 4

log "VALIDAÇÃO DE PRODUÇÃO"
FAIL=0
for svc in "${SERVICES[@]}"; do if systemctl is-active --quiet "${svc}"; then echo "${svc}: OK"; else echo "${svc}: FALHOU"; FAIL=1; fi; done
nginx -t >/dev/null 2>&1 && echo "Nginx: OK" || { echo "Nginx: FALHOU"; FAIL=1; }
curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1 && echo "Frontend interno: OK" || { echo "Frontend interno: FALHOU"; FAIL=1; }
curl -kfsS https://127.0.0.1/api/health >/dev/null 2>&1 && echo "API HTTPS: OK" || { echo "API HTTPS: FALHOU"; FAIL=1; }
curl -sSI http://127.0.0.1/api/health 2>/dev/null | grep -qi '^Location: https://' && echo "Redirect HTTP->HTTPS: OK" || { echo "Redirect HTTP->HTTPS: FALHOU"; FAIL=1; }
test -S "${CONTROL_SOCKET}" && echo "Controle socket: OK" || { echo "Controle socket: FALHOU"; FAIL=1; }
CURRENT_HEAD="$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse HEAD)"
[[ "${CURRENT_HEAD}" == "${COMMIT}" ]] && echo "Git HEAD: OK (${CURRENT_HEAD})" || { echo "Git HEAD: FALHOU"; FAIL=1; }
[[ -z "$(git -c safe.directory="${BASE}" -C "${BASE}" status --porcelain --untracked-files=no)" ]] && echo "Git tracked status: OK" || { echo "Git tracked status: FALHOU"; FAIL=1; }
bash "${BASE}/ops/vm-smoke.sh" && echo "VM smoke: OK" || { echo "VM smoke: FALHOU"; FAIL=1; }

if [[ ${FAIL} -ne 0 ]]; then rollback; exit 1; fi

log "REGISTRANDO RELEASE VALIDADA"
printf '%s\n' "${COMMIT}" >/var/lib/rc-geradores/deployed-commit
chown root:rcgeradores /var/lib/rc-geradores/deployed-commit
chmod 0640 /var/lib/rc-geradores/deployed-commit
[[ "$(cat /var/lib/rc-geradores/deployed-commit)" == "${CURRENT_HEAD}" ]] || { rollback; fail "deployed-commit divergiu do HEAD"; }

# A partir deste ponto a nova release foi integralmente validada.
trap - ERR
rm -rf "${OLD_OUTPUT}" "${OLD_VENV}" "${OLD_READER}"
log "RELEASE INSTALADA COM SUCESSO"
echo "Commit: ${COMMIT}"
echo "HEAD: ${CURRENT_HEAD}"
echo "HTTPS: obrigatório"
echo "Backup transacional: ${BACKUP}"