#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/rc-geradores"
REPO="https://github.com/paulohspdev-cmyk/ProjetoGerador.git"
ENV_FILE="/etc/rc-geradores.env"
RAPID_VERSION="6.4.7"
RAPID_URL="https://rapidscada.org/download/rapidscada_${RAPID_VERSION}_linux_en.zip"
TMP="/tmp/rc-geradores-install"
ENABLE_CONTROL=0
ADMIN_EMAIL="admin@rcgeradores.local"
ADMIN_NAME="Administrador"
IG200_TAG="GEN001"
IG200_NAME="Gerador 01"
IG200_SITE="Principal"

usage() {
  cat <<'EOF'
Uso: sudo bash ops/install.sh [opções]

Opções:
  --enable-control          habilita START/STOP homologado da ComAp InteliGen 200
  --admin-email EMAIL       e-mail do primeiro administrador
  --admin-name NOME         nome do primeiro administrador
  --ig200-tag TAG           tag do primeiro IG200 (padrão GEN001)
  --ig200-name NOME         nome do primeiro IG200
  --ig200-site SITE         site do primeiro IG200
  -h, --help                mostra esta ajuda

Instala em VM limpa:
  Rapid SCADA 6.4.7 + Line 100/Device 200/canais 2001..2008
  RC Reverse TCP Bridge + API FastAPI + frontend + Nginx
  banco do produto + primeiro administrador + cadastro IG200 homologado

A senha inicial do administrador é solicitada de forma interativa e não é
persistida em texto claro no arquivo de ambiente.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enable-control) ENABLE_CONTROL=1; shift ;;
    --admin-email) ADMIN_EMAIL="${2:?Informe o e-mail}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:?Informe o nome}"; shift 2 ;;
    --ig200-tag) IG200_TAG="${2:?Informe a tag}"; shift 2 ;;
    --ig200-name) IG200_NAME="${2:?Informe o nome}"; shift 2 ;;
    --ig200-site) IG200_SITE="${2:?Informe o site}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1"; usage; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root: sudo bash $0"
  exit 1
fi

if [[ ! -t 0 ]]; then
  echo "ERRO: execute o instalador em um terminal interativo para criar a senha do administrador."
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive

echo "============================================================"
echo " RC GERADORES - INSTALAÇÃO LIMPA"
echo "============================================================"
echo "Arquitetura: modem -> bridge -> Rapid SCADA -> API -> painel"
echo

echo "[1/12] Dependências do sistema..."
apt-get update
apt-get install -y \
  git curl ca-certificates unzip nginx jq openssl sudo \
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

if ! command -v dotnet >/dev/null 2>&1; then
  apt-get install -y dotnet-sdk-8.0 || {
    echo "Pacote dotnet-sdk-8.0 não disponível no repositório atual; configurando Microsoft packages..."
    . /etc/os-release
    curl -fsSL "https://packages.microsoft.com/config/ubuntu/${VERSION_ID}/packages-microsoft-prod.deb" \
      -o /tmp/packages-microsoft-prod.deb
    dpkg -i /tmp/packages-microsoft-prod.deb
    apt-get update
    apt-get install -y dotnet-sdk-8.0
  }
fi

command -v node >/dev/null
command -v npm >/dev/null
command -v dotnet >/dev/null

echo "[2/12] Instalando/validando Rapid SCADA ${RAPID_VERSION}..."
if [[ ! -f /opt/scada/ScadaComm/Config/ScadaCommConfig.xml || ! -f /opt/scada/BaseDAT/cnl.dat ]]; then
  rm -rf "$TMP"
  mkdir -p "$TMP/pkg"
  curl -fL "$RAPID_URL" -o "$TMP/rapidscada.zip"
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
  echo "Rapid SCADA já encontrado em /opt/scada; mantendo instalação existente."
fi

for file in \
  /opt/scada/ScadaComm/Config/ScadaCommConfig.xml \
  /opt/scada/BaseDAT/commline.dat \
  /opt/scada/BaseDAT/device.dat \
  /opt/scada/BaseDAT/cnl.dat; do
  [[ -f "$file" ]] || { echo "ERRO: Rapid SCADA incompleto: $file"; exit 3; }
done
systemctl daemon-reload

echo "[3/12] Baixando/atualizando ProjetoGerador..."
if [[ -d "$BASE/.git" ]]; then
  git -C "$BASE" fetch origin main
  git -C "$BASE" checkout main
  git -C "$BASE" pull --ff-only origin main
else
  rm -rf "$BASE"
  git clone "$REPO" "$BASE"
fi

if ! id rcgeradores >/dev/null 2>&1; then
  useradd --system --home "$BASE" --shell /usr/sbin/nologin rcgeradores
fi
mkdir -p /var/lib/rc-geradores /var/log/rc-geradores
chown -R rcgeradores:rcgeradores /var/lib/rc-geradores /var/log/rc-geradores
chmod +x "$BASE/ops/install.sh" "$BASE/ops/status.sh" \
  "$BASE/rapid/provisioning/provision_ig200.sh" "$BASE/rapid/provisioning/rapid_dat.py" \
  "$BASE/ops/bootstrap_admin.py" "$BASE/ops/bootstrap_ig200.py"

