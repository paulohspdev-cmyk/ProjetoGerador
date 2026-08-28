#!/usr/bin/env bash
set -u

BASE="/opt/rc-geradores"
ENV_FILE="/etc/rc-geradores.env"

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
echo "-- Portas TCP --"
ss -lntp 2>/dev/null | grep -E ':(80|443|3000|8090|15001|25001)\b' || true

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
  jq . /tmp/rc-geradores-health.json 2>/dev/null || cat /tmp/rc-geradores-health.json
else
  echo "API não respondeu em 127.0.0.1:8090"
fi

echo
echo "-- Banco / cadastro --"
if [[ -x "$BASE/backend/.venv/bin/python" && -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
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
  /opt/scada/ScadaComm/Config/DrvModbus_RC_IG200.xml \
  /var/lib/rc-geradores/rapid-bindings.json; do
  [[ -f "$file" ]] && echo "OK $file" || echo "AUSENTE $file"
done
if [[ -s /var/lib/rc-geradores/rapid-bindings.json ]]; then
  jq '[.[] | {tag,generator_id,transport,listen_port,modbus_unit,rapid_line_num,rapid_device_num,status}]' \
    /var/lib/rc-geradores/rapid-bindings.json 2>/dev/null || true
fi

echo
echo "-- Leitor Rapid --"
[[ -f "$BASE/.rapid-reader/RcRapidReader.dll" ]] \
  && echo "OK $BASE/.rapid-reader/RcRapidReader.dll" \
  || echo "AUSENTE $BASE/.rapid-reader/RcRapidReader.dll"

echo
echo "-- Segurança / integrações (sem exibir segredos) --"
if [[ -f "$ENV_FILE" ]]; then
  grep -E '^(RC_ENABLE_IG200_CONTROL|RC_AUTH_COOKIE_SECURE|RC_LOGIN_MAX_FAILURES|RC_LOGIN_LOCK_SECONDS|RC_BACKUP_RETENTION)=' "$ENV_FILE" || true
  grep -q '^RC_SMTP_HOST=.$' "$ENV_FILE" 2>/dev/null || true
  SMTP_HOST="$(sed -n 's/^RC_SMTP_HOST=//p' "$ENV_FILE" | head -n1)"
  WA_URL="$(sed -n 's/^RC_WHATSAPP_API_URL=//p' "$ENV_FILE" | head -n1)"
  [[ -n "$SMTP_HOST" ]] && echo "SMTP: configurado" || echo "SMTP: não configurado"
  [[ -n "$WA_URL" ]] && echo "WhatsApp: configurado" || echo "WhatsApp: não configurado"
fi

echo
echo "-- Logs recentes RC --"
for svc in rc-geradores-api rc-geradores-worker rc-geradores-provision rc-geradores-bridge; do
  echo "### $svc"
  journalctl -u "$svc" --since '-5 min' --no-pager 2>/dev/null | tail -n 20 || true
done

echo
echo "-- Communicator / Line 100 --"
for log in /var/log/scada/ScadaComm/Log/line100.txt /var/log/scada/ScadaComm/Log/line100.log; do
  [[ -f "$log" ]] && tail -n 40 "$log" || true
done

echo
echo "-- Git --"
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" status --short --branch 2>/dev/null || true
  git -C "$BASE" log -1 --oneline 2>/dev/null || true
else
  echo "$BASE não é checkout Git"
fi

echo "============================================================"
