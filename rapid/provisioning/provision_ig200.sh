#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/rc-geradores"
SCADA="/opt/scada"
DAT="$SCADA/BaseDAT"
CFG="$SCADA/ScadaComm/Config/ScadaCommConfig.xml"
TPL_SRC="$BASE/rapid/templates/DrvModbus_RC_IG200.xml"
TPL_DST="$SCADA/ScadaComm/Config/DrvModbus_RC_IG200.xml"
TOOL="$BASE/rapid/provisioning/rapid_dat.py"
STATE_DIR="/var/lib/rc-geradores/rapid-provision"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$STATE_DIR/backup-$STAMP"
NO_RESTART=0

if [[ "${1:-}" == "--no-restart" ]]; then
  NO_RESTART=1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root: sudo bash $0"
  exit 1
fi

for file in "$DAT/commline.dat" "$DAT/device.dat" "$DAT/cnl.dat" "$CFG" "$TPL_SRC" "$TOOL"; do
  [[ -f "$file" ]] || { echo "ERRO: arquivo necessário ausente: $file"; exit 2; }
done

mkdir -p "$BACKUP_DIR"
cp -a "$DAT/commline.dat" "$DAT/device.dat" "$DAT/cnl.dat" "$CFG" "$BACKUP_DIR/"
[[ -f "$TPL_DST" ]] && cp -a "$TPL_DST" "$BACKUP_DIR/DrvModbus_RC_IG200.xml" || true
printf '%s\n' "$BACKUP_DIR" >"$STATE_DIR/last_backup"

rollback() {
  local rc=$?
  echo "ERRO: provisionamento falhou; restaurando BaseDAT e Communicator..." >&2
  cp -a "$BACKUP_DIR/commline.dat" "$DAT/commline.dat" || true
  cp -a "$BACKUP_DIR/device.dat" "$DAT/device.dat" || true
  cp -a "$BACKUP_DIR/cnl.dat" "$DAT/cnl.dat" || true
  cp -a "$BACKUP_DIR/ScadaCommConfig.xml" "$CFG" || true
  if [[ -f "$BACKUP_DIR/DrvModbus_RC_IG200.xml" ]]; then
    cp -a "$BACKUP_DIR/DrvModbus_RC_IG200.xml" "$TPL_DST" || true
  fi
  systemctl start scadaserver6.service 2>/dev/null || true
  systemctl start scadacomm6.service 2>/dev/null || true
  exit "$rc"
}
trap rollback ERR

python3 "$TOOL" check "$DAT/commline.dat" "$DAT/device.dat" "$DAT/cnl.dat"
install -m 0644 "$TPL_SRC" "$TPL_DST"

# Evita que Server/Communicator leiam uma BaseDAT parcialmente atualizada.
systemctl stop scadacomm6.service 2>/dev/null || true
systemctl stop scadaserver6.service 2>/dev/null || true

python3 "$TOOL" append "$DAT/commline.dat" CommLineNum \
  '{"CommLineNum":100,"Name":"RC Geradores 15001","Descr":"Reverse TCP bridge 15001 -> 25001"}'

python3 "$TOOL" append "$DAT/device.dat" DeviceNum \
  '{"DeviceNum":200,"Name":"InteliGen 200","Code":"IG200","DevTypeID":null,"NumAddress":2,"StrAddress":"","CommLineNum":100,"Descr":"ComAp InteliGen 200 - Modbus Unit 2"}'

