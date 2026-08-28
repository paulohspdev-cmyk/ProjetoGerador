#!/usr/bin/env python3
"""Provisiona um gerador no Rapid SCADA usando somente Controller Packs production.

Transportes:
- reverse_tcp: modem/DTU inicia sessão na bridge; Rapid usa localhost + offset.
- modbus_tcp_direct: Rapid conecta ao equipamento TCP, padrão 502.
- rtu_over_tcp: Rapid conecta TCP e DrvModbus usa TransMode=RTU.
- modbus_rtu_serial: Rapid usa SerialPort com parâmetros explícitos.

Nunca habilita comandos no Rapid. CmdEnabled=false para todas as linhas.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = Path(os.environ.get("RC_PROJECT_ROOT", "/opt/rc-geradores"))
SCADA = Path("/opt/scada")
DAT = SCADA / "BaseDAT"
CFG = SCADA / "ScadaComm/Config/ScadaCommConfig.xml"
RUNTIME_BINDINGS = Path(os.environ.get("RC_RAPID_BINDINGS", "/var/lib/rc-geradores/rapid-bindings.json"))
STATE = Path("/var/lib/rc-geradores/rapid-provision")
LOCAL_OFFSET = int(os.environ.get("RC_RAPID_LOCAL_OFFSET", "10000"))

sys.path.insert(0, str(BASE / "backend"))
sys.path.insert(0, str(BASE / "rapid/provisioning"))

from app import db  # noqa: E402
from app.controller_library import pack_for_model  # noqa: E402
from app.transport_store import get_transport_config, validate_for_transport  # noqa: E402
from rapid_dat import append_row, read_table  # noqa: E402


def _max_pk(path: Path, key: str, floor: int) -> int:
    _, rows = read_table(str(path))
    values = [int(r.get(key) or 0) for r in rows]
    return max([floor, *values])


def _row_by_pk(path: Path, key: str, value: int):
    _, rows = read_table(str(path))
    return next((row for row in rows if int(row.get(key) or 0) == int(value)), None)


def _load_bindings():
    if RUNTIME_BINDINGS.exists():
        try:
            value = json.loads(RUNTIME_BINDINGS.read_text(encoding="utf-8"))
            if isinstance(value, list):
                return value
        except Exception:
            pass
    canonical = BASE / "rapid/bindings.json"
    if canonical.exists():
        value = json.loads(canonical.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    return []


def _save_bindings(items):
    RUNTIME_BINDINGS.parent.mkdir(parents=True, exist_ok=True)
    tmp = RUNTIME_BINDINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, RUNTIME_BINDINGS)


def _backup(paths):
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    target = STATE / f"backup-{stamp}"
    suffix = 0
    while target.exists():
        suffix += 1
        target = STATE / f"backup-{stamp}-{suffix}"
    target.mkdir(parents=True, exist_ok=False)
    for path in paths:
        p = Path(path)
        if p.exists():
            dst = target / p.name
            if p.is_dir():
                shutil.copytree(p, dst)
            else:
                shutil.copy2(p, dst)
    return target


def _channel_options(parent, options: dict):
    for key, value in options.items():
        ET.SubElement(parent, "Option", {"name": key, "value": str(value)})


def _find_line(root, line_num: int):
    lines = root.find("Lines")
    if lines is None:
        return None
    return next((line for line in lines.findall("Line") if int(line.get("number") or 0) == line_num), None)


def _find_or_create_line(root, line_num: int, name: str, transport: str, generator: dict, config: dict):
    lines = root.find("Lines")
    if lines is None:
        lines = ET.SubElement(root, "Lines")
    existing = _find_line(root, line_num)
    if existing is not None:
        return existing

    line = ET.SubElement(lines, "Line", {"active": "true", "isBound": "true", "number": str(line_num), "name": name})
    opts = ET.SubElement(line, "LineOptions")
    for tag, value in [("ReqRetries", "1"), ("CycleDelay", "200"), ("CmdEnabled", "false"), ("PollAfterCmd", "false"), ("DetailedLog", "true")]:
        ET.SubElement(opts, tag).text = value

    custom = ET.SubElement(line, "CustomOptions")
    trans_mode = "TCP"

    if transport == "reverse_tcp":
        port = int(generator["listen_port"])
        channel = ET.SubElement(line, "Channel", {"type": "TcpClient", "driver": "DrvCnlBasic"})
        _channel_options(channel, {
            "Host": "127.0.0.1",
            "TcpPort": port + LOCAL_OFFSET,
            "ReconnectAfter": 2,
            "StayConnected": "true",
            "DisconnectOnError": "false",
            "Behavior": "Master",
            "ConnectionMode": "Shared",
        })
    elif transport in {"modbus_tcp_direct", "rtu_over_tcp"}:
        host = str(generator.get("host") or config.get("host"))
        default_port = 502 if transport == "modbus_tcp_direct" else 0
        port = int(generator.get("listen_port") or config.get("tcpPort") or default_port)
        channel = ET.SubElement(line, "Channel", {"type": "TcpClient", "driver": "DrvCnlBasic"})
        _channel_options(channel, {
            "Host": host,
            "TcpPort": port,
            "ReconnectAfter": 5,
            "StayConnected": "true",
            "DisconnectOnError": "false",
            "Behavior": "Master",
            "ConnectionMode": "Individual",
        })
        trans_mode = "TCP" if transport == "modbus_tcp_direct" else "RTU"
    elif transport == "modbus_rtu_serial":
        port_name = str(generator.get("host") or config.get("host"))
        channel = ET.SubElement(line, "Channel", {"type": "SerialPort", "driver": "DrvCnlBasic"})
        _channel_options(channel, {
            "PortName": port_name,
            "BaudRate": int(config["baudRate"]),
            "DataBits": int(config.get("dataBits") or 8),
            "Parity": config["parity"],
            "StopBits": config["stopBits"],
            "DtrEnable": str(bool(config.get("dtrEnable", False))).lower(),
            "RtsEnable": str(bool(config.get("rtsEnable", False))).lower(),
            "Behavior": "Master",
        })
        trans_mode = "RTU"
    else:
        raise ValueError(f"Transporte não suportado: {transport}")

    ET.SubElement(custom, "Option", {"name": "TransMode", "value": trans_mode})
    ET.SubElement(line, "DevicePolling")
    return line


def _validate_shared_reverse_line(root, shared: dict, generator: dict):
    line_num = int(shared["rapid_line_num"])
    line_row = _row_by_pk(DAT / "commline.dat", "CommLineNum", line_num)
    if not line_row:
        raise ValueError(f"Binding compartilhado aponta para CommLine {line_num} inexistente")
    line = _find_line(root, line_num)
    if line is None:
        raise ValueError(f"Binding compartilhado aponta para Line {line_num} ausente no ScadaCommConfig.xml")

    expected_port = int(generator["listen_port"]) + LOCAL_OFFSET
    channel = line.find("Channel")
    options = {}
    if channel is not None:
        for option in channel.findall("Option"):
            options[option.get("name") or ""] = option.get("value")
    if channel is None or channel.get("type") != "TcpClient":
        raise ValueError(f"Line {line_num} compartilhada não é TcpClient")
    if options.get("Host") not in {"127.0.0.1", "localhost"}:
        raise ValueError(f"Line {line_num} compartilhada não aponta para a bridge local")
    try:
        configured_port = int(options.get("TcpPort") or 0)
    except ValueError as exc:
        raise ValueError(f"TcpPort inválida na Line {line_num}") from exc
    if configured_port != expected_port:
        raise ValueError(f"Line {line_num} usa TcpPort {configured_port}, esperado {expected_port}")
    return line


def _add_device_to_line(line, device_num: int, generator: dict, template_name: str, config: dict):
    polling = line.find("DevicePolling")
    if polling is None:
        polling = ET.SubElement(line, "DevicePolling")
    for dev in polling.findall("Device"):
        if int(dev.get("number") or 0) == device_num:
            if int(dev.get("numAddress") or 0) != int(generator.get("modbus_unit") or 1):
                raise ValueError(f"Device {device_num} já existe com outro Unit ID")
            return
    ET.SubElement(
        polling,
        "Device",
        {
            "active": "true",
            "isBound": "true",
            "number": str(device_num),
            "name": generator.get("name") or generator["tag"],
            "driver": "DrvModbus",
            "numAddress": str(int(generator.get("modbus_unit") or 1)),
            "strAddress": "",
            "pollOnCmd": "false",
            "timeout": str(int(config.get("timeoutMs") or 2500)),
            "delay": str(int(config.get("pollDelayMs") or 1000)),
            "time": "00:00:00",
            "period": "00:00:00",
            "cmdLine": template_name,
        },
    )


def provision(generator_id: str, restart: bool = True):
    if os.geteuid() != 0:
        raise PermissionError("Provisionamento do Rapid SCADA exige root")
    db.init_db()
    generator = db.get_generator(generator_id)
    if not generator:
        raise ValueError("Gerador não encontrado")
    if not generator.get("enabled"):
        raise ValueError("Gerador desabilitado")

    pack = pack_for_model(generator.get("controller_model") or "")
    if not pack or pack.get("lifecycle") != "production":
        raise ValueError("Somente Controller Pack production pode ser provisionado")
    rapid = pack.get("rapid") or {}
    channel_specs = rapid.get("channels") or []
    template_rel = rapid.get("template")
    if not template_rel or not channel_specs:
        raise ValueError("Controller Pack sem metadados Rapid completos")
    if generator.get("transport") not in (pack.get("transports") or []):
        raise ValueError("Transporte não homologado por este Controller Pack")

    config = get_transport_config(generator["id"])
    validate_for_transport(generator, config)

    required = [DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG, BASE / template_rel]
    for path in required:
        if not path.exists():
            raise FileNotFoundError(path)

    bindings = _load_bindings()
    existing = next((b for b in bindings if str(b.get("generator_id") or "") == generator["id"]), None)
    if existing:
        return {"ok": True, "existing": True, "binding": existing}

    shared = None
    if generator["transport"] == "reverse_tcp":
        same_port = [
            b for b in bindings
            if b.get("transport") == "reverse_tcp"
            and int(b.get("listen_port") or 0) == int(generator.get("listen_port") or 0)
        ]
        unit_conflict = next((b for b in same_port if int(b.get("modbus_unit") or 0) == int(generator.get("modbus_unit") or 1)), None)
        if unit_conflict:
            raise ValueError(
                f"Porta reverse TCP {generator['listen_port']} já possui Unit ID {generator.get('modbus_unit') or 1} "
                f"no gerador {unit_conflict.get('tag') or unit_conflict.get('generator_id')}"
            )
        shared = next((b for b in same_port if b.get("rapid_line_num")), None)

    line_num = int(shared["rapid_line_num"]) if shared else _max_pk(DAT / "commline.dat", "CommLineNum", 99) + 1
    requested_device = int(generator.get("rapid_device_num") or 0)
    device_num = requested_device if requested_device > 0 else _max_pk(DAT / "device.dat", "DeviceNum", 199) + 1
    first_cnl = _max_pk(DAT / "cnl.dat", "CnlNum", 1999) + 1

    device_existing = _row_by_pk(DAT / "device.dat", "DeviceNum", device_num)
    if device_existing:
        raise ValueError(f"Rapid Device {device_num} já existe no BaseDAT; escolha outro número ou deixe automático")

    template_src = BASE / template_rel
    template_dst = SCADA / "ScadaComm/Config" / template_src.name
    runtime_existed = RUNTIME_BINDINGS.exists()
    template_existed = template_dst.exists()
    backup = _backup([DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG, RUNTIME_BINDINGS, template_dst])

    services_stopped = False
    binding = None
    try:
        subprocess.run(["systemctl", "stop", "scadacomm6.service"], check=False)
        subprocess.run(["systemctl", "stop", "scadaserver6.service"], check=False)
        services_stopped = True
        shutil.copy2(template_src, template_dst)

        tree = ET.parse(CFG)
        root = tree.getroot()
        if shared:
            line = _validate_shared_reverse_line(root, shared, generator)
        else:
            append_row(str(DAT / "commline.dat"), "CommLineNum", {
                "CommLineNum": line_num,
                "Name": f"RC {generator['tag']}",
                "Descr": f"{generator['transport']} {generator.get('host') or ''}:{generator.get('listen_port') or ''}",
            })
            line = _find_or_create_line(root, line_num, f"RC {generator['tag']}", generator["transport"], generator, config)

        append_row(str(DAT / "device.dat"), "DeviceNum", {
            "DeviceNum": device_num,
            "Name": generator.get("name") or generator["tag"],
            "Code": generator["tag"],
            "DevTypeID": None,
            "NumAddress": int(generator.get("modbus_unit") or 1),
            "StrAddress": "",
            "CommLineNum": line_num,
            "Descr": f"{pack.get('manufacturer')} {pack.get('model')}",
        })

        channels = {}
        for index, spec in enumerate(channel_specs):
            cnl = first_cnl + index
            key = spec["key"]
            append_row(str(DAT / "cnl.dat"), "CnlNum", {
                "CnlNum": cnl,
                "Active": True,
                "Name": f"{generator['tag']} {spec.get('name') or key}",
                "Code": f"{generator['tag'].lower()}_{key}",
                "DataTypeID": None,
                "DataLen": None,
                "CnlTypeID": 1,
                "ObjNum": None,
                "DeviceNum": device_num,
                "TagNum": None,
                "TagCode": spec.get("tagCode") or key,
                "FormulaEnabled": False,
                "InFormula": None,
                "OutFormula": None,
                "FormatID": None,
                "OutFormatID": None,
                "QuantityID": None,
                "UnitID": None,
                "LimID": None,
                "ArchiveMask": None,
                "EventMask": None,
            })
            channels[key] = {"cnl": cnl, "scale": float(spec.get("scale", 1.0))}

        _add_device_to_line(line, device_num, generator, template_src.name, config)
        ET.indent(tree, space="  ")
        tree.write(CFG, encoding="utf-8", xml_declaration=True)
        ET.parse(CFG)
        ET.parse(template_dst)
        read_table(str(DAT / "commline.dat"))
        read_table(str(DAT / "device.dat"))
        read_table(str(DAT / "cnl.dat"))

        binding = {
            "generator_id": generator["id"],
            "tag": generator["tag"],
            "controller_type": generator.get("controller_type"),
            "controller_model": generator.get("controller_model"),
            "transport": generator.get("transport"),
            "host": generator.get("host") or "",
            "listen_port": int(generator.get("listen_port") or 0),
            "modbus_unit": int(generator.get("modbus_unit") or 1),
            "rapid_line_num": line_num,
            "rapid_device_num": device_num,
            "status": pack.get("status") or "production",
            "channels": channels,
        }
        bindings.append(binding)
        _save_bindings(bindings)
        db.update_generator(generator["id"], {"rapid_device_num": device_num}, actor="rapid-provisioner")
        db.add_audit("rapid-provisioner", "provision", "generator", generator["id"], f"line={line_num};device={device_num};transport={generator['transport']}")
    except Exception:
        for name, target in [
            ("commline.dat", DAT / "commline.dat"),
            ("device.dat", DAT / "device.dat"),
            ("cnl.dat", DAT / "cnl.dat"),
            ("ScadaCommConfig.xml", CFG),
            (RUNTIME_BINDINGS.name, RUNTIME_BINDINGS),
            (template_dst.name, template_dst),
        ]:
            source = backup / name
            if source.exists():
                shutil.copy2(source, target)
        if not runtime_existed:
            RUNTIME_BINDINGS.unlink(missing_ok=True)
        if not template_existed:
            template_dst.unlink(missing_ok=True)
        raise
    finally:
        if restart and services_stopped:
            subprocess.run(["systemctl", "start", "scadaserver6.service"], check=False)
            time.sleep(2)
            subprocess.run(["systemctl", "restart", "scadacomm6.service"], check=False)

    return {"ok": True, "existing": False, "binding": binding, "backup": str(backup)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("generator_id")
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    print(json.dumps(provision(args.generator_id, restart=not args.no_restart), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