echo "[4/12] Configuração do ambiente..."
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

set_env RC_ADMIN_NAME "$ADMIN_NAME"
set_env RC_ADMIN_EMAIL "$ADMIN_EMAIL"
set_env RC_ADMIN_PASSWORD ""
set_env RC_ENABLE_IG200_CONTROL "$ENABLE_CONTROL"
chmod 640 "$ENV_FILE"
chown root:rcgeradores "$ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "[5/12] Backend e banco do produto..."
python3 -m venv "$BASE/backend/.venv"
"$BASE/backend/.venv/bin/pip" install --upgrade pip
"$BASE/backend/.venv/bin/pip" install -r "$BASE/backend/requirements.txt"

export PYTHONPATH="$BASE/backend"
"$BASE/backend/.venv/bin/python" - <<'PY'
from app import db
db.init_db()
print("Banco RC Geradores: OK")
PY

echo
echo "Primeiro acesso ao RC Geradores"
"$BASE/backend/.venv/bin/python" "$BASE/ops/bootstrap_admin.py" \
  --name "$ADMIN_NAME" --email "$ADMIN_EMAIL"

"$BASE/backend/.venv/bin/python" "$BASE/ops/bootstrap_ig200.py" \
  --tag "$IG200_TAG" --name "$IG200_NAME" --site "$IG200_SITE"
chown -R rcgeradores:rcgeradores /var/lib/rc-geradores

echo "[6/12] Provisionando IG200 no Rapid SCADA..."
bash "$BASE/rapid/provisioning/provision_ig200.sh" --no-restart

echo "[7/12] Compilando leitor oficial do Rapid SCADA Server..."
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

echo "[8/12] Compilando frontend para a VM..."
cd "$BASE"
npm ci
NITRO_PRESET=node-server npm run build
test -f "$BASE/.output/server/index.mjs"

echo "[9/12] Instalando serviços RC..."
cp "$BASE/ops/systemd/rc-geradores-api.service" /etc/systemd/system/
cp "$BASE/ops/systemd/rc-geradores-frontend.service" /etc/systemd/system/
cp "$BASE/ops/systemd/rc-geradores-bridge.service" /etc/systemd/system/
systemctl daemon-reload

# A bridge sobe primeiro para que o Communicator tenha 127.0.0.1:25001 disponível.
systemctl enable --now rc-geradores-bridge.service

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

systemctl enable --now rc-geradores-api.service rc-geradores-frontend.service

echo "[10/12] Configurando Nginx..."
cp "$BASE/ops/nginx/rc-geradores.conf" /etc/nginx/sites-available/rc-geradores
ln -sfn /etc/nginx/sites-available/rc-geradores /etc/nginx/sites-enabled/rc-geradores
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/rc-scada
nginx -t
systemctl enable --now nginx
systemctl restart nginx

echo "[11/12] Validando serviços..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8090/api/health >/tmp/rc-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8090/api/health | jq .
curl -fsS http://127.0.0.1:3000/ >/dev/null
curl -fsS http://127.0.0.1/api/health | jq .

for svc in rc-geradores-bridge rc-geradores-api rc-geradores-frontend scadaserver6 scadacomm6 nginx; do
  if ! systemctl is-active --quiet "$svc"; then
    echo "ERRO: serviço $svc não está ativo."
    systemctl --no-pager --full status "$svc" || true
    exit 5
  fi
done

echo "[12/12] Verificação final..."
python3 "$BASE/rapid/provisioning/rapid_dat.py" check \
  /opt/scada/BaseDAT/commline.dat /opt/scada/BaseDAT/device.dat /opt/scada/BaseDAT/cnl.dat

grep -q 'number="100"' /opt/scada/ScadaComm/Config/ScadaCommConfig.xml
grep -q 'number="200"' /opt/scada/ScadaComm/Config/ScadaCommConfig.xml
ss -lnt 2>/dev/null | grep -q ':15001 ' || {
  echo "AVISO: a porta 15001 ainda não apareceu em ss; consulte journalctl -u rc-geradores-bridge."
}
ss -lnt 2>/dev/null | grep -q ':25001 ' || {
  echo "AVISO: a porta local 25001 ainda não apareceu em ss."
}

IP="$(hostname -I | awk '{print $1}')"
echo
echo "============================================================"
echo " RC GERADORES INSTALADO"
echo "============================================================"
echo " Interface:       http://${IP:-IP_DA_VM}/"
echo " Usuário inicial: $ADMIN_EMAIL"
echo " API health:      http://${IP:-IP_DA_VM}/api/health"
echo " Banco produto:   /var/lib/rc-geradores/rc-geradores.db"
echo " Rapid SCADA:     /opt/scada"
echo " Line/Device:     100 / 200"
echo " IG200:           ${IG200_TAG} - TCP 15001 - Unit 2"
echo " Bridge local:    127.0.0.1:25001"
if (( ENABLE_CONTROL == 1 )); then
  echo " START/STOP:      HABILITADO para IG200 homologado"
else
  echo " START/STOP:      DESABILITADO (use --enable-control na instalação)"
fi
echo
echo " Diagnóstico: sudo $BASE/ops/status.sh"
echo "============================================================"
