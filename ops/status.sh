#!/usr/bin/env bash
set -u

BASE="/opt/rc-geradores"

echo "== RC Geradores =="
echo "Data: $(date -Is)"
echo "Host: $(hostname)"
echo

echo "-- Serviços RC novos --"
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
echo "-- Sistema anterior (referência/coexistência) --"
for svc in rc-scada-rapid-bridge rc-scada-web; do
  printf '%-26s ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo
echo "-- Portas --"
ss -lntp 2>/dev/null | grep -E ':(80|3000|8090|150[0-9][0-9]|250[0-9][0-9])\b' || true

echo
echo "-- API --"
if curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-geradores-health.json 2>/dev/null; then
  jq . /tmp/rc-geradores-health.json 2>/dev/null || cat /tmp/rc-geradores-health.json
else
  echo "API não respondeu em 127.0.0.1:8090"
fi

echo
echo "-- Geradores normalizados --"
if curl -fsS http://127.0.0.1:8090/api/generators >/tmp/rc-geradores-list.json 2>/dev/null; then
  jq '[.[] | {tag,controller,site,status,mode,rpm,frequency,telemetrySource,rapidDeviceNum,lastError}]' /tmp/rc-geradores-list.json 2>/dev/null || cat /tmp/rc-geradores-list.json
else
  echo "Não foi possível consultar /api/generators"
fi

echo
echo "-- Bridge nova / socket de controle --"
if [[ -S /run/rc-geradores/control.sock ]]; then
  ls -l /run/rc-geradores/control.sock
else
  echo "socket /run/rc-geradores/control.sock ausente"
fi

echo
echo "-- Git --"
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" status --short --branch 2>/dev/null || true
  git -C "$BASE" log -1 --oneline 2>/dev/null || true
else
  echo "$BASE não é checkout Git"
fi
