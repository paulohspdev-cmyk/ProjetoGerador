#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/rc-geradores"
REPO="https://github.com/paulohspdev-cmyk/ProjetoGerador.git"
ENV_FILE="/etc/rc-geradores.env"
MIGRATE_OLD=0
ACTIVATE_BRIDGE=0
FORCE_CUTOVER=0

usage() {
  cat <<'EOF'
Uso: sudo bash ops/install.sh [opções]

  --migrate-old-db      importa somente o cadastro de /var/lib/rc-scada/scada.db
  --activate-bridge     ativa a nova bridge reversa
  --force-cutover       permite desligar a bridge antiga antes de ativar a nova

Sem --activate-bridge, a bridge nova é instalada mas permanece desligada.
Isto permite testar o novo frontend/backend na mesma VM sem tocar na aquisição atual.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrate-old-db) MIGRATE_OLD=1 ;;
    --activate-bridge) ACTIVATE_BRIDGE=1 ;;
    --force-cutover) FORCE_CUTOVER=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1"; usage; exit 2 ;;
  esac
  shift
done

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root: sudo bash $0"
  exit 1
fi

echo "== RC Geradores / ProjetoGerador =="
echo "Frontend novo + API + Rapid SCADA"
echo

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl ca-certificates nginx python3 python3-venv python3-pip jq unzip

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
fi
if (( NODE_MAJOR < 20 )); then
  echo "Instalando Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

if ! command -v dotnet >/dev/null 2>&1; then
  echo "Tentando instalar .NET SDK 8 para o leitor Rapid SCADA..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y dotnet-sdk-8.0 || true
fi

if [[ -d "$BASE/.git" ]]; then
  echo "Atualizando $BASE..."
  git -C "$BASE" fetch origin main
  git -C "$BASE" checkout main
  git -C "$BASE" pull --ff-only origin main
else
  echo "Clonando ProjetoGerador..."
  rm -rf "$BASE"
  git clone "$REPO" "$BASE"
fi

if ! id rcgeradores >/dev/null 2>&1; then
  useradd --system --home "$BASE" --shell /usr/sbin/nologin rcgeradores
fi

mkdir -p /var/lib/rc-geradores /var/log/rc-geradores
chown -R rcgeradores:rcgeradores /var/lib/rc-geradores /var/log/rc-geradores

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$BASE/ops/rc-geradores.env.example" "$ENV_FILE"
else
  echo "Mantendo configuração existente em $ENV_FILE"
fi
chmod 640 "$ENV_FILE"
chown root:rcgeradores "$ENV_FILE"

echo "Preparando backend Python..."
python3 -m venv "$BASE/backend/.venv"
"$BASE/backend/.venv/bin/pip" install --upgrade pip
"$BASE/backend/.venv/bin/pip" install -r "$BASE/backend/requirements.txt"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PYTHONPATH="$BASE/backend" "$BASE/backend/.venv/bin/python" - <<'PY'
from app import db
db.init_db()
print("Banco RC Geradores inicializado.")
PY
chown -R rcgeradores:rcgeradores /var/lib/rc-geradores

if (( MIGRATE_OLD == 1 )); then
  if [[ -f /var/lib/rc-scada/scada.db ]]; then
    echo "Importando cadastro antigo em modo somente leitura..."
    PYTHONPATH="$BASE/backend" "$BASE/backend/.venv/bin/python" \
      "$BASE/ops/migrate_old_db.py" --source /var/lib/rc-scada/scada.db
    chown -R rcgeradores:rcgeradores /var/lib/rc-geradores
  else
    echo "AVISO: /var/lib/rc-scada/scada.db não existe; migração ignorada."
  fi
fi