python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2001,"Active":true,"Name":"IG200 RPM","Code":"ig200_rpm","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"rpm","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2002,"Active":true,"Name":"IG200 Tensao L1-N","Code":"ig200_voltage_l1","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l1","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2003,"Active":true,"Name":"IG200 Tensao L2-N","Code":"ig200_voltage_l2","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l2","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2004,"Active":true,"Name":"IG200 Tensao L3-N","Code":"ig200_voltage_l3","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l3","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2005,"Active":true,"Name":"IG200 Tensao L1-L2","Code":"ig200_voltage_l1_l2","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l1_l2","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2006,"Active":true,"Name":"IG200 Tensao L2-L3","Code":"ig200_voltage_l2_l3","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l2_l3","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2007,"Active":true,"Name":"IG200 Tensao L3-L1","Code":"ig200_voltage_l3_l1","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"voltage_l3_l1","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'
python3 "$TOOL" append "$DAT/cnl.dat" CnlNum \
  '{"CnlNum":2008,"Active":true,"Name":"IG200 Frequencia x100","Code":"ig200_frequency_raw","DataTypeID":null,"DataLen":null,"CnlTypeID":1,"ObjNum":null,"DeviceNum":200,"TagNum":null,"TagCode":"frequency_raw","FormulaEnabled":false,"InFormula":null,"OutFormula":null,"FormatID":null,"OutFormatID":null,"QuantityID":null,"UnitID":null,"LimID":null,"ArchiveMask":null,"EventMask":null}'

python3 - "$CFG" <<'PY'
import sys
import xml.etree.ElementTree as ET

cfg = sys.argv[1]
tree = ET.parse(cfg)
root = tree.getroot()
lines = root.find("Lines")
if lines is None:
    lines = ET.SubElement(root, "Lines")

# Esta linha/dispositivo são reservados ao pack homologado IG200.
for line in list(lines):
    if line.tag == "Line" and (line.get("number") == "100" or line.get("name") == "RC Geradores - IG200 Unit 2"):
        lines.remove(line)

line = ET.SubElement(lines, "Line", {
    "active": "true",
    "isBound": "true",
    "number": "100",
    "name": "RC Geradores - IG200 Unit 2",
})
opts = ET.SubElement(line, "LineOptions")
for tag, value in [
    ("ReqRetries", "1"),
    ("CycleDelay", "200"),
    ("CmdEnabled", "false"),
    ("PollAfterCmd", "false"),
    ("DetailedLog", "true"),
]:
    ET.SubElement(opts, tag).text = value

channel = ET.SubElement(line, "Channel", {"type": "TcpClient", "driver": "DrvCnlBasic"})
for name, value in [
    ("Host", "127.0.0.1"),
    ("TcpPort", "25001"),
    ("ReconnectAfter", "2"),
    ("StayConnected", "true"),
    ("DisconnectOnError", "false"),
    ("Behavior", "Master"),
    ("ConnectionMode", "Shared"),
]:
    ET.SubElement(channel, "Option", {"name": name, "value": value})

custom = ET.SubElement(line, "CustomOptions")
ET.SubElement(custom, "Option", {"name": "TransMode", "value": "TCP"})

devpoll = ET.SubElement(line, "DevicePolling")
ET.SubElement(devpoll, "Device", {
    "active": "true",
    "isBound": "true",
    "number": "200",
    "name": "InteliGen 200",
    "driver": "DrvModbus",
    "numAddress": "2",
    "strAddress": "",
    "pollOnCmd": "false",
    "timeout": "2500",
    "delay": "1000",
    "time": "00:00:00",
    "period": "00:00:00",
    "cmdLine": "DrvModbus_RC_IG200.xml",
})

ET.indent(tree, space="  ")
tree.write(cfg, encoding="utf-8", xml_declaration=True)
PY

python3 - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('/opt/scada/ScadaComm/Config/ScadaCommConfig.xml')
ET.parse('/opt/scada/ScadaComm/Config/DrvModbus_RC_IG200.xml')
print('Rapid XML: OK')
PY
python3 "$TOOL" check "$DAT/commline.dat" "$DAT/device.dat" "$DAT/cnl.dat"

trap - ERR

if (( NO_RESTART == 0 )); then
  systemctl start scadaserver6.service
  sleep 2
  systemctl restart scadacomm6.service
fi

echo "Rapid SCADA provisionado: Line 100 / Device 200 / canais 2001..2008"
echo "TCP local: 127.0.0.1:25001 / Modbus Unit 2"
echo "Backup: $BACKUP_DIR"
