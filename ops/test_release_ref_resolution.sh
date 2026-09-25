#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="${ROOT}/ops/deploy_release_v2.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

FUNCTION_SOURCE="$(awk '
  /^resolve_release_commit\(\) \{/ { capture=1 }
  capture { print }
  capture && /^}$/ { exit }
' "${DEPLOY}")"
[[ -n "${FUNCTION_SOURCE}" ]] || {
  echo "resolvedor de release não encontrado" >&2
  exit 1
}
eval "${FUNCTION_SOURCE}"

REMOTE="${TMP}/remote.git"
SEED="${TMP}/seed"
CHECKOUT="${TMP}/checkout"
AUDIT_BRANCH="factory/auditoria-producao"

git init --bare "${REMOTE}" >/dev/null
git init -b main "${SEED}" >/dev/null
git -C "${SEED}" config user.name "RC CI"
git -C "${SEED}" config user.email "rc-ci@example.invalid"
printf 'main-v1\n' >"${SEED}/release.txt"
git -C "${SEED}" add release.txt
git -C "${SEED}" commit -m "seed main" >/dev/null
git -C "${SEED}" remote add origin "${REMOTE}"
git -C "${SEED}" push -u origin main >/dev/null

git -C "${SEED}" checkout -b "${AUDIT_BRANCH}" >/dev/null
printf 'audit-v1\n' >"${SEED}/release.txt"
git -C "${SEED}" commit -am "audit v1" >/dev/null
git -C "${SEED}" push -u origin "${AUDIT_BRANCH}" >/dev/null

git clone --quiet --single-branch --branch main "${REMOTE}" "${CHECKOUT}"
git -C "${CHECKOUT}" fetch --quiet origin "refs/heads/${AUDIT_BRANCH}"
STALE="$(git -C "${CHECKOUT}" rev-parse 'FETCH_HEAD^{commit}')"
git -C "${CHECKOUT}" update-ref "refs/remotes/origin/${AUDIT_BRANCH}" "${STALE}"

printf 'audit-v2\n' >"${SEED}/release.txt"
git -C "${SEED}" commit -am "audit v2" >/dev/null
NEW="$(git -C "${SEED}" rev-parse HEAD)"
git -C "${SEED}" push origin "${AUDIT_BRANCH}" >/dev/null

[[ "$(git -C "${CHECKOUT}" rev-parse "origin/${AUDIT_BRANCH}")" == "${STALE}" ]]
[[ "${STALE}" != "${NEW}" ]]

BASE="${CHECKOUT}"
RESOLVED="$(resolve_release_commit "origin/${AUDIT_BRANCH}")"
[[ "${RESOLVED}" == "${NEW}" ]] || {
  echo "origin/<branch> resolveu ${RESOLVED}, esperado ${NEW}" >&2
  exit 1
}

RESOLVED_RAW="$(resolve_release_commit "${AUDIT_BRANCH}")"
[[ "${RESOLVED_RAW}" == "${NEW}" ]] || {
  echo "branch sem prefixo resolveu ${RESOLVED_RAW}, esperado ${NEW}" >&2
  exit 1
}

RESOLVED_HEADS="$(resolve_release_commit "refs/heads/${AUDIT_BRANCH}")"
[[ "${RESOLVED_HEADS}" == "${NEW}" ]] || {
  echo "refs/heads/<branch> resolveu ${RESOLVED_HEADS}, esperado ${NEW}" >&2
  exit 1
}

echo "Release ref resolution: OK"
