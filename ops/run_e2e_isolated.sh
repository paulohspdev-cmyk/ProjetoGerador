#!/usr/bin/env bash
set -Eeuo pipefail

BASE="${RC_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PYTHON="${RC_TEST_PYTHON:-}"
if [[ -z "${PYTHON}" ]]; then
  if [[ -x /opt/rc-geradores/backend/.venv/bin/python ]]; then
    PYTHON=/opt/rc-geradores/backend/.venv/bin/python
  else
    PYTHON="$(command -v python3)"
  fi
fi
API_PORT="${E2E_API_PORT:-18090}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-13000}"
PROXY_PORT="${E2E_PROXY_PORT:-13100}"
TMP="$(mktemp -d /tmp/rc-e2e-XXXXXX)"
RETAINED_ASSET_FIXTURE="${BASE}/.output/public/assets/__retained-release-e2e.js"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "${pid}" 2>/dev/null || true; done
  for pid in "${PIDS[@]:-}"; do wait "${pid}" 2>/dev/null || true; done
  rm -f "${RETAINED_ASSET_FIXTURE}" 2>/dev/null || true
  rm -rf "${TMP}"
}
trap cleanup EXIT

wait_http() {
  local url="$1"
  for _ in $(seq 1 80); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 0.25
  done
  return 1
}

ADMIN_EMAIL="admin-e2e@example.invalid"
VIEWER_EMAIL="viewer-e2e@example.invalid"
ADMIN_PASSWORD="E2E-Admin-${RANDOM}-${RANDOM}!"
VIEWER_PASSWORD="E2E-Viewer-${RANDOM}-${RANDOM}!"

export PYTHONPATH="${BASE}/backend"
export RC_DATA_DIR="${TMP}/data"
export RC_DB_FILE="${TMP}/data/rc-geradores.db"
export RC_TOTP_KEY_FILE="${TMP}/data/totp-fernet.key"
export RC_RAPID_BINDINGS="${TMP}/rapid-bindings.json"
export RC_RAPID_SCADA_ROOT="${TMP}/scada"
export RC_RAPID_ARCHIVE_DIR="${TMP}/scada/Archive"
export RC_BRIDGE_STATUS_FILE="${TMP}/bridge-status.json"
export RC_RAPID_CONTROL_SOCKET="${TMP}/control.sock"
export RC_PROVISION_SOCKET="${TMP}/provision.sock"
export RC_AUTH_COOKIE_SECURE=0
export RC_ADMIN_NAME="Administrador E2E"
export RC_ADMIN_EMAIL="${ADMIN_EMAIL}"
export RC_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
export RC_SMTP_HOST=""
export RC_SMTP_FROM=""
export RC_API_DOCS=0

mkdir -p "${RC_DATA_DIR}" "${RC_RAPID_SCADA_ROOT}/Archive"
printf '[]\n' >"${RC_RAPID_BINDINGS}"
printf '{"updatedAt":0,"ports":[]}\n' >"${RC_BRIDGE_STATUS_FILE}"

cd "${BASE}"
NITRO_PRESET=node-server npm run build >"${TMP}/build.log" 2>&1
printf 'globalThis.__RC_RETAINED_E2E__ = true;\n' >"${RETAINED_ASSET_FIXTURE}"
"${PYTHON}" -m uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT}" >"${TMP}/api.log" 2>&1 &
PIDS+=("$!")
PORT="${FRONTEND_PORT}" HOST=127.0.0.1 node .output/server/index.mjs >"${TMP}/frontend.log" 2>&1 &
PIDS+=("$!")
E2E_API_PORT="${API_PORT}" E2E_FRONTEND_PORT="${FRONTEND_PORT}" E2E_PROXY_PORT="${PROXY_PORT}" node e2e/reverse-proxy.mjs >"${TMP}/proxy.log" 2>&1 &
PIDS+=("$!")

wait_http "http://127.0.0.1:${API_PORT}/api/health" || { cat "${TMP}/api.log"; exit 1; }
wait_http "http://127.0.0.1:${FRONTEND_PORT}/login" || { cat "${TMP}/frontend.log"; exit 1; }
wait_http "http://127.0.0.1:${PROXY_PORT}/login" || { cat "${TMP}/proxy.log"; exit 1; }

E2E_VIEWER_EMAIL="${VIEWER_EMAIL}" E2E_VIEWER_PASSWORD="${VIEWER_PASSWORD}" "${PYTHON}" - <<'PY'
import os
from app import db
from app.auth import hash_password
if not db.get_user_auth(os.environ["E2E_VIEWER_EMAIL"]):
    db.create_user(
        {
            "name": "Viewer E2E",
            "email": os.environ["E2E_VIEWER_EMAIL"],
            "password_hash": hash_password(os.environ["E2E_VIEWER_PASSWORD"]),
            "role": "visualizacao",
            "active": True,
        },
        actor="e2e",
    )
PY

E2E_BASE_URL="http://127.0.0.1:${PROXY_PORT}" \
E2E_ADMIN_EMAIL="${ADMIN_EMAIL}" E2E_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
E2E_VIEWER_EMAIL="${VIEWER_EMAIL}" E2E_VIEWER_PASSWORD="${VIEWER_PASSWORD}" \
  npx playwright test

echo "E2E isolado: OK"
