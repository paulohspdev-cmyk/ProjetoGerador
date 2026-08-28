#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/rc-geradores"
REPO="https://github.com/paulohspdev-cmyk/ProjetoGerador.git"
ENV_FILE="/etc/rc-geradores.env"
RAPID_VERSION="6.4.7"
RAPID_URL="https://rapidscada.org/download/rapidscada_${RAPID_VERSION}_linux_en.zip"
TMP="/tmp/rc-geradores-install"
ENABLE_CONTROL=0
SKIP_INITIAL_GENERATOR=0
ADMIN_EMAIL="admin@rcgeradores.local"
ADMIN_NAME="Administrador"
ADMIN_PASSWORD_FILE=""
IG200_TAG="GEN001"
IG200_NAME="Gerador 01"
IG200_SITE="Principal"
IG200_PORT=15001
IG200_UNIT=2
IG200_DEVICE=200
INITIAL_GENERATOR_ID=""
INITIAL_LOCAL_PORT=""

usage() {
  cat <<'EOF'
Uso: sudo bash ops/install.sh [opções]

Opções:
  --enable-control              habilita START/STOP homologado da ComAp InteliGen 200
  --admin-email EMAIL           e-mail do primeiro administrador
  --admin-name NOME             nome do primeiro administrador
  --admin-password-file ARQ     arquivo chmod 600 com a senha inicial (automação segura)
  --skip-initial-generator      instala a plataforma sem cadastrar/provisionar gerador
  --ig200-tag TAG               tag do primeiro IG200 (padrão GEN001)
  --ig200-name NOME             nome do primeiro IG200
  --ig200-site SITE             site do primeiro IG200
  --ig200-port PORTA            porta TCP reversa externa (padrão 15001)
  --ig200-unit UNIT             Modbus Unit ID (padrão 2)
  --ig200-device DEVICE         Rapid Device (padrão 200)
  -h, --help                    mostra esta ajuda

Instala em VM Ubuntu limpa:
  Rapid SCADA 6.4.7
  bridge reverse TCP somente leitura para o Rapid
  API FastAPI + frontend TanStack + worker + provisionador privilegiado
  SQLite do produto + login/RBAC + relatórios/backups/notificações
  Nginx na porta 80

Por padrão cadastra e provisiona um ComAp InteliGen 200 com os parâmetros acima.
Use --skip-initial-generator para instalar a plataforma vazia e cadastrar depois pelo painel.

A senha inicial é solicitada no terminal e nunca é persistida em texto claro.
Para automação, --admin-password-file lê a senha de arquivo proprietário chmod 600.
SMTP, WhatsApp e HTTPS permanecem desabilitados até receberem configuração real.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enable-control) ENABLE_CONTROL=1; shift ;;
    --admin-email) ADMIN_EMAIL="${2:?Informe o e-mail}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:?Informe o nome}"; shift 2 ;;
    --admin-password-file) ADMIN_PASSWORD_FILE="${2:?Informe o arquivo}"; shift 2 ;;
    --skip-initial-generator) SKIP_INITIAL_GENERATOR=1; shift ;;
    --ig200-tag) IG200_TAG="${2:?Informe a tag}"; shift 2 ;;
    --ig200-name) IG200_NAME="${2:?Informe o nome}"; shift 2 ;;
    --ig200-site) IG200_SITE="${2:?Informe o site}"; shift 2 ;;
    --ig200-port) IG200_PORT="${2:?Informe a porta}"; shift 2 ;;
    --ig200-unit) IG200_UNIT="${2:?Informe o Unit ID}"; shift 2 ;;
    --ig200-device) IG200_DEVICE="${2:?Informe o Rapid Device}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1"; usage; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root: sudo bash $0"
  exit 1
fi

validate_range() {
  local label="$1" value="$2" min="$3" max="$4"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value < min || value > max )); then
    echo "ERRO: $label deve estar entre $min e $max (recebido: $value)" >&2
    exit 2
  fi
}

validate_range "porta IG200" "$IG200_PORT" 1 65535
validate_range "Modbus Unit ID" "$IG200_UNIT" 1 247
validate_range "Rapid Device" "$IG200_DEVICE" 1 2147483647

