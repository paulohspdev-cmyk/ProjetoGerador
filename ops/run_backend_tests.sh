#!/usr/bin/env bash
set -euo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
TEST_VENV="${RC_TEST_VENV:-${BASE}/backend/.venv-test}"
REQUIREMENTS="${BASE}/backend/requirements-test.txt"

if [[ -n "${RC_TEST_PYTHON:-}" ]]; then
  PYTHON="${RC_TEST_PYTHON}"
else
  command -v python3 >/dev/null 2>&1 || {
    echo "python3 não encontrado" >&2
    exit 1
  }
  EXPECTED_HASH="$(sha256sum "${BASE}/backend/requirements.txt" "${REQUIREMENTS}" | sha256sum | awk '{print $1}')"
  HASH_FILE="${TEST_VENV}/.requirements.sha256"
  CURRENT_HASH="$(cat "${HASH_FILE}" 2>/dev/null || true)"

  if [[ ! -x "${TEST_VENV}/bin/python" || "${CURRENT_HASH}" != "${EXPECTED_HASH}" ]]; then
    echo "Preparando ambiente isolado de testes Python em ${TEST_VENV}"
    rm -rf "${TEST_VENV}"
    python3 -m venv "${TEST_VENV}"
    "${TEST_VENV}/bin/pip" install --disable-pip-version-check -r "${REQUIREMENTS}"
    printf '%s\n' "${EXPECTED_HASH}" >"${HASH_FILE}"
  fi
  PYTHON="${TEST_VENV}/bin/python"
fi

export PYTHONPATH="${BASE}/backend"

TESTS=(
  smoke.py
  session_inventory.py
  rapid_overlay_resilience.py
  connectivity_evidence.py
  network_discovery.py
  reconfigure_transaction.py
  domain_v3.py
  industrial_v3.py
  control_multi_device.py
  production_hardening.py
  provision_timeout.py
  audit_regressions.py
)

for test_file in "${TESTS[@]}"; do
  echo "=== backend/tests/${test_file} ==="
  "${PYTHON}" "${BASE}/backend/tests/${test_file}"
done

echo "Backend smoke suite: OK (${#TESTS[@]} testes)"