echo "Compilando leitor oficial do Rapid SCADA Server..."
SCADA_COMMON="$(find /opt/scada -type f -name ScadaCommon.dll -print -quit 2>/dev/null || true)"
if [[ -n "$SCADA_COMMON" && -f "$SCADA_COMMON" && -x "$(command -v dotnet 2>/dev/null || true)" ]]; then
  OUT="$BASE/.rapid-reader"
  rm -rf "$OUT"
  mkdir -p "$OUT"
  dotnet build "$BASE/rapid/reader/RcRapidReader.csproj" \
    -c Release -o "$OUT" -p:ScadaCommonPath="$SCADA_COMMON" --nologo
  SCADA_DLL_DIR="$(dirname "$SCADA_COMMON")"
  find "$SCADA_DLL_DIR" -maxdepth 1 -type f -name 'Scada*.dll' \
    -exec cp --update=none {} "$OUT/" \; 2>/dev/null || true
  chmod -R a+rX "$OUT"
else
  echo "AVISO: ScadaCommon.dll ou dotnet não encontrado. A API funcionará, mas sem telemetria Rapid até o reader ser compilado."
fi

echo "Instalando dependências e compilando frontend para Node VM..."
cd "$BASE"
npm ci
NITRO_PRESET=node-server npm run build
test -f "$BASE/.output/server/index.mjs"

echo "Instalando systemd..."
cp "$BASE/ops/systemd/rc-geradores-api.service" /etc/systemd/system/
cp "$BASE/ops/systemd/rc-geradores-frontend.service" /etc/systemd/system/
cp "$BASE/ops/systemd/rc-geradores-bridge.service" /etc/systemd/system/
systemctl daemon-reload

systemctl enable rc-geradores-api.service rc-geradores-frontend.service
systemctl restart rc-geradores-api.service
systemctl restart rc-geradores-frontend.service

# Por padrão não concorre com a bridge antiga já homologada.
systemctl disable rc-geradores-bridge.service >/dev/null 2>&1 || true
if (( ACTIVATE_BRIDGE == 1 )); then
  if systemctl is-active --quiet rc-scada-rapid-bridge.service; then
    if (( FORCE_CUTOVER == 0 )); then
      echo "ERRO: rc-scada-rapid-bridge.service está ativa."
      echo "A nova bridge NÃO será ativada para evitar conflito de portas."
      echo "Use --force-cutover somente quando quiser trocar deliberadamente a bridge."
      exit 4
    fi
    echo "Cutover solicitado: parando bridge antiga..."
    systemctl disable --now rc-scada-rapid-bridge.service
  fi
  systemctl enable --now rc-geradores-bridge.service
else
  systemctl stop rc-geradores-bridge.service >/dev/null 2>&1 || true
fi

echo "Configurando Nginx..."
cp "$BASE/ops/nginx/rc-geradores.conf" /etc/nginx/sites-available/rc-geradores
ln -sfn /etc/nginx/sites-available/rc-geradores /etc/nginx/sites-enabled/rc-geradores
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/rc-scada
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "Validando serviços..."
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-health.json 2>/dev/null; then
    break
  fi
  sleep 0.5
done
cat /tmp/rc-health.json 2>/dev/null | jq . || true
curl -fsS http://127.0.0.1:3000/ >/dev/null
curl -fsS http://127.0.0.1/api/health >/dev/null

IP="$(hostname -I | awk '{print $1}')"
echo
echo "============================================================"
echo " RC GERADORES INSTALADO PARA TESTE"
echo "============================================================"
echo " Interface:       http://${IP:-IP_DA_VM}/"
echo " API local:       http://127.0.0.1:8090/api/health"
echo " API docs:        http://${IP:-IP_DA_VM}/api/docs"
echo " Banco produto:   /var/lib/rc-geradores/rc-geradores.db"
echo " Rapid SCADA:     /opt/scada"
echo " Frontend:        rc-geradores-frontend"
echo " API:             rc-geradores-api"
if systemctl is-active --quiet rc-geradores-bridge.service; then
  echo " Bridge nova:     ATIVA"
else
  echo " Bridge nova:     DESLIGADA (seguro para coexistir com o sistema anterior)"
fi
echo "============================================================"
