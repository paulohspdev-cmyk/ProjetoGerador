#!/usr/bin/env bash
set -u

BASE="/opt/rc-geradores"
ENV_FILE="/etc/rc-geradores.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  BASE="${RC_PROJECT_ROOT:-$BASE}"
fi
BINDINGS="${RC_RAPID_BINDINGS:-/var/lib/rc-geradores/rapid-bindings.json}"
LOCAL_OFFSET="${RC_RAPID_LOCAL_OFFSET:-10000}"

echo "============================================================"
echo " RC GERADORES - STATUS"
echo "============================================================"
echo "Data: $(date -Is)"
echo "Host: $(hostname)"
echo "IP:   $(hostname -I 2>/dev/null | awk '{print $1}')"
echo

echo "-- Serviços RC --"
for svc in \
  rc-geradores-frontend rc-geradores-api rc-geradores-worker \
  rc-geradores-provision rc-geradores-bridge nginx; do
  printf '%-28s ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo
echo "-- Rapid SCADA --"
for svc in scadaagent6 scadaserver6 scadacomm6 scadaweb6; do
  printf '%-28s ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo
echo "-- Portas TCP base --"
ss -lntp 2>/dev/null | grep -E ':(80|443|3000|8090)\b' || true

if [[ -s "$BINDINGS" ]]; then
  echo
echo "-- Portas industriais provisionadas --"
  while IFS=$'\t' read -r tag transport remote local; do
    if [[ "$transport" == "reverse_tcp" ]]; then
      echo "### $tag reverse_tcp externo=$remote local_rapid=$local"
      ss -lntp 2>/dev/null | grep -E ":(${remote}|${local})\b" || echo "listener ausente para $tag"
    else
      echo "### $tag transporte=$transport (sem listener reverse na bridge)"
    fi
  done < <(jq -r --argjson offset "$LOCAL_OFFSET" '.[] | [(.tag // .generator_id // "gerador"), .transport, (.listen_port|tostring), ((.listen_port + $offset)|tostring)] | @tsv' "$BINDINGS" 2>/dev/null)
fi

echo
echo "-- Sockets privilegiados locais --"
for socket in /run/rc-geradores/control.sock /run/rc-geradores/provision.sock; do
  if [[ -S "$socket" ]]; then
    ls -l "$socket"
  else
    echo "AUSENTE $socket"
  fi
done

echo
echo "-- API health --"
if curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-geradores-health.json 2>/dev/null; then
  echo "API direta: OK"
  jq . /tmp/rc-geradores-health.json 2>/dev/null || cat /tmp/rc-geradores-health.json
else
  echo "API direta não respondeu em 127.0.0.1:8090"
fi
if curl -kfsS https://127.0.0.1/api/health >/tmp/rc-geradores-proxy-health.json 2>/dev/null; then
  echo "Proxy HTTPS: OK"
  jq . /tmp/rc-geradores-proxy-health.json 2>/dev/null || cat /tmp/rc-geradores-proxy-health.json
else
  echo "Proxy HTTPS não respondeu em 127.0.0.1:443"
fi
if curl -sSI http://127.0.0.1/api/health 2>/dev/null | grep -qi '^Location: https://'; then
  echo "Redirect HTTP -> HTTPS: OK"
else
  echo "Redirect HTTP -> HTTPS: FALHOU"
fi

echo
echo "-- TLS --"
if [[ -s /etc/ssl/rc-geradores/fullchain.pem && -s /etc/ssl/rc-geradores/privkey.pem ]]; then
  openssl x509 -in /etc/ssl/rc-geradores/fullchain.pem -noout -subject -issuer -dates 2>/dev/null || true
  if openssl x509 -in /etc/ssl/rc-geradores/fullchain.pem -noout -checkend 86400 >/dev/null 2>&1; then
    echo "TLS: certificado válido por mais de 24h"
  else
    echo "TLS: certificado inválido ou próximo da expiração"
  fi
else
  echo "TLS: certificado/chave ausentes"
fi

