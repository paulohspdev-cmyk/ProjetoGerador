#!/usr/bin/env python3
"""Retira um gerador da configuração ativa do Rapid SCADA com preservação histórica.

O deprovisionamento é deliberadamente conservador:
- exige root e um cadastro de gerador existente;
- faz backup antes de qualquer alteração;
- desativa canais no cnl.dat, mas NÃO os apaga nem renumera;
- remove apenas o Device ativo e a Line se ela ficar sem Devices;
- arquiva o binding retirado para rastreabilidade;
- possui rollback dos arquivos alterados;
- não envia nenhum comando industrial ao controlador.
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
RETIRED_BINDINGS = Path(os.environ.get("RC_RAPID_RETIRED_BINDINGS", "/var/lib/rc-geradores/rapid-retired-bindings.json"))

sys.path.insert(0, str(BASE / "backend"))
sys.path.insert(0, str(BASE / "rapid/provisioning"))

from app import db  # noqa: E402
from rapid_dat import delete_row, read_table, update_row  # noqa: E402
from provision_generator import (  # noqa: E402
    _backup,
    _find_line,
    _load_bindings,
    _restore_backup,
    _save_bindings,
)


def _load_retired() -> list[dict]:
    if not RETIRED_BINDINGS.exists():
        return []
    try:
        value = json.loads(RETIRED_BINDINGS.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except Exception:
        return []


def _save_retired(items: list[dict]) -> None:
    RETIRED_BINDINGS.parent.mkdir(parents=True, exist_ok=True)
    tmp = RETIRED_BINDINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with tmp.open("rb") as fh:
        os.fsync(fh.fileno())
    os.replace(tmp, RETIRED_BINDINGS)


def _all_bound_channels(binding: dict) -> dict[str, dict]:
    values: dict[str, dict] = {}
    for source in (binding.get("channels") or {}, binding.get("orphaned_channels") or {}):
        if not isinstance(source, dict):
            continue
        for key, cfg in source.items():
            if isinstance(cfg, dict) and int(cfg.get("cnl") or 0) > 0:
                values[str(key)] = cfg
    return values


def _clear_generator_rapid_device(generator_id: str) -> None:
    now = int(time.time())
    with db.connect() as conn:
        conn.execute("UPDATE generators SET rapid_device_num=NULL, updated_at=? WHERE id=?", (now, generator_id))


def deprovision(generator_id: str, restart: bool = True) -> dict:
    if os.geteuid() != 0:
        raise PermissionError("Deprovisionamento do Rapid SCADA exige root")
    db.init_db()
    generator = db.get_generator(generator_id)
    if not generator:
        raise ValueError("Gerador não encontrado")

    bindings = _load_bindings()
    binding = next((item for item in bindings if str(item.get("generator_id") or "") == generator["id"]), None)
    if not binding:
        _clear_generator_rapid_device(generator["id"])
        return {"ok": True, "existing": False, "deprovisioned": False, "reason": "binding ativo inexistente"}

    line_num = int(binding.get("rapid_line_num") or 0)
    device_num = int(binding.get("rapid_device_num") or 0)
    if line_num <= 0 or device_num <= 0:
        raise ValueError("Binding ativo possui identidade Rapid inválida")

    required = [DAT / "commline.dat", DAT / "device.dat", DAT / "cnl.dat", CFG]
    for path in required:
        if not path.exists():
            raise FileNotFoundError(path)

    retired_existed = RETIRED_BINDINGS.exists()
    runtime_existed = RUNTIME_BINDINGS.exists()
    backup = _backup([*required, RUNTIME_BINDINGS, RETIRED_BINDINGS])
    services_stopped = False
    changes: list[str] = []

    try:
        subprocess.run(["systemctl", "stop", "scadacomm6.service"], check=False)
        subprocess.run(["systemctl", "stop", "scadaserver6.service"], check=False)
        services_stopped = True

        for key, cfg in _all_bound_channels(binding).items():
            cnl = int(cfg.get("cnl") or 0)
            _, channel_rows = read_table(str(DAT / "cnl.dat"))
            row = next((item for item in channel_rows if int(item.get("CnlNum") or 0) == cnl), None)
            if row is None:
                changes.append(f"channel.absent:{key}@{cnl}")
                continue
            result = update_row(str(DAT / "cnl.dat"), "CnlNum", cnl, {"Active": False})
            if result["status"] == "updated":
                changes.append(f"channel.disabled:{key}@{cnl}")

        tree = ET.parse(CFG)
        root = tree.getroot()
        line = _find_line(root, line_num)
        line_removed = False
        if line is not None:
            polling = line.find("DevicePolling")
            if polling is not None:
                for dev in list(polling.findall("Device")):
                    if int(dev.get("number") or 0) == device_num:
                        polling.remove(dev)
                        changes.append(f"xml.device.removed:{device_num}")
                if not polling.findall("Device"):
                    lines = root.find("Lines")
                    if lines is not None:
                        lines.remove(line)
                        line_removed = True
                        changes.append(f"xml.line.removed:{line_num}")

        device_result = delete_row(str(DAT / "device.dat"), "DeviceNum", device_num)
        if device_result["status"] == "deleted":
            changes.append(f"device.dat.removed:{device_num}")

        if line_removed:
            line_result = delete_row(str(DAT / "commline.dat"), "CommLineNum", line_num)
            if line_result["status"] == "deleted":
                changes.append(f"commline.dat.removed:{line_num}")

        ET.indent(tree, space="  ")
        tree.write(CFG, encoding="utf-8", xml_declaration=True)
        ET.parse(CFG)
        read_table(str(DAT / "commline.dat"))
        read_table(str(DAT / "device.dat"))
        read_table(str(DAT / "cnl.dat"))

        active = [item for item in bindings if item is not binding]
        retired = _load_retired()
        archived = {
            **binding,
            "retired_at": int(time.time()),
            "retired_reason": "operator_deprovision",
            "retired_channels_preserved": True,
        }
        retired.append(archived)
        _save_bindings(active)
        _save_retired(retired)
        _clear_generator_rapid_device(generator["id"])
        db.add_audit(
            "rapid-provisioner",
            "deprovision",
            "generator",
            generator["id"],
            f"line={line_num};device={device_num};channels_preserved=true;backup={backup}",
        )
    except Exception:
        _restore_backup(
            backup,
            [
                ("commline.dat", DAT / "commline.dat"),
                ("device.dat", DAT / "device.dat"),
                ("cnl.dat", DAT / "cnl.dat"),
                ("ScadaCommConfig.xml", CFG),
                (RUNTIME_BINDINGS.name, RUNTIME_BINDINGS),
                (RETIRED_BINDINGS.name, RETIRED_BINDINGS),
            ],
            runtime_existed,
            True,
            CFG,
        )
        if not retired_existed:
            RETIRED_BINDINGS.unlink(missing_ok=True)
        raise
    finally:
        if restart and services_stopped:
            subprocess.run(["systemctl", "start", "scadaserver6.service"], check=False)
            time.sleep(2)
            subprocess.run(["systemctl", "restart", "scadacomm6.service"], check=False)

    return {
        "ok": True,
        "existing": True,
        "deprovisioned": True,
        "changes": changes,
        "retiredBinding": str(RETIRED_BINDINGS),
        "backup": str(backup),
        "historyPreserved": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("generator_id")
    parser.add_argument("--no-restart", action="store_true")
    args = parser.parse_args()
    print(json.dumps(deprovision(args.generator_id, restart=not args.no_restart), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
