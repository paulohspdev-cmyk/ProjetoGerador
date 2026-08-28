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
for svc in rc-geradores-frontend rc-geradores-api rc-geradores-bridge nginx; do
  printf '%-26s ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo
echo "-- Rapid SCADA --"
for svc in scadaagent6 scadaserver6 scadacomm6 scadaweb6; do
  printf '%-26s ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo
echo "-- Portas --"
ss -lntp 2>/dev/null | grep -E ':(80|3000|8090|15001|25001)\b' || true

echo
echo "-- API pública --"
if curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-geradores-health.json 2>/dev/null; then
  jq . /tmp/rc-geradores-health.json 2>/dev/null || cat /tmp/rc-geradores-health.json
else
  echo "API não respondeu em 127.0.0.1:8090"
fi

echo
echo "-- Banco / cadastro local --"
if [[ -x "$BASE/backend/.venv/bin/python" && -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  PYTHONPATH="$BASE/backend" "$BASE/backend/.venv/bin/python" - <<'PY' 2>/dev/null || true
from app import db
print(f"Usuários: {db.count_users()} / administradores ativos: {db.count_active_admins()}")
for g in db.list_generators():
    print(
        f"{g['tag']}: {g['controller_type']} {g['controller_model']} | "
        f"{g['transport']} porta={g['listen_port']} unit={g['modbus_unit']} "
        f"rapid={g.get('rapid_device_num')} enabled={g['enabled']}"
    )
PY
else
  echo "Backend/ambiente ainda não instalado."
fi

echo
echo "-- Rapid provisionado --"
for file in \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  /opt/scada/ScadaComm/Config/DrvModbus_RC_IG200.xml; do
  [[ -f "$file" ]] && echo "OK $file" || echo "AUSENTE $file"
done
if [[ -f /opt/scada/ScadaComm/Config/ScadaCommConfig.xml ]]; then
  grep -E 'number="(100|200)"|RC Geradores - IG200|TcpPort' /opt/scada/ScadaComm/Config/ScadaCommConfig.xml | tail -n 20 || true
fi

echo
echo "-- Leitor Rapid --"
if [[ -f "$BASE/.rapid-reader/RcRapidReader.dll" ]]; then
  echo "OK $BASE/.rapid-reader/RcRapidReader.dll"
else
  echo "AUSENTE $BASE/.rapid-reader/RcRapidReader.dll"
fi

echo
echo "-- Bridge / controle --"
if [[ -S /run/rc-geradores/control.sock ]]; then
  ls -l /run/rc-geradores/control.sock
else
  echo "socket /run/rc-geradores/control.sock ausente"
fi
if [[ -f "$ENV_FILE" ]]; then
  grep '^RC_ENABLE_IG200_CONTROL=' "$ENV_FILE" || true
fi

echo
echo "-- Últimos logs da bridge --"
journalctl -u rc-geradores-bridge --since '-10 min' --no-pager 2>/dev/null | tail -n 60 || true

echo
echo "-- Últimos logs do Communicator / Line 100 --"
if [[ -f /var/log/scada/ScadaComm/Log/line100.txt ]]; then
  tail -n 40 /var/log/scada/ScadaComm/Log/line100.txt || true
fi
if [[ -f /var/log/scada/ScadaComm/Log/line100.log ]]; then
  tail -n 60 /var/log/scada/ScadaComm/Log/line100.log || true
fi

echo
echo "-- Git --"
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" status --short --branch 2>/dev/null || true
  git -C "$BASE" log -1 --oneline 2>/dev/null || true
else
  echo "$BASE não é checkout Git"
fi

echo "============================================================"