echo
echo "-- Banco / cadastro --"
if [[ -x "$BASE/backend/.venv/bin/python" && -f "$ENV_FILE" ]]; then
  PYTHONPATH="$BASE/backend" "$BASE/backend/.venv/bin/python" - <<'PY' 2>/dev/null || true
from app import db, ops_store, platform_store, transport_store
db.init_db(); ops_store.init_ops_db(); platform_store.init_platform_db(); transport_store.init_transport_db()
print(f"Usuários: {db.count_users()} / administradores ativos: {db.count_active_admins()}")
for g in db.list_generators():
    print(
        f"{g['tag']}: {g['controller_type']} {g['controller_model']} | "
        f"{g['transport']} host={g.get('host') or '-'} porta={g['listen_port']} "
        f"unit={g['modbus_unit']} rapid={g.get('rapid_device_num')} enabled={g['enabled']}"
    )
PY
else
  echo "Backend/ambiente ainda não instalado."
fi

echo
echo "-- Rapid / bindings --"
for file in \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  "$BINDINGS"; do
  [[ -f "$file" ]] && echo "OK $file" || echo "AUSENTE $file"
done
if [[ -s "$BINDINGS" ]]; then
  jq '[.[] | {tag,generator_id,transport,host,listen_port,modbus_unit,rapid_line_num,rapid_device_num,status}]' \
    "$BINDINGS" 2>/dev/null || true
fi

echo
echo "-- Leitor Rapid --"
[[ -f "$BASE/.rapid-reader/RcRapidReader.dll" ]] \
  && echo "OK $BASE/.rapid-reader/RcRapidReader.dll" \
  || echo "AUSENTE $BASE/.rapid-reader/RcRapidReader.dll"

echo
echo "-- Segurança / integrações (sem exibir segredos) --"
if [[ -f "$ENV_FILE" ]]; then
  grep -E '^(RC_ENABLE_IG200_CONTROL|RC_AUTH_COOKIE_SECURE|RC_LOGIN_MAX_FAILURES|RC_LOGIN_LOCK_SECONDS|RC_BACKUP_RETENTION|RC_BACKUP_INCLUDE_SECRETS)=' "$ENV_FILE" || true
  SMTP_HOST_VALUE="$(sed -n 's/^RC_SMTP_HOST=//p' "$ENV_FILE" | head -n1)"
  WA_URL="$(sed -n 's/^RC_WHATSAPP_API_URL=//p' "$ENV_FILE" | head -n1)"
  [[ -n "$SMTP_HOST_VALUE" ]] && echo "SMTP: configurado" || echo "SMTP: não configurado"
  [[ -n "$WA_URL" ]] && echo "WhatsApp: configurado" || echo "WhatsApp: não configurado"
fi

echo
echo "-- Logs recentes RC --"
for svc in rc-geradores-api rc-geradores-worker rc-geradores-provision rc-geradores-bridge; do
  echo "### $svc"
  journalctl -u "$svc" --since '-5 min' --no-pager 2>/dev/null | tail -n 20 || true
done

echo
echo "-- Communicator / linhas provisionadas --"
if [[ -s "$BINDINGS" ]]; then
  while read -r line; do
    [[ "$line" =~ ^[0-9]+$ ]] || continue
    found=0
    for log in "/var/log/scada/ScadaComm/Log/line${line}.txt" "/var/log/scada/ScadaComm/Log/line${line}.log"; do
      if [[ -f "$log" ]]; then
        echo "### $log"
        tail -n 40 "$log"
        found=1
      fi
    done
    (( found == 1 )) || echo "Sem log local encontrado para Line $line"
  done < <(jq -r '.[].rapid_line_num' "$BINDINGS" 2>/dev/null | sort -nu)
else
  echo "Nenhuma linha RC provisionada em runtime."
fi

echo
echo "-- Git --"
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" status --short --branch 2>/dev/null || true
  git -C "$BASE" log -1 --oneline 2>/dev/null || true
else
  echo "$BASE não é checkout Git"
fi

echo
echo "Smoke completo: sudo $BASE/ops/vm-smoke.sh"
echo "============================================================"
