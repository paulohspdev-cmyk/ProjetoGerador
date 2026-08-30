#!/usr/bin/env bash
set -euo pipefail

BASE="${RC_PROJECT_ROOT:-/opt/rc-geradores}"
ENV_FILE="${RC_ENV_FILE:-/etc/rc-geradores.env}"
CONTROL_SOCKET="/run/rc-geradores/control.sock"
PROVISION_SOCKET="/run/rc-geradores/provision.sock"
REQUIRE_GENERATOR=0
FAILURES=0
SMOKE_SESSION_HASH=""

if [[ "${1:-}" == "--require-generator" ]]; then
  REQUIRE_GENERATOR=1
elif [[ $# -gt 0 ]]; then
  echo "Uso: sudo $0 [--require-generator]" >&2
  exit 2
fi

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root: sudo $0" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  BASE="${RC_PROJECT_ROOT:-$BASE}"
  CONTROL_SOCKET="${RC_RAPID_CONTROL_SOCKET:-$CONTROL_SOCKET}"
  PROVISION_SOCKET="${RC_PROVISION_SOCKET:-$PROVISION_SOCKET}"
fi

ok() { printf 'OK   %s\n' "$*"; }
info() { printf 'INFO %s\n' "$*"; }
fail() { printf 'ERRO %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }

python_as_service() {
  runuser -u rcgeradores -- env \
    PYTHONPATH="$BASE/backend" \
    RC_DATA_DIR="${RC_DATA_DIR:-/var/lib/rc-geradores}" \
    RC_DB_FILE="${RC_DB_FILE:-${RC_DATA_DIR:-/var/lib/rc-geradores}/rc-geradores.db}" \
    RC_RAPID_BINDINGS="${RC_RAPID_BINDINGS:-/var/lib/rc-geradores/rapid-bindings.json}" \
    RC_RAPID_READER="${RC_RAPID_READER:-$BASE/.rapid-reader/RcRapidReader.dll}" \
    RC_RAPID_COMM_CONFIG="${RC_RAPID_COMM_CONFIG:-/opt/scada/ScadaComm/Config/ScadaCommConfig.xml}" \
    RC_AUTH_COOKIE="${RC_AUTH_COOKIE:-rc_session}" \
    RC_AUTH_SESSION_TTL="${RC_AUTH_SESSION_TTL:-43200}" \
    "$BASE/backend/.venv/bin/python" "$@"
}

cleanup_smoke_session() {
  [[ -n "$SMOKE_SESSION_HASH" ]] || return 0
  python_as_service - "$SMOKE_SESSION_HASH" <<'PY' >/dev/null 2>&1 || true
import sys
from app import db

db.delete_session(sys.argv[1])
PY
  SMOKE_SESSION_HASH=""
}
trap cleanup_smoke_session EXIT

check_service() {
  local svc="$1"
  if systemctl is-active --quiet "$svc"; then ok "serviço $svc ativo"; else fail "serviço $svc inativo"; fi
}

check_url() {
  local label="$1" url="$2"
  if curl -fsS --max-time 8 "$url" >/dev/null; then ok "$label responde em $url"; else fail "$label não respondeu em $url"; fi
}

check_https_url() {
  local label="$1" url="$2"
  if curl -kfsS --max-time 8 "$url" >/dev/null; then ok "$label responde em $url"; else fail "$label não respondeu em $url"; fi
}

check_port() {
  local port="$1" label="$2"
  if ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "(^|[:.])${port}$"; then
    ok "$label escutando na porta $port"
  else
    fail "$label não está escutando na porta $port"
  fi
}

echo "============================================================"
echo " RC GERADORES - SMOKE TEST DA VM"
echo "============================================================"

for command in python3 node npm dotnet curl jq ss systemctl openssl nginx runuser; do
  if command -v "$command" >/dev/null 2>&1; then ok "comando $command disponível"; else fail "comando $command ausente"; fi
done

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 22 )); then ok "Node >= 22 ($(node --version))"; else fail "Node 22+ obrigatório"; fi

if dotnet --list-sdks 2>/dev/null | grep -q '^8\.'; then ok ".NET SDK 8 instalado"; else fail ".NET SDK 8 ausente"; fi
if dotnet --list-runtimes 2>/dev/null | grep -q '^Microsoft.NETCore.App 8\.'; then ok ".NET Runtime 8 instalado"; else fail ".NET Runtime 8 ausente"; fi
if nginx -t >/dev/null 2>&1; then ok "configuração Nginx válida"; else fail "configuração Nginx inválida"; fi

for file in \
  "$BASE/package.json" \
  "$BASE/backend/.venv/bin/python" \
  "$BASE/.output/server/index.mjs" \
  "$BASE/.rapid-reader/RcRapidReader.dll" \
  /etc/ssl/rc-geradores/fullchain.pem \
  /etc/ssl/rc-geradores/privkey.pem \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat; do
  if [[ -e "$file" ]]; then ok "arquivo $file"; else fail "arquivo ausente: $file"; fi
done

if openssl x509 -in /etc/ssl/rc-geradores/fullchain.pem -noout -checkend 86400 >/dev/null 2>&1; then
  ok "certificado TLS válido por mais de 24h"
else
  fail "certificado TLS ausente, inválido ou próximo da expiração"
fi

for svc in \
  rc-geradores-bridge \
  rc-geradores-provision \
  rc-geradores-api \
  rc-geradores-worker \
  rc-geradores-frontend \
  scadaserver6 \
  scadacomm6 \
  nginx; do
  check_service "$svc"
done

[[ -S "$CONTROL_SOCKET" ]] && ok "socket de controle presente: $CONTROL_SOCKET" || fail "socket de controle ausente: $CONTROL_SOCKET"
[[ -S "$PROVISION_SOCKET" ]] && ok "socket de provisionamento presente: $PROVISION_SOCKET" || fail "socket de provisionamento ausente: $PROVISION_SOCKET"

check_url "API direta" "http://127.0.0.1:8090/api/health"
check_url "frontend direto" "http://127.0.0.1:3000/"
check_https_url "proxy Nginx HTTPS" "https://127.0.0.1/api/health"
if curl -sSI --max-time 8 http://127.0.0.1/api/health | grep -qi '^Location: https://'; then
  ok "Nginx redireciona HTTP para HTTPS"
else
  fail "Nginx não redirecionou HTTP para HTTPS"
fi
check_port 8090 "API"
check_port 3000 "frontend"
check_port 80 "Nginx redirect"
check_port 443 "Nginx HTTPS"

if python3 "$BASE/rapid/provisioning/rapid_dat.py" check \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat >/tmp/rc-geradores-rapid-check.log 2>&1; then
  ok "BaseDAT íntegro"
else
  cat /tmp/rc-geradores-rapid-check.log >&2 || true
  fail "BaseDAT inválido"
fi

BINDINGS="${RC_RAPID_BINDINGS:-/var/lib/rc-geradores/rapid-bindings.json}"
RAPID_LOCAL_OFFSET="${RC_RAPID_LOCAL_OFFSET:-10000}"
if [[ ! "$RAPID_LOCAL_OFFSET" =~ ^[0-9]+$ ]]; then
  fail "RC_RAPID_LOCAL_OFFSET inválido: $RAPID_LOCAL_OFFSET"
  RAPID_LOCAL_OFFSET=10000
fi
BINDING_COUNT=0
if [[ -s "$BINDINGS" ]]; then
  BINDING_COUNT="$(jq 'length' "$BINDINGS" 2>/dev/null || echo 0)"
  if [[ "$BINDING_COUNT" =~ ^[0-9]+$ ]] && (( BINDING_COUNT > 0 )); then
    ok "$BINDING_COUNT binding(s) Rapid em runtime"
  else
    fail "arquivo de bindings inválido ou vazio: $BINDINGS"
    BINDING_COUNT=0
  fi
else
  info "nenhum binding runtime: plataforma instalada sem gerador provisionado"
fi

if (( REQUIRE_GENERATOR == 1 && BINDING_COUNT == 0 )); then
  fail "--require-generator informado, mas não existe binding provisionado"
fi

if (( BINDING_COUNT > 0 )); then
  export PYTHONPATH="$BASE/backend"
  if "$BASE/backend/.venv/bin/python" - "$BINDINGS" <<'PY'
import json
import sys
from pathlib import Path
from app import db

path = Path(sys.argv[1])
items = json.loads(path.read_text(encoding="utf-8"))
db.init_db()
for item in items:
    gid = str(item.get("generator_id") or "")
    if not gid:
        raise SystemExit("binding sem generator_id")
    g = db.get_generator(gid)
    if not g:
        raise SystemExit(f"binding órfão: {gid}")
    pairs = [
        ("controller_type", str(item.get("controller_type") or "").upper(), str(g.get("controller_type") or "").upper()),
        ("controller_model", str(item.get("controller_model") or "").strip().lower(), str(g.get("controller_model") or "").strip().lower()),
        ("transport", str(item.get("transport") or ""), str(g.get("transport") or "")),
        ("listen_port", int(item.get("listen_port") or 0), int(g.get("listen_port") or 0)),
        ("modbus_unit", int(item.get("modbus_unit") or 0), int(g.get("modbus_unit") or 1)),
    ]
    for key, actual, expected in pairs:
        if actual != expected:
            raise SystemExit(f"binding divergente {g['tag']}: {key}={actual!r}, cadastro={expected!r}")
    requested_device = int(g.get("rapid_device_num") or 0)
    if requested_device and int(item.get("rapid_device_num") or 0) != requested_device:
        raise SystemExit(f"binding divergente {g['tag']}: Rapid Device")
    if not item.get("channels"):
        raise SystemExit(f"binding sem canais: {g['tag']}")
    print(f"OK binding {g['tag']}: line={item.get('rapid_line_num')} device={item.get('rapid_device_num')}")
PY
  then
    ok "bindings conferem com o cadastro"
  else
    fail "bindings divergentes do banco"
  fi

  while IFS=$'\t' read -r transport remote_port local_port tag; do
    [[ "$transport" == "reverse_tcp" ]] || continue
    check_port "$remote_port" "bridge reverse $tag"
    check_port "$local_port" "bridge local Rapid $tag"
  done < <(jq -r --argjson offset "$RAPID_LOCAL_OFFSET" '.[] | [.transport, (.listen_port|tostring), ((.listen_port + $offset)|tostring), (.tag // .generator_id // "gerador")] | @tsv' "$BINDINGS")
fi

# Jornada que o navegador realmente usa: sessão autenticada -> HTTPS/Nginx -> API -> inventário.
# A sessão é efêmera, criada no banco pelo próprio usuário de serviço e removida ao final.
SESSION_JSON=""
if SESSION_JSON="$(python_as_service - <<'PY'
import json
import secrets
import time
from app import db
from app.auth import token_hash
from app.config import AUTH_COOKIE_NAME

db.init_db()
users = [u for u in db.list_users() if u.get("active")]
if not users:
    raise SystemExit("nenhum usuário ativo disponível para smoke autenticado")
user = users[0]
token = secrets.token_urlsafe(48)
digest = token_hash(token)
db.create_session(digest, user["id"], int(time.time()) + 300, "127.0.0.1", "rc-vm-smoke")
print(json.dumps({
    "cookie": AUTH_COOKIE_NAME,
    "token": token,
    "hash": digest,
    "expected_generators": len(db.list_generators()),
    "user": user["email"],
}))
PY
)"; then
  SMOKE_SESSION_HASH="$(jq -r '.hash // empty' <<<"$SESSION_JSON")"
  SMOKE_COOKIE="$(jq -r '.cookie // empty' <<<"$SESSION_JSON")"
  SMOKE_TOKEN="$(jq -r '.token // empty' <<<"$SESSION_JSON")"
  EXPECTED_GENERATORS="$(jq -r '.expected_generators // -1' <<<"$SESSION_JSON")"
  SMOKE_USER="$(jq -r '.user // "?"' <<<"$SESSION_JSON")"

  if [[ -z "$SMOKE_SESSION_HASH" || -z "$SMOKE_COOKIE" || -z "$SMOKE_TOKEN" || ! "$EXPECTED_GENERATORS" =~ ^[0-9]+$ ]]; then
    fail "sessão temporária do smoke retornou payload inválido"
  else
    GEN_RESPONSE=""
    if GEN_RESPONSE="$(curl -kfsS --max-time 12 --cookie "${SMOKE_COOKIE}=${SMOKE_TOKEN}" https://127.0.0.1/api/generators 2>/tmp/rc-generators-api-smoke.err)"; then
      if jq -e 'type == "array"' >/dev/null 2>&1 <<<"$GEN_RESPONSE"; then
        API_GENERATORS="$(jq 'length' <<<"$GEN_RESPONSE")"
        if [[ "$API_GENERATORS" == "$EXPECTED_GENERATORS" ]]; then
          ok "sessão HTTPS vê $API_GENERATORS/$EXPECTED_GENERATORS gerador(es) do banco ($SMOKE_USER)"
        else
          fail "API autenticada devolveu $API_GENERATORS gerador(es), banco possui $EXPECTED_GENERATORS"
        fi
        if (( EXPECTED_GENERATORS > 0 )); then
          if jq -e 'all(.[]; (.id | type == "string" and length > 0) and (.tag | type == "string" and length > 0) and (.status | type == "string" and length > 0))' >/dev/null 2>&1 <<<"$GEN_RESPONSE"; then
            ok "payload autenticado de geradores possui id/tag/status"
          else
            fail "payload autenticado de geradores está incompleto"
          fi
        fi
      else
        fail "API autenticada /api/generators não retornou uma lista JSON"
      fi
    else
      cat /tmp/rc-generators-api-smoke.err >&2 2>/dev/null || true
      fail "jornada autenticada HTTPS /api/generators falhou"
    fi

    OPS_RESPONSE=""
    if OPS_RESPONSE="$(curl -kfsS --max-time 12 --cookie "${SMOKE_COOKIE}=${SMOKE_TOKEN}" https://127.0.0.1/api/ops/bootstrap 2>/tmp/rc-ops-api-smoke.err)"; then
      if jq -e '(.clients | type == "array") and (.sites | type == "array") and (.workOrders | type == "array") and (.agenda | type == "array") and (.rules | type == "array") and (.reports | type == "array") and (.webhooks | type == "array")' >/dev/null 2>&1 <<<"$OPS_RESPONSE"; then
        ok "bootstrap operacional autenticado responde pelo HTTPS"
      else
        fail "bootstrap operacional autenticado retornou estrutura inválida"
      fi
    else
      cat /tmp/rc-ops-api-smoke.err >&2 2>/dev/null || true
      fail "jornada autenticada HTTPS /api/ops/bootstrap falhou"
    fi
  fi
else
  fail "não foi possível criar sessão temporária para smoke autenticado"
fi
cleanup_smoke_session

if (( FAILURES > 0 )); then
  echo "============================================================"
  echo " FALHOU: $FAILURES verificação(ões)"
  echo "============================================================"
  exit 1
fi

echo "============================================================"
echo " APROVADO: VM pronta para teste de campo"
echo "============================================================"