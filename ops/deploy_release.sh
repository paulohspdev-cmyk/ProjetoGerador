#!/usr/bin/env bash
set -Eeuo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
SCRIPT="${BASE}/ops/deploy_release_v2.sh"

if [[ ! -f "${SCRIPT}" ]]; then
  SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy_release_v2.sh"
fi

[[ -f "${SCRIPT}" ]] || { echo "ERRO: deploy_release_v2.sh não encontrado" >&2; exit 1; }
exec bash "${SCRIPT}" "$@"
