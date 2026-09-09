#!/usr/bin/env python3
"""Provisiona e reconcilia equipamentos no Rapid SCADA por Controller Pack.

Transportes:
- reverse_tcp: modem/DTU inicia sessão na bridge; Rapid usa localhost + offset.
- modbus_tcp_direct: Rapid conecta ao equipamento TCP, padrão 502.
- rtu_over_tcp: Rapid conecta TCP e DrvModbus usa TransMode=RTU.
- modbus_rtu_serial: Rapid usa SerialPort com parâmetros explícitos.

Princípios:
- somente Controller Pack production pode materializar configuração industrial;
- provisioning é idempotente e reconcilia drift de metadados/canais;
- números de canais existentes são preservados para manter histórico;
- canais antigos que saíram do pack não são apagados do BaseDAT; viram órfãos no
  binding e deixam de ser expostos como telemetria homologada;
- toda mutação faz backup e possui rollback local;
- qualquer estado de binding inválido bloqueia a operação (fail closed);
- nunca habilita comandos no Rapid. CmdEnabled=false para todas as linhas.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
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
from app.binding_store import (  # noqa: E402
    BindingStoreError,
    load_runtime_bindings,
    validate_runtime_bindings,
)
from app.controller_library import pack_for_model  # noqa: E402
from app.transport_store import get_transport_config, validate_for_transport  # noqa: E402
from rapid_dat import append_row, read_table, update_row  # noqa: E402
from service_guard import (  # noqa: E402
    ensure_stopped_for_mutation,
    restore_after_mutation,
    stop_for_mutation,
)


LINE_OPTION_DEFAULTS = {
    "ReqRetries": "1",
    "CycleDelay": "200",
    "CmdEnabled": "false",
    "PollAfterCmd": "false",
    "DetailedLog": "true",
}


def _max_pk(path: Path, key: str, floor: int) -> int:
    _, rows = read_table(str(path))
    values = [int(r.get(key) or 0) for r in rows]
    return max([floor, *values])


def _row_by_pk(path: Path, key: str, value: int):
    _, rows = read_table(str(path))
    return next((row for row in rows if int(row.get(key) or 0) == int(value)), None)


def _binding_is_materialized(binding: dict) -> bool:
    """Só adota binding canônico quando Rapid já contém linha/device correspondentes."""
    try:
        line_num = int(binding.get("rapid_line_num") or 0)
        device_num = int(binding.get("rapid_device_num") or 0)
        if line_num <= 0 or device_num <= 0:
            return False
        if not all(path.exists() for path in (DAT / "commline.dat", DAT / "device.dat", CFG)):
            return False
        if not _row_by_pk(DAT / "commline.dat", "CommLineNum", line_num):
            return False
        if not _row_by_pk(DAT / "device.dat", "DeviceNum", device_num):
            return False
        root = ET.parse(CFG).getroot()
        line = _find_line(root, line_num)
        if line is None:
            return False
        polling = line.find("DevicePolling")
        if polling is None:
            return False
        return any(int(dev.get("number") or 0) == device_num for dev in polling.findall("Device"))
    except Exception:
        return False


def _load_bindings() -> list[dict]:
    if RUNTIME_BINDINGS.exists():
        try:
            return load_runtime_bindings(RUNTIME_BINDINGS)
        except BindingStoreError as exc:
            raise ValueError(
                "Bindings Rapid de runtime estão inválidos; provisionamento bloqueado até reconciliação"
            ) from exc

    # rapid/bindings.json é somente referência canônica. Ele não pode fazer uma
    # VM limpa parecer provisionada. Só é adotado como migração quando o Rapid
    # já possui fisicamente a Line/Device descritos no arquivo.
    canonical = BASE / "rapid/bindings.json"
    if not canonical.exists():
        return []
    try:
        value = json.loads(canonical.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Binding canônico inválido: {canonical}: {exc}") from exc
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"Binding canônico inválido: {canonical} deve conter uma lista de objetos")
    materialized = [item for item in value if _binding_is_materialized(item)]
    try:
        validate_runtime_bindings(materialized)
    except BindingStoreError as exc:
        raise ValueError("Bindings canônicos materializados possuem identidade duplicada") from exc
    return materialized


def _save_bindings(items: list[dict]) -> None:
    try:
        validate_runtime_bindings(items)
    except BindingStoreError as exc:
        raise ValueError(f"Recusado salvar bindings Rapid inválidos: {exc}") from exc
    RUNTIME_BINDINGS.parent.mkdir(parents=True, exist_ok=True)
    tmp = RUNTIME_BINDINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with tmp.open("rb") as fh:
        os.fsync(fh.fileno())
    os.replace(tmp, RUNTIME_BINDINGS)
    try:
        dir_fd = os.open(RUNTIME_BINDINGS.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except OSError:
        pass


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


def _restore_backup(
    backup: Path,
    targets: list[tuple[str, Path]],
    runtime_existed: bool,
    template_existed: bool,
    template_dst: Path,
):
    for name, target in targets:
        source = backup / name
        if source.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    if not runtime_existed:
        RUNTIME_BINDINGS.unlink(missing_ok=True)
    if not template_existed:
        template_dst.unlink(missing_ok=True)


def _channel_options(parent, options: dict):
    for key, value in options.items():
        ET.SubElement(parent, "Option", {"name": key, "value": str(value)})


def _find_line(root, line_num: int):
    lines = root.find("Lines")
    if lines is None:
        return None
    return next((line for line in lines.findall("Line") if int(line.get("number") or 0) == line_num), None)


def _line_channel_spec(transport: str, generator: dict, config: dict) -> tuple[str, dict, str]:
    if transport == "reverse_tcp":
        port = int(generator["listen_port"])
        return (
            "TcpClient",
            {
                "Host": "127.0.0.1",
                "TcpPort": port + LOCAL_OFFSET,
                "ReconnectAfter": 2,
                "StayConnected": "true",
                "DisconnectOnError": "false",
                "Behavior": "Master",
                "ConnectionMode": "Shared",
            },
            "TCP",
        )
    if transport in {"modbus_tcp_direct", "rtu_over_tcp"}:
        host = str(generator.get("host") or config.get("host") or "").strip()
        port = int(generator.get("listen_port") or config.get("tcpPort") or 502)
        return (
            "TcpClient",
            {
                "Host": host,
                "TcpPort": port,
                "ReconnectAfter": 5,
                "StayConnected": "true",
                "DisconnectOnError": "false",
                "Behavior": "Master",
                "ConnectionMode": "Individual",
            },
            "TCP" if transport == "modbus_tcp_direct" else "RTU",
        )
    if transport == "modbus_rtu_serial":
        port_name = str(generator.get("host") or config.get("host") or "").strip()
        return (
            "SerialPort",
            {
                "PortName": port_name,
                "BaudRate": int(config["baudRate"]),
                "DataBits": int(config.get("dataBits") or 8),
                "Parity": config["parity"],
                "StopBits": config["stopBits"],
                "DtrEnable": str(bool(config.get("dtrEnable", False))).lower(),
                "RtsEnable": str(bool(config.get("rtsEnable", False))).lower(),
                "Behavior": "Master",
            },
            "RTU",
        )
    raise ValueError(f"Transporte não suportado: {transport}")


def _ensure_line_safety(line) -> list[str]:
    changes: list[str] = []
    opts = line.find("LineOptions")
    if opts is None:
        opts = ET.SubElement(line, "LineOptions")
        changes.append("xml.line.options:add")
    children = {child.tag: child for child in opts}
    for tag, value in LINE_OPTION_DEFAULTS.items():
        child = children.get(tag)
        if child is None:
            child = ET.SubElement(opts, tag)
            changes.append(f"xml.line.{tag}:add")
        if child.text != value:
            changes.append(f"xml.line.{tag}:{child.text!r}->{value!r}")
            child.text = value
    return changes


def _find_or_create_line(root, line_num: int, name: str, transport: str, generator: dict, config: dict):
    lines = root.find("Lines")
    if lines is None:
        lines = ET.SubElement(root, "Lines")
    existing = _find_line(root, line_num)
    if existing is not None:
        return existing

    line = ET.SubElement(
        lines,
        "Line",
        {"active": "true", "isBound": "true", "number": str(line_num), "name": name},
    )
    _ensure_line_safety(line)
    channel_type, options, trans_mode = _line_channel_spec(transport, generator, config)
    channel = ET.SubElement(line, "Channel", {"type": channel_type, "driver": "DrvCnlBasic"})
    _channel_options(channel, options)
    custom = ET.SubElement(line, "CustomOptions")
    ET.SubElement(custom, "Option", {"name": "TransMode", "value": trans_mode})
    ET.SubElement(line, "DevicePolling")
    return line


def _reconcile_line_transport(line, generator: dict, config: dict) -> list[str]:
    """Reescreve deterministicamente o transporte físico de Lines não compartilhadas."""
    changes = _ensure_line_safety(line)
    desired_type, desired_options, desired_mode = _line_channel_spec(
        str(generator.get("transport") or ""), generator, config
    )
    desired_name = f"RC {generator['tag']}"
    desired_attrs = {"active": "true", "isBound": "true", "name": desired_name}
    for key, value in desired_attrs.items():
        if line.get(key) != value:
            changes.append(f"xml.line.{key}:{line.get(key)!r}->{value!r}")
            line.set(key, value)

    channels = line.findall("Channel")
    channel = channels[0] if channels else None
    if channel is None:
        channel = ET.SubElement(line, "Channel")
        changes.append("xml.channel:add")
    for extra in channels[1:]:
        line.remove(extra)
        changes.append("xml.channel:remove-extra")

    desired_driver = "DrvCnlBasic"
    if channel.get("type") != desired_type:
        changes.append(f"xml.channel.type:{channel.get('type')!r}->{desired_type!r}")
        channel.set("type", desired_type)
    if channel.get("driver") != desired_driver:
        changes.append(f"xml.channel.driver:{channel.get('driver')!r}->{desired_driver!r}")
        channel.set("driver", desired_driver)

    current_options = {
        str(option.get("name") or ""): str(option.get("value") or "")
        for option in channel.findall("Option")
    }
    desired_text = {str(key): str(value) for key, value in desired_options.items()}
    if current_options != desired_text or len(channel.findall("Option")) != len(desired_text):
        changes.append("xml.channel.options:reconciled")
        for option in list(channel.findall("Option")):
            channel.remove(option)
        _channel_options(channel, desired_options)

    custom = line.find("CustomOptions")
    if custom is None:
        custom = ET.SubElement(line, "CustomOptions")
        changes.append("xml.custom-options:add")
    trans_options = [
        option for option in custom.findall("Option") if option.get("name") == "TransMode"
    ]
    trans = trans_options[0] if trans_options else None
    if trans is None:
        trans = ET.SubElement(custom, "Option", {"name": "TransMode", "value": desired_mode})
        changes.append("xml.transmode:add")
    elif trans.get("value") != desired_mode:
        changes.append(f"xml.transmode:{trans.get('value')!r}->{desired_mode!r}")
        trans.set("value", desired_mode)
    for extra in trans_options[1:]:
        custom.remove(extra)
        changes.append("xml.transmode:remove-extra")

    if line.find("DevicePolling") is None:
        ET.SubElement(line, "DevicePolling")
        changes.append("xml.device-polling:add")
    return changes


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
    _ensure_line_safety(line)
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


def _reconcile_device_on_line(
    line,
    device_num: int,
    generator: dict,
    template_name: str,
    config: dict,
) -> list[str]:
    polling = line.find("DevicePolling")
    if polling is None:
        polling = ET.SubElement(line, "DevicePolling")
    device = next(
        (dev for dev in polling.findall("Device") if int(dev.get("number") or 0) == device_num),
        None,
    )
    if device is None:
        raise ValueError(f"Device {device_num} não existe na Line materializada")
    desired = {
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
    }
    changes = []
    for key, value in desired.items():
        if device.get(key) != value:
            changes.append(f"xml.device.{key}:{device.get(key)!r}->{value!r}")
            device.set(key, value)
    return changes


def _binding_identity_matches(binding: dict, generator: dict) -> bool:
    requested_device = int(generator.get("rapid_device_num") or 0)
    same = (
        str(binding.get("controller_type") or "").upper()
        == str(generator.get("controller_type") or "").upper()
        and str(binding.get("controller_model") or "").strip().lower()
        == str(generator.get("controller_model") or "").strip().lower()
        and str(binding.get("transport") or "") == str(generator.get("transport") or "")
        and int(binding.get("listen_port") or 0) == int(generator.get("listen_port") or 0)
        and int(binding.get("modbus_unit") or 0) == int(generator.get("modbus_unit") or 1)
    )
    if requested_device > 0:
        same = same and int(binding.get("rapid_device_num") or 0) == requested_device
    if generator.get("transport") != "reverse_tcp":
        same = same and str(binding.get("host") or "").strip() == str(generator.get("host") or "").strip()
    return same


def _canonical_identity_matches(binding: dict, generator: dict) -> bool:
    return not binding.get("generator_id") and _binding_identity_matches(binding, generator)


def _ensure_unique_reverse_identity(generator: dict):
    if generator.get("transport") != "reverse_tcp":
        return
    port = int(generator.get("listen_port") or 0)
    unit = int(generator.get("modbus_unit") or 1)
    conflict = next(
        (
            item
            for item in db.list_generators()
            if item["id"] != generator["id"]
            and item.get("transport") == "reverse_tcp"
            and int(item.get("listen_port") or 0) == port
            and int(item.get("modbus_unit") or 1) == unit
        ),
        None,
    )
    if conflict:
        raise ValueError(
            f"Porta reverse TCP {port} / Unit ID {unit} já pertence ao gerador "
            f"{conflict.get('tag') or conflict['id']}"
        )


def _channel_row(generator: dict, pack: dict, device_num: int, spec: dict, cnl: int) -> dict:
    key = spec["key"]
    return {
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
    }


def _restore_services(service_state: dict[str, bool] | None, mutation_failed: bool) -> None:
    if service_state is None:
        return
    try:
        restore_after_mutation(service_state)
    except Exception as exc:
        if not mutation_failed:
            raise
        print(
            json.dumps(
                {"warning": "falha ao restaurar serviços após rollback", "error": str(exc)},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )


def _reconcile_existing(
    binding: dict,
    bindings: list[dict],
    generator: dict,
    pack: dict,
    config: dict,
    template_src: Path,
    restart: bool,
):
    line_num = int(binding["rapid_line_num"])
    device_num = int(binding["rapid_device_num"])
    template_dst = SCADA / "ScadaComm/Config" / template_src.name
    runtime_existed = RUNTIME_BINDINGS.exists()
    template_existed = template_dst.exists()
    backup = _backup(
        [DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG, RUNTIME_BINDINGS, template_dst]
    )
    service_state: dict[str, bool] | None = None
    mutation_failed = False
    changes: list[str] = []

    try:
        if restart:
            service_state = stop_for_mutation()
        else:
            ensure_stopped_for_mutation()

        if not template_dst.exists() or template_dst.read_bytes() != template_src.read_bytes():
            shutil.copy2(template_src, template_dst)
            changes.append(f"template:{template_src.name}")

        tree = ET.parse(CFG)
        root = tree.getroot()
        if generator.get("transport") == "reverse_tcp":
            line = _validate_shared_reverse_line(root, binding, generator)
        else:
            line = _find_line(root, line_num)
            if line is None:
                raise ValueError(f"Line {line_num} não existe no ScadaCommConfig.xml")
            changes.extend(_reconcile_line_transport(line, generator, config))

        device_patch = {
            "Name": generator.get("name") or generator["tag"],
            "Code": generator["tag"],
            "NumAddress": int(generator.get("modbus_unit") or 1),
            "StrAddress": "",
            "CommLineNum": line_num,
            "Descr": f"{pack.get('manufacturer')} {pack.get('model')}",
        }
        device_update = update_row(str(DAT / "device.dat"), "DeviceNum", device_num, device_patch)
        if device_update["status"] == "updated":
            for key in device_update["changed"]:
                changes.append(f"device.dat.{key}")

        changes.extend(
            _reconcile_device_on_line(line, device_num, generator, template_src.name, config)
        )

        rapid = pack.get("rapid") or {}
        channel_specs = rapid.get("channels") or []
        old_channels = dict(binding.get("channels") or {})
        desired_channels: dict[str, dict] = {}
        next_cnl = _max_pk(DAT / "cnl.dat", "CnlNum", 1999) + 1

        for spec in channel_specs:
            key = spec["key"]
            previous = old_channels.get(key) or {}
            cnl = int(previous.get("cnl") or 0)
            desired_row = _channel_row(generator, pack, device_num, spec, cnl or next_cnl)
            if cnl <= 0:
                cnl = next_cnl
                next_cnl += 1
                desired_row["CnlNum"] = cnl
                append_row(str(DAT / "cnl.dat"), "CnlNum", desired_row)
                changes.append(f"channel.add:{key}@{cnl}")
            else:
                existing_row = _row_by_pk(DAT / "cnl.dat", "CnlNum", cnl)
                desired_row["CnlNum"] = cnl
                if existing_row is None:
                    append_row(str(DAT / "cnl.dat"), "CnlNum", desired_row)
                    changes.append(f"channel.restore:{key}@{cnl}")
                else:
                    owner = int(existing_row.get("DeviceNum") or 0)
                    if owner not in {0, device_num}:
                        raise ValueError(
                            f"CnlNum {cnl} de {key} pertence ao Device {owner}, esperado {device_num}; "
                            "reconciliação bloqueada para não cruzar telemetria entre geradores"
                        )
                    patch = {
                        "Active": True,
                        "Name": desired_row["Name"],
                        "Code": desired_row["Code"],
                        "CnlTypeID": 1,
                        "DeviceNum": device_num,
                        "TagCode": desired_row["TagCode"],
                    }
                    result = update_row(str(DAT / "cnl.dat"), "CnlNum", cnl, patch)
                    if result["status"] == "updated":
                        changes.append(f"channel.update:{key}@{cnl}")
            desired_channels[key] = {"cnl": cnl, "scale": float(spec.get("scale", 1.0))}

        orphaned = {
            key: value for key, value in old_channels.items() if key not in desired_channels
        }
        if orphaned:
            changes.extend(
                f"channel.orphaned:{key}@{value.get('cnl')}"
                for key, value in sorted(orphaned.items())
            )

        ET.indent(tree, space="  ")
        tree.write(CFG, encoding="utf-8", xml_declaration=True)
        ET.parse(CFG)
        ET.parse(template_dst)
        read_table(str(DAT / "commline.dat"))
        read_table(str(DAT / "device.dat"))
        read_table(str(DAT / "cnl.dat"))

        binding.update(
            {
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
                "pack_id": pack.get("packId"),
                "pack_schema": int(pack.get("schema") or 1),
                "channels": desired_channels,
                "orphaned_channels": orphaned,
                "reconciled_at": int(time.time()),
            }
        )
        _save_bindings(bindings)
        db.update_generator(
            generator["id"], {"rapid_device_num": device_num}, actor="rapid-provisioner"
        )
        db.add_audit(
            "rapid-provisioner",
            "reconcile",
            "generator",
            generator["id"],
            f"line={line_num};device={device_num};changes={len(changes)};backup={backup}",
        )
    except Exception:
        mutation_failed = True
        _restore_backup(
            backup,
            [
                ("commline.dat", DAT / "commline.dat"),
                ("device.dat", DAT / "device.dat"),
                ("cnl.dat", DAT / "cnl.dat"),
                ("ScadaCommConfig.xml", CFG),
                (RUNTIME_BINDINGS.name, RUNTIME_BINDINGS),
                (template_dst.name, template_dst),
            ],
            runtime_existed,
            template_existed,
            template_dst,
        )
        raise
    finally:
        if restart:
            _restore_services(service_state, mutation_failed)

    return {
        "ok": True,
        "existing": True,
        "reconciled": True,
        "changes": changes,
        "binding": binding,
        "backup": str(backup),
    }


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
    _ensure_unique_reverse_identity(generator)

    required = [DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG, BASE / template_rel]
    for path in required:
        if not path.exists():
            raise FileNotFoundError(path)

    template_src = BASE / template_rel
    bindings = _load_bindings()
    existing = next(
        (b for b in bindings if str(b.get("generator_id") or "") == generator["id"]),
        None,
    )
    if existing:
        if not _binding_identity_matches(existing, generator):
            raise ValueError(
                "Binding Rapid existente diverge do cadastro atual do gerador. "
                "Reprovisione de forma controlada antes de continuar; o provisionador não reutiliza identidade industrial divergente."
            )
        if not _binding_is_materialized(existing):
            raise ValueError(
                "Binding Rapid existe no runtime, mas Line/Device correspondentes não existem no Rapid SCADA"
            )
        return _reconcile_existing(
            existing, bindings, generator, pack, config, template_src, restart
        )

    existing = next((b for b in bindings if _canonical_identity_matches(b, generator)), None)
    if existing:
        if not _binding_is_materialized(existing):
            raise ValueError(
                "Binding canônico coincide com o cadastro, mas não está materializado no Rapid SCADA"
            )
        existing.update(
            {
                "generator_id": generator["id"],
                "tag": generator["tag"],
                "transport": generator.get("transport"),
                "host": generator.get("host") or "",
            }
        )
        return _reconcile_existing(
            existing, bindings, generator, pack, config, template_src, restart
        )

    shared = None
    if generator["transport"] == "reverse_tcp":
        same_port = [
            b
            for b in bindings
            if b.get("transport") == "reverse_tcp"
            and int(b.get("listen_port") or 0) == int(generator.get("listen_port") or 0)
        ]
        unit_conflict = next(
            (
                b
                for b in same_port
                if int(b.get("modbus_unit") or 0) == int(generator.get("modbus_unit") or 1)
            ),
            None,
        )
        if unit_conflict:
            raise ValueError(
                f"Porta reverse TCP {generator['listen_port']} já possui Unit ID {generator.get('modbus_unit') or 1} "
                f"no gerador {unit_conflict.get('tag') or unit_conflict.get('generator_id')}"
            )
        shared = next((b for b in same_port if b.get("rapid_line_num")), None)

    line_num = (
        int(shared["rapid_line_num"])
        if shared
        else _max_pk(DAT / "commline.dat", "CommLineNum", 99) + 1
    )
    requested_device = int(generator.get("rapid_device_num") or 0)
    device_num = (
        requested_device
        if requested_device > 0
        else _max_pk(DAT / "device.dat", "DeviceNum", 199) + 1
    )
    first_cnl = _max_pk(DAT / "cnl.dat", "CnlNum", 1999) + 1

    device_existing = _row_by_pk(DAT / "device.dat", "DeviceNum", device_num)
    if device_existing:
        raise ValueError(
            f"Rapid Device {device_num} já existe no BaseDAT; escolha outro número ou deixe automático"
        )

    template_dst = SCADA / "ScadaComm/Config" / template_src.name
    runtime_existed = RUNTIME_BINDINGS.exists()
    template_existed = template_dst.exists()
    backup = _backup(
        [DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG, RUNTIME_BINDINGS, template_dst]
    )

    service_state: dict[str, bool] | None = None
    mutation_failed = False
    binding = None
    try:
        if restart:
            service_state = stop_for_mutation()
        else:
            ensure_stopped_for_mutation()
        shutil.copy2(template_src, template_dst)

        tree = ET.parse(CFG)
        root = tree.getroot()
        if shared:
            line = _validate_shared_reverse_line(root, shared, generator)
        else:
            append_row(
                str(DAT / "commline.dat"),
                "CommLineNum",
                {
                    "CommLineNum": line_num,
                    "Name": f"RC {generator['tag']}",
                    "Descr": f"{generator['transport']} {generator.get('host') or ''}:{generator.get('listen_port') or ''}",
                },
            )
            line = _find_or_create_line(
                root,
                line_num,
                f"RC {generator['tag']}",
                generator["transport"],
                generator,
                config,
            )

        append_row(
            str(DAT / "device.dat"),
            "DeviceNum",
            {
                "DeviceNum": device_num,
                "Name": generator.get("name") or generator["tag"],
                "Code": generator["tag"],
                "DevTypeID": None,
                "NumAddress": int(generator.get("modbus_unit") or 1),
                "StrAddress": "",
                "CommLineNum": line_num,
                "Descr": f"{pack.get('manufacturer')} {pack.get('model')}",
            },
        )

        channels = {}
        for index, spec in enumerate(channel_specs):
            cnl = first_cnl + index
            key = spec["key"]
            append_row(
                str(DAT / "cnl.dat"),
                "CnlNum",
                _channel_row(generator, pack, device_num, spec, cnl),
            )
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
            "pack_id": pack.get("packId"),
            "pack_schema": int(pack.get("schema") or 1),
            "channels": channels,
            "orphaned_channels": {},
            "reconciled_at": int(time.time()),
        }
        bindings.append(binding)
        _save_bindings(bindings)
        db.update_generator(
            generator["id"], {"rapid_device_num": device_num}, actor="rapid-provisioner"
        )
        db.add_audit(
            "rapid-provisioner",
            "provision",
            "generator",
            generator["id"],
            f"line={line_num};device={device_num};transport={generator['transport']}",
        )
    except Exception:
        mutation_failed = True
        _restore_backup(
            backup,
            [
                ("commline.dat", DAT / "commline.dat"),
                ("device.dat", DAT / "device.dat"),
                ("cnl.dat", DAT / "cnl.dat"),
                ("ScadaCommConfig.xml", CFG),
                (RUNTIME_BINDINGS.name, RUNTIME_BINDINGS),
                (template_dst.name, template_dst),
            ],
            runtime_existed,
            template_existed,
            template_dst,
        )
        raise
    finally:
        if restart:
            _restore_services(service_state, mutation_failed)

    return {
        "ok": True,
        "existing": False,
        "reconciled": True,
        "changes": ["initial-provision"],
        "binding": binding,
        "backup": str(backup),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("generator_id")
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    print(
        json.dumps(
            provision(args.generator_id, restart=not args.no_restart),
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
