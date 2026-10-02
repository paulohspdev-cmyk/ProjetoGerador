#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/rc-backup-retention-XXXXXX)"
trap 'rm -rf "${ROOT}"' EXIT

for stamp in 20260930-120000 20260930-130000 20261001-120000 20261001-130000; do
  mkdir -p "${ROOT}/deploy-${stamp}"
  printf '%s\n' "${stamp}" >"${ROOT}/deploy-${stamp}/marker"
done
mkdir -p "${ROOT}/manual-important-backup"
printf 'preserve\n' >"${ROOT}/manual-important-backup/marker"

bash "$(dirname "$0")/prune_deploy_backups.sh" "${ROOT}" 2 >/dev/null

[[ -d "${ROOT}/deploy-20261001-130000" ]]
[[ -d "${ROOT}/deploy-20261001-120000" ]]
[[ ! -e "${ROOT}/deploy-20260930-130000" ]]
[[ ! -e "${ROOT}/deploy-20260930-120000" ]]
[[ -f "${ROOT}/manual-important-backup/marker" ]]

echo "Deploy backup retention: OK"
