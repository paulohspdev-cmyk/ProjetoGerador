#!/usr/bin/env bash
set -euo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
PYTHON="${RC_TEST_PYTHON:-${BASE}/backend/.venv/bin/python}"
[[ -x "${PYTHON}" ]] || PYTHON="$(command -v python3)"
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
)

for test_file in "${TESTS[@]}"; do
  echo "=== backend/tests/${test_file} ==="
  "${PYTHON}" "${BASE}/backend/tests/${test_file}"
done

echo "Backend smoke suite: OK (${#TESTS[@]} testes)"
