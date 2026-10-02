#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT="${1:-/var/lib/rc-geradores/backups}"
KEEP="${2:-${RC_DEPLOY_BACKUP_RETENTION:-30}}"

[[ "${KEEP}" =~ ^[0-9]+$ ]] || { echo "Retenção inválida: ${KEEP}" >&2; exit 2; }
(( KEEP >= 1 )) || { echo "Retenção deve ser >= 1" >&2; exit 2; }
[[ -d "${BACKUP_ROOT}" ]] || exit 0

mapfile -t DEPLOY_BACKUPS < <(
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended \
    -regex '.*/deploy-[0-9]{8}-[0-9]{6}' \
    -printf '%f\n' |
    sort -r
)

TOTAL="${#DEPLOY_BACKUPS[@]}"
if (( TOTAL <= KEEP )); then
  echo "Backups de deploy: ${TOTAL}; retenção: ${KEEP}; nada a remover."
  exit 0
fi

REMOVED=0
for name in "${DEPLOY_BACKUPS[@]:KEEP}"; do
  path="${BACKUP_ROOT}/${name}"
  [[ -d "${path}" && ! -L "${path}" ]] || continue
  rm -rf -- "${path}"
  ((REMOVED += 1))
done

echo "Backups de deploy: ${TOTAL}; retenção: ${KEEP}; removidos: ${REMOVED}."
