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
TEST_PORT="${RC_DEPLOY_TEST_PORT:-3101}"
TEST_PID=""
CONTROL_SOCKET="/run/rc-geradores/control.sock"

log() {
  printf '\n=== %s ===\n' "$*"
}

cleanup() {
  if [[ -n "${TEST_PID}" ]]; then
    kill "${TEST_PID}" 2>/dev/null || true
    wait "${TEST_PID}" 2>/dev/null || true
  fi
  rm -rf "${STAGE}" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "execute como root: sudo bash ops/deploy_release.sh [ref]"
fi

[[ -d "${BASE}/.git" ]] || fail "repositório não encontrado em ${BASE}"
[[ -f "${BASE}/package.json" ]] || fail "package.json não encontrado em ${BASE}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  CONTROL_SOCKET="${RC_RAPID_CONTROL_SOCKET:-${CONTROL_SOCKET}}"
fi

for cmd in git tar npm node curl systemctl runuser; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: ${cmd}"
done

log "RESOLVENDO RELEASE ${REF}"
git -c safe.directory="${BASE}" -C "${BASE}" fetch origin main
COMMIT="$(git -c safe.directory="${BASE}" -C "${BASE}" rev-parse "${REF}^{commit}")"
echo "Commit: ${COMMIT}"

log "CRIANDO STAGING LIMPO"
mkdir -p "${STAGE}"
git -c safe.directory="${BASE}" -C "${BASE}" archive "${COMMIT}" | tar -x -C "${STAGE}"

cd "${STAGE}"

grep -q 'className="gen-top"' src/components/generators/GeneratorDetailScreen.tsx \
  || fail "layout industrial não encontrado na release"
grep -q 'availableMetrics' src/components/generators/PowerFlowCard.tsx \
  || fail "PowerFlowCard sem telemetria real"
grep -q '"device": rapid_device' backend/app/control.py \
  || fail "controle IG200 ainda está fixando Rapid Device"

log "BUILD FORA DA PRODUÇÃO"
npm ci --include=dev
NITRO_PRESET=node-server npm run build
npm prune --omit=dev
[[ -f .output/server/index.mjs ]] || fail "build não gerou .output/server/index.mjs"

echo "Build: OK"

log "SMOKE ISOLADO NA PORTA ${TEST_PORT}"
if ss -ltn 2>/dev/null | grep -q ":${TEST_PORT} "; then
  fail "porta de teste ${TEST_PORT} já está ocupada"
fi

runuser -u rcgeradores -- env \
  NODE_ENV=production \
  HOST=127.0.0.1 \
  PORT="${TEST_PORT}" \
  node "${STAGE}/.output/server/index.mjs" \
  >"/tmp/rc-deploy-${STAMP}.log" 2>&1 &
TEST_PID=$!

SMOKE_OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${TEST_PORT}/" >/dev/null 2>&1; then
    SMOKE_OK=1
    break
  fi
  sleep 0.5
done

if [[ ${SMOKE_OK} -ne 1 ]]; then
  cat "/tmp/rc-deploy-${STAMP}.log" >&2 || true
  fail "frontend novo não respondeu na porta ${TEST_PORT}"
fi

kill "${TEST_PID}" 2>/dev/null || true
wait "${TEST_PID}" 2>/dev/null || true
TEST_PID=""
echo "Smoke ${TEST_PORT}: OK"

log "BACKUP DA PRODUÇÃO"
mkdir -p "${BACKUP}"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.output' \
  --exclude='.output.*' \
  --exclude='backend/.venv' \
  -C "${BASE}" -czf "${BACKUP}/source-before.tgz" .

[[ -f "${ENV_FILE}" ]] && cp -a "${ENV_FILE}" "${BACKUP}/rc-geradores.env" || true
[[ -f /var/lib/rc-geradores/rapid-bindings.json ]] \
  && cp -a /var/lib/rc-geradores/rapid-bindings.json "${BACKUP}/rapid-bindings.json" || true

echo "Backup: ${BACKUP}"

log "PREPARANDO OUTPUT NOVO"
rm -rf "${NEW_OUTPUT}"
cp -a "${STAGE}/.output" "${NEW_OUTPUT}"
chown -R rcgeradores:rcgeradores "${NEW_OUTPUT}"

log "INSTALANDO FONTES DO COMMIT ${COMMIT}"
git -c safe.directory="${BASE}" -C "${BASE}" archive "${COMMIT}" | tar -x -C "${BASE}"
printf '%s\n' "${COMMIT}" > /var/lib/rc-geradores/deployed-commit
chown root:rcgeradores /var/lib/rc-geradores/deployed-commit
chmod 0640 /var/lib/rc-geradores/deployed-commit

log "TROCA ATÔMICA DO FRONTEND"
rm -rf "${OLD_OUTPUT}"
if [[ -d "${BASE}/.output" ]]; then
  mv "${BASE}/.output" "${OLD_OUTPUT}"
fi
mv "${NEW_OUTPUT}" "${BASE}/.output"
chown -R rcgeradores:rcgeradores "${BASE}/.output"

rollback() {
  echo
  echo "========================================="
  echo " FALHA DE VALIDAÇÃO - ROLLBACK"
  echo "========================================="

  systemctl stop \
    rc-geradores-frontend \
    rc-geradores-api \
    rc-geradores-bridge \
    rc-geradores-worker \
    rc-geradores-provision 2>/dev/null || true

  rm -rf "${BASE}/.output"
  if [[ -d "${OLD_OUTPUT}" ]]; then
    mv "${OLD_OUTPUT}" "${BASE}/.output"
  fi

  tar -C "${BASE}" -xzf "${BACKUP}/source-before.tgz"

  systemctl start rc-geradores-provision 2>/dev/null || true
  systemctl start rc-geradores-worker 2>/dev/null || true
  systemctl start rc-geradores-bridge
  systemctl start rc-geradores-api
  systemctl start rc-geradores-frontend

  echo "Rollback concluído."
}

log "REINICIANDO SERVIÇOS"
systemctl restart rc-geradores-provision 2>/dev/null || true
systemctl restart rc-geradores-worker 2>/dev/null || true
systemctl restart rc-geradores-bridge
systemctl restart rc-geradores-api
systemctl restart rc-geradores-frontend
sleep 4

log "VALIDAÇÃO DE PRODUÇÃO"
FAIL=0
for svc in rc-geradores-bridge rc-geradores-api rc-geradores-frontend; do
  if systemctl is-active --quiet "${svc}"; then
    echo "${svc}: OK"
  else
    echo "${svc}: FALHOU"
    FAIL=1
  fi
done

if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
  echo "Frontend HTTP: OK"
else
  echo "Frontend HTTP: FALHOU"
  FAIL=1
fi

if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
  echo "API HTTP: OK"
else
  echo "API HTTP: FALHOU"
  FAIL=1
fi

# IMPORTANTE: este teste precisa rodar como root (este script exige EUID=0).
# /run/rc-geradores é 0770 rcgeradores:rcgeradores; um usuário comum fora do
# grupo não consegue nem fazer stat() no socket e produz falso negativo.
if test -S "${CONTROL_SOCKET}"; then
  echo "Controle socket: OK (${CONTROL_SOCKET})"
else
  echo "Controle socket: FALHOU (${CONTROL_SOCKET})"
  FAIL=1
fi

if [[ ${FAIL} -ne 0 ]]; then
  rollback
  exit 1
fi

log "RELEASE INSTALADA COM SUCESSO"
echo "Commit: ${COMMIT}"
echo "Controle: ${RC_ENABLE_IG200_CONTROL:-0}"
echo "Backup: ${BACKUP}"
