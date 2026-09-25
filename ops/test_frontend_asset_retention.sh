#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="${ROOT}/ops/deploy_release_v2.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

FUNCTION_SOURCE="$(awk '
  /^preserve_previous_frontend_assets\(\) \{/ { capture=1 }
  capture { print }
  capture && /^}$/ { exit }
' "${DEPLOY}")"
[[ -n "${FUNCTION_SOURCE}" ]] || {
  echo "função de retenção de assets não encontrada" >&2
  exit 1
}
eval "${FUNCTION_SOURCE}"

PREV="${TMP}/prev"
NEXT="${TMP}/next"
THIRD="${TMP}/third"
mkdir -p "${PREV}/public/assets" "${NEXT}/public/assets" "${THIRD}/public/assets"

printf 'old-a' >"${PREV}/public/assets/a-old.js"
printf 'old-shared' >"${PREV}/public/assets/shared.js"
printf 'new-b' >"${NEXT}/public/assets/b-new.js"
printf 'new-shared' >"${NEXT}/public/assets/shared.js"

preserve_previous_frontend_assets "${PREV}" "${NEXT}"

[[ "$(cat "${NEXT}/public/assets/a-old.js")" == "old-a" ]]
[[ "$(cat "${NEXT}/public/assets/b-new.js")" == "new-b" ]]
[[ "$(cat "${NEXT}/public/assets/shared.js")" == "new-shared" ]]

printf '%s\n' 'b-new.js' 'shared.js' >"${TMP}/expected-next-manifest"
cmp -s "${TMP}/expected-next-manifest" "${NEXT}/.rc-current-assets" || {
  echo "manifesto da release nova contém fallback antigo ou formato inválido" >&2
  diff -u "${TMP}/expected-next-manifest" "${NEXT}/.rc-current-assets" || true
  exit 1
}

printf 'new-c' >"${THIRD}/public/assets/c-new.js"
preserve_previous_frontend_assets "${NEXT}" "${THIRD}"

[[ "$(cat "${THIRD}/public/assets/b-new.js")" == "new-b" ]]
[[ "$(cat "${THIRD}/public/assets/shared.js")" == "new-shared" ]]
[[ "$(cat "${THIRD}/public/assets/c-new.js")" == "new-c" ]]
[[ ! -e "${THIRD}/public/assets/a-old.js" ]] || {
  echo "asset de duas gerações atrás foi acumulado indevidamente" >&2
  exit 1
}

printf '%s\n' 'c-new.js' >"${TMP}/expected-third-manifest"
cmp -s "${TMP}/expected-third-manifest" "${THIRD}/.rc-current-assets"

echo "Frontend asset retention: OK"