if [[ -n "$ADMIN_PASSWORD_FILE" ]]; then
  [[ -f "$ADMIN_PASSWORD_FILE" && -r "$ADMIN_PASSWORD_FILE" ]] || {
    echo "ERRO: arquivo de senha não encontrado/legível: $ADMIN_PASSWORD_FILE" >&2
    exit 2
  }
fi

export DEBIAN_FRONTEND=noninteractive
VM_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo "============================================================"
echo " RC GERADORES - INSTALAÇÃO LIMPA DE PRODUÇÃO"
echo "============================================================"
echo "Rapid SCADA -> API -> painel; bridge apenas para reverse TCP"
echo

echo "[1/15] Dependências do sistema..."
apt-get update
apt-get install -y \
  git curl ca-certificates unzip nginx jq openssl sudo iproute2 \
  python3 python3-venv python3-pip build-essential

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
fi
if (( NODE_MAJOR < 22 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
fi

DOTNET8_SDK=0
DOTNET8_RUNTIME=0
if command -v dotnet >/dev/null 2>&1; then
  dotnet --list-sdks 2>/dev/null | grep -q '^8\.' && DOTNET8_SDK=1 || true
  dotnet --list-runtimes 2>/dev/null | grep -q '^Microsoft.NETCore.App 8\.' && DOTNET8_RUNTIME=1 || true
fi
if (( DOTNET8_SDK == 0 || DOTNET8_RUNTIME == 0 )); then
  if ! apt-get install -y dotnet-sdk-8.0; then
    . /etc/os-release
    curl -fsSL "https://packages.microsoft.com/config/ubuntu/${VERSION_ID}/packages-microsoft-prod.deb" \
      -o /tmp/packages-microsoft-prod.deb
    dpkg -i /tmp/packages-microsoft-prod.deb
    apt-get update
    apt-get install -y dotnet-sdk-8.0
  fi
fi

node --version
npm --version
dotnet --version
python3 --version

dotnet --list-sdks | grep -q '^8\.' || { echo "ERRO: .NET SDK 8 não ficou disponível." >&2; exit 3; }
dotnet --list-runtimes | grep -q '^Microsoft.NETCore.App 8\.' || { echo "ERRO: .NET Runtime 8 não ficou disponível." >&2; exit 3; }

echo "[2/15] Instalando/validando Rapid SCADA ${RAPID_VERSION}..."
if [[ ! -f /opt/scada/ScadaComm/Config/ScadaCommConfig.xml || ! -f /opt/scada/BaseDAT/cnl.dat ]]; then
  rm -rf "$TMP"
  mkdir -p "$TMP/pkg"
  curl -fL "$RAPID_URL" -o "$TMP/rapidscada.zip"
  unzip -tq "$TMP/rapidscada.zip"
  unzip -q "$TMP/rapidscada.zip" -d "$TMP/pkg"
  DEB="$(find "$TMP/pkg" -type f -name 'rapidscada_*_all.deb' | head -n1 || true)"
  if [[ -n "$DEB" ]]; then
    dpkg -i "$DEB" || { apt-get -f install -y; dpkg -i "$DEB"; }
  else
    SCADA_DIR="$(find "$TMP/pkg" -type d -name scada | head -n1 || true)"
    DAEMONS_DIR="$(find "$TMP/pkg" -type d -name daemons | head -n1 || true)"
    [[ -n "$SCADA_DIR" && -n "$DAEMONS_DIR" ]] || {
      echo "ERRO: pacote Rapid SCADA com estrutura inesperada."
      exit 3
    }
    mkdir -p /opt/scada
    cp -a "$SCADA_DIR"/. /opt/scada/
    chmod +x /opt/scada/make_executable.sh
    /opt/scada/make_executable.sh
    cp -a "$DAEMONS_DIR"/. /etc/systemd/system/
  fi
else
  echo "Rapid SCADA já encontrado; preservando a instalação."
fi

for file in \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat; do
  [[ -f "$file" ]] || { echo "ERRO: Rapid SCADA incompleto: $file"; exit 3; }
done
systemctl daemon-reload

echo "[3/15] Baixando/atualizando ProjetoGerador..."
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" fetch origin main
  git -C "$BASE" checkout main
  git -C "$BASE" pull --ff-only origin main
else
  rm -rf "$BASE"
  git clone --branch main --single-branch "$REPO" "$BASE"
fi

test -f "$BASE/package.json"
test -f "$BASE/backend/requirements.txt"
test -f "$BASE/controllers/production/comap/inteligen-200/manifest.json"

if ! id rcgeradores >/dev/null 2>&1; then
  useradd --system --home "$BASE" --shell /usr/sbin/nologin rcgeradores
fi
install -d -m 0750 -o rcgeradores -g rcgeradores \
  /var/lib/rc-geradores \
  /var/lib/rc-geradores/backups \
  /var/lib/rc-geradores/reports \
  /var/lib/rc-geradores/rapid-provision \
  /var/log/rc-geradores
install -d -m 0770 -o root -g rcgeradores /run/rc-geradores

chmod +x \
  "$BASE/ops/install.sh" "$BASE/ops/status.sh" "$BASE/ops/vm-smoke.sh" \
  "$BASE/ops/bootstrap_admin.py" "$BASE/ops/bootstrap_ig200.py" \
  "$BASE/rapid/provisioning/provision_ig200.sh" \
  "$BASE/rapid/provisioning/provision_generator.py" \
  "$BASE/rapid/provisioning/rapid_dat.py"

echo "[4/15] Configuração do ambiente..."
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$BASE/ops/rc-geradores.env.example" "$ENV_FILE"
fi

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

set_env RC_PROJECT_ROOT "$BASE"
set_env RC_ADMIN_NAME "$ADMIN_NAME"
set_env RC_ADMIN_EMAIL "$ADMIN_EMAIL"
set_env RC_ADMIN_PASSWORD ""
set_env RC_ENABLE_IG200_CONTROL "$ENABLE_CONTROL"
set_env RC_RAPID_BINDINGS "/var/lib/rc-geradores/rapid-bindings.json"
set_env RC_PROVISION_SOCKET "/run/rc-geradores/provision.sock"
if [[ -n "$VM_IP" ]]; then
  set_env RC_CORS_ORIGINS "http://localhost,http://127.0.0.1,http://${VM_IP}"
  set_env RC_PUBLIC_BASE_URL "http://${VM_IP}"
fi
chmod 640 "$ENV_FILE"
chown root:rcgeradores "$ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "[5/15] Backend, migrations e banco do produto..."
python3 -m venv "$BASE/backend/.venv"
"$BASE/backend/.venv/bin/pip" install --upgrade pip
"$BASE/backend/.venv/bin/pip" install -r "$BASE/backend/requirements.txt"

export PYTHONPATH="$BASE/backend"
"$BASE/backend/.venv/bin/python" - <<'PY'
from app import db, ops_store, platform_store, transport_store
db.init_db()
ops_store.init_ops_db()
platform_store.init_platform_db()
transport_store.init_transport_db()
print("Banco/migrations RC Geradores: OK")
PY

echo
echo "Primeiro acesso ao RC Geradores"
ADMIN_ARGS=(--name "$ADMIN_NAME" --email "$ADMIN_EMAIL")
if [[ -n "$ADMIN_PASSWORD_FILE" ]]; then
  ADMIN_ARGS+=(--password-file "$ADMIN_PASSWORD_FILE")
fi
"$BASE/backend/.venv/bin/python" "$BASE/ops/bootstrap_admin.py" "${ADMIN_ARGS[@]}"

if (( SKIP_INITIAL_GENERATOR == 0 )); then
  "$BASE/backend/.venv/bin/python" "$BASE/ops/bootstrap_ig200.py" \
    --tag "$IG200_TAG" --name "$IG200_NAME" --site "$IG200_SITE" \
    --port "$IG200_PORT" --unit "$IG200_UNIT" --rapid-device "$IG200_DEVICE"

  read -r INITIAL_GENERATOR_ID IG200_TAG IG200_PORT IG200_UNIT IG200_DEVICE < <(
    "$BASE/backend/.venv/bin/python" - "$IG200_TAG" <<'PY'
import sys
from app import db
g = db.get_generator(sys.argv[1])
if not g:
    raise SystemExit(f"gerador {sys.argv[1]} não encontrado após bootstrap")
print(g['id'], g['tag'], g['listen_port'], g['modbus_unit'], g.get('rapid_device_num') or 0)
PY
  )
  INITIAL_LOCAL_PORT=$((IG200_PORT + ${RC_RAPID_LOCAL_OFFSET:-10000}))
fi

echo "[6/15] Provisionamento industrial inicial..."
if (( SKIP_INITIAL_GENERATOR == 0 )); then
  "$BASE/backend/.venv/bin/python" "$BASE/rapid/provisioning/provision_generator.py" \
    "$INITIAL_GENERATOR_ID" --no-restart
else
  echo "Plataforma vazia solicitada; nenhum gerador foi provisionado no Rapid SCADA."
fi
chown -R rcgeradores:rcgeradores /var/lib/rc-geradores /var/log/rc-geradores

echo "[7/15] Compilando leitor oficial do Rapid SCADA Server..."
SCADA_COMMON="$(find /opt/scada -type f -name ScadaCommon.dll -print -quit 2>/dev/null || true)"
[[ -n "$SCADA_COMMON" && -f "$SCADA_COMMON" ]] || {
  echo "ERRO: ScadaCommon.dll não encontrado."
  exit 4
}
OUT="$BASE/.rapid-reader"
rm -rf "$OUT"
mkdir -p "$OUT"
dotnet build "$BASE/rapid/reader/RcRapidReader.csproj" \
  -c Release -o "$OUT" -p:ScadaCommonPath="$SCADA_COMMON" --nologo
SCADA_DLL_DIR="$(dirname "$SCADA_COMMON")"
find "$SCADA_DLL_DIR" -maxdepth 1 -type f -name 'Scada*.dll' \
  -exec cp --update=none {} "$OUT/" \; 2>/dev/null || true
chmod -R a+rX "$OUT"

echo "[8/15] Compilando frontend para Linux/Node..."
cd "$BASE"
npm ci
NITRO_PRESET=node-server npm run build
test -f "$BASE/.output/server/index.mjs"

echo "[9/15] Instalando serviços systemd RC..."
for unit in \
  rc-geradores-api.service \
  rc-geradores-frontend.service \
  rc-geradores-bridge.service \
  rc-geradores-worker.service \
  rc-geradores-provision.service; do
  cp "$BASE/ops/systemd/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload

# A bridge sobe antes do Communicator. Quando existem bindings reverse_tcp,
# isso garante que as portas locais já estejam disponíveis no primeiro polling.
systemctl enable rc-geradores-bridge.service >/dev/null
systemctl restart rc-geradores-bridge.service

for svc in scadaagent6.service scadaserver6.service scadacomm6.service scadaweb6.service; do
  if systemctl list-unit-files "$svc" --no-legend 2>/dev/null | grep -q "$svc"; then
    systemctl enable "$svc" >/dev/null || true
  fi
done
systemctl restart scadaagent6.service 2>/dev/null || true
systemctl restart scadaserver6.service
sleep 2
systemctl restart scadacomm6.service
systemctl restart scadaweb6.service 2>/dev/null || true

# Provisionador é root restrito por socket; API e worker continuam sem root.
systemctl enable rc-geradores-provision.service rc-geradores-api.service \
  rc-geradores-worker.service rc-geradores-frontend.service >/dev/null
systemctl restart rc-geradores-provision.service
systemctl restart rc-geradores-api.service
systemctl restart rc-geradores-worker.service
systemctl restart rc-geradores-frontend.service

echo "[10/15] Configurando Nginx..."
cp "$BASE/ops/nginx/rc-geradores.conf" /etc/nginx/sites-available/rc-geradores
ln -sfn /etc/nginx/sites-available/rc-geradores /etc/nginx/sites-enabled/rc-geradores
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/rc-scada
nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx

echo "[11/15] Validando API, frontend e proxy..."
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-health.json 2>/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:8090/api/health | jq .
curl -fsS http://127.0.0.1:3000/ >/dev/null
curl -fsS http://127.0.0.1/api/health | jq .

echo "[12/15] Validando serviços e sockets..."
for svc in \
  rc-geradores-bridge \
  rc-geradores-provision \
  rc-geradores-api \
  rc-geradores-worker \
  rc-geradores-frontend \
  scadaserver6 scadacomm6 nginx; do
  if ! systemctl is-active --quiet "$svc"; then
    echo "ERRO: serviço $svc não está ativo."
    systemctl --no-pager --full status "$svc" || true
    exit 5
  fi
done
[[ -S /run/rc-geradores/control.sock ]] || {
  echo "ERRO: socket de controle local não foi criado."
  exit 5
}
[[ -S /run/rc-geradores/provision.sock ]] || {
  echo "ERRO: socket do provisionador não foi criado."
  exit 5
}

echo "[13/15] Validando BaseDAT e runtime bindings..."
python3 "$BASE/rapid/provisioning/rapid_dat.py" check \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat

if (( SKIP_INITIAL_GENERATOR == 0 )); then
  test -s "${RC_RAPID_BINDINGS:-/var/lib/rc-geradores/rapid-bindings.json}"
  BINDING_JSON="$(jq -c --arg id "$INITIAL_GENERATOR_ID" 'map(select(.generator_id == $id)) | if length == 1 then .[0] else empty end' "${RC_RAPID_BINDINGS:-/var/lib/rc-geradores/rapid-bindings.json}")"
  [[ -n "$BINDING_JSON" ]] || { echo "ERRO: binding do $IG200_TAG não encontrado." >&2; exit 5; }
  RAPID_LINE="$(jq -r '.rapid_line_num' <<<"$BINDING_JSON")"
  RAPID_DEVICE="$(jq -r '.rapid_device_num' <<<"$BINDING_JSON")"
  python3 - /opt/scada/ScadaComm/Config/ScadaCommConfig.xml "$RAPID_LINE" "$RAPID_DEVICE" <<'PY'
import sys
import xml.etree.ElementTree as ET
cfg, line_num, device_num = sys.argv[1], sys.argv[2], sys.argv[3]
root = ET.parse(cfg).getroot()
line = next((x for x in root.findall('./Lines/Line') if x.get('number') == line_num), None)
if line is None:
    raise SystemExit(f'Line {line_num} não encontrada no Communicator')
device = next((x for x in line.findall('./DevicePolling/Device') if x.get('number') == device_num), None)
if device is None:
    raise SystemExit(f'Device {device_num} não encontrado na Line {line_num}')
print(f'Rapid materializado: Line {line_num} / Device {device_num}')
PY
fi

echo "[14/15] Smoke test completo da VM..."
if (( SKIP_INITIAL_GENERATOR == 0 )); then
  "$BASE/ops/vm-smoke.sh" --require-generator
else
  "$BASE/ops/vm-smoke.sh"
fi
"$BASE/ops/status.sh" || true

echo "[15/15] Instalação concluída."
IP="${VM_IP:-$(hostname -I | awk '{print $1}')}"
echo
echo "============================================================"
echo " RC GERADORES INSTALADO"
echo "============================================================"
echo " Interface:       http://${IP:-IP_DA_VM}/"
echo " Usuário inicial: $ADMIN_EMAIL"
echo " API health:      http://${IP:-IP_DA_VM}/api/health"
echo " Banco:           /var/lib/rc-geradores/rc-geradores.db"
echo " Rapid SCADA:     /opt/scada"
if (( SKIP_INITIAL_GENERATOR == 0 )); then
  echo " IG200 inicial:   ${IG200_TAG} / TCP ${IG200_PORT} / Unit ${IG200_UNIT} / Device ${IG200_DEVICE}"
  echo " Bridge Rapid:    127.0.0.1:${INITIAL_LOCAL_PORT}"
else
  echo " Gerador inicial: não criado (--skip-initial-generator)"
fi
echo " Worker:          ativo"
echo " Provisionador:   ativo (socket local privilegiado)"
echo " SMTP/WhatsApp:   desabilitados até configurar credenciais reais"
echo " HTTPS:           configure certificado real antes de acesso público"
if (( ENABLE_CONTROL == 1 )); then
  echo " START/STOP:      HABILITADO somente para IG200 homologado"
else
  echo " START/STOP:      DESABILITADO por padrão"
fi
echo
echo " Diagnóstico: sudo $BASE/ops/status.sh"
echo " Smoke test:  sudo $BASE/ops/vm-smoke.sh"
echo "============================================================"
