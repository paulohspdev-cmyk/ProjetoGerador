#!/usr/bin/env python3
"""Importa o export humano do mapa MODBUS do ComAp InteliGen 200.

O InteliGen 200 permite que a parte 0..3999 do mapa MODBUS seja configurada.
Por isso este utilitário NÃO assume endereços para telemetria ainda não validada.
Ele lê o arquivo exportado pelo InteliConfig e transforma somente objetos
reconhecidos em um relatório JSON canônico para o Controller Pack.

Uso:
  python3 ops/ig200_import_modbus_map.py MODBUS.txt --output /tmp/ig200-map.json

O relatório não altera Rapid SCADA, banco, bridge ou controlador.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


TARGETS = {
    "rpm": (r"\brpm\b|\bengine\s*speed\b", "RPM"),
    "frequency": (r"\bgenerator\s+frequency\b|\bgen(?:erator)?\s*freq(?:uency)?\b|\bgfrq\b", "Frequência do gerador"),
    "voltage_l1": (r"\bgenerator\s+voltage\s+l1[- ]n\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l1[- ]n\b", "Tensão gerador L1-N"),
    "voltage_l2": (r"\bgenerator\s+voltage\s+l2[- ]n\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l2[- ]n\b", "Tensão gerador L2-N"),
    "voltage_l3": (r"\bgenerator\s+voltage\s+l3[- ]n\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l3[- ]n\b", "Tensão gerador L3-N"),
    "voltage_l1_l2": (r"\bgenerator\s+voltage\s+l1[- ]l2\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l1[- ]l2\b", "Tensão gerador L1-L2"),
    "voltage_l2_l3": (r"\bgenerator\s+voltage\s+l2[- ]l3\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l2[- ]l3\b", "Tensão gerador L2-L3"),
    "voltage_l3_l1": (r"\bgenerator\s+voltage\s+l3[- ]l1\b|\bgen(?:erator)?\s+v(?:oltage)?\s+l3[- ]l1\b", "Tensão gerador L3-L1"),
    "mains_frequency": (r"\bmains\s+frequency\b|\bmains\s*freq\b|\bmfrq\b", "Frequência da rede"),
    "mains_voltage_l1": (r"\bmains\s+voltage\s+l1[- ]n\b|\bmains\s+v(?:oltage)?\s+l1[- ]n\b", "Tensão rede L1-N"),
    "mains_voltage_l2": (r"\bmains\s+voltage\s+l2[- ]n\b|\bmains\s+v(?:oltage)?\s+l2[- ]n\b", "Tensão rede L2-N"),
    "mains_voltage_l3": (r"\bmains\s+voltage\s+l3[- ]n\b|\bmains\s+v(?:oltage)?\s+l3[- ]n\b", "Tensão rede L3-N"),
    "mains_voltage_l1_l2": (r"\bmains\s+voltage\s+l1[- ]l2\b|\bmains\s+v(?:oltage)?\s+l1[- ]l2\b", "Tensão rede L1-L2"),
    "mains_voltage_l2_l3": (r"\bmains\s+voltage\s+l2[- ]l3\b|\bmains\s+v(?:oltage)?\s+l2[- ]l3\b", "Tensão rede L2-L3"),
    "mains_voltage_l3_l1": (r"\bmains\s+voltage\s+l3[- ]l1\b|\bmains\s+v(?:oltage)?\s+l3[- ]l1\b", "Tensão rede L3-L1"),
    "power_kw": (r"\bgenerator\s+active\s+power\b|\bgen(?:erator)?\s+(?:active\s+)?power\b|\bload\s+p\b|\bact\s+power\b", "Potência ativa"),
    "oil_pressure": (r"\boil\s+press(?:ure)?\b|\bp[- ]?oil\b", "Pressão de óleo"),
    "coolant_temperature": (r"\bcoolant\s+temp(?:erature)?\b|\bt[- ]?coolant\b", "Temperatura do líquido de arrefecimento"),
    "fuel_level": (r"\bfuel\s+level\b", "Nível de combustível"),
    "battery_voltage": (r"\bbattery\s*(?:voltage|volts?)\b|\bbatteryvoltage\b|\bvbat\b", "Tensão da bateria"),
    "alternator_voltage": (r"(?:^|\s)d\+(?:\s|$)|\balternator\s+voltage\b", "D+/alternador"),
    "run_hours": (r"\brun(?:ning)?\s+hours\b|\bengine\s*run\s*hours\b", "Horas de funcionamento"),
    "alarm_count": (r"\bnum(?:ber)?\s+(?:of\s+)?items?\s+alarm(?:list|\s+list)\b|\balarm\s+count\b", "Quantidade de alarmes"),
    "controller_mode_raw": (r"\bcontroller\s+mode\b", "Modo do controlador"),
    "gcb_closed": (r"\bgcb\s+feedback\b", "Feedback GCB"),
    "mcb_closed": (r"\bmcb\s+feedback\b", "Feedback MCB"),
}

UI_METRICS = [
    "oil_pressure",
    "coolant_temperature",
    "fuel_level",
    "battery_voltage",
    "alternator_voltage",
    "run_hours",
    "power_kw",
    "alarm_count",
    "controller_mode_raw",
    "gcb_closed",
    "mcb_closed",
    "mains_frequency",
    "mains_voltage_l1",
    "mains_voltage_l2",
    "mains_voltage_l3",
    "mains_voltage_l1_l2",
    "mains_voltage_l2_l3",
    "mains_voltage_l3_l1",
]


def normalize(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\t", " ").replace(";", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_address(line: str):
    match = re.match(r"^\s*0*(\d{1,5})(?:\s*-\s*0*(\d{1,5}))?\b", line)
    if not match:
        return None
    start = int(match.group(1))
    end = int(match.group(2) or start)
    if start < 0 or end < start or end > 7167:
        return None
    return start, end


def infer_decimal_scale(line: str) -> float:
    match = re.search(
        r"\b(?:u?int(?:eger)?(?:16|32)?|unsigned(?:16|32)?|integer(?:16|32)?)\s+(?:2|4|8)\s+(-?\d+)\b",
        line,
        re.IGNORECASE,
    )
    if not match:
        return 1.0
    decimals = int(match.group(1))
    if decimals < 0 or decimals > 6:
        return 1.0
    return 10 ** (-decimals)


def infer_kind(address: int) -> tuple[str, int]:
    if 0 <= address <= 999:
        return "discrete", 2
    if 1000 <= address <= 2999:
        return "register", 3
    if 3000 <= address <= 3999:
        return "setpoint", 3
    return "reserved", 3


def detect_metric(line: str):
    lowered = line.lower()
    matches = []
    for key, (pattern, label) in TARGETS.items():
        if re.search(pattern, lowered, re.IGNORECASE):
            matches.append((key, label))
    return matches


def parse_export(text: str) -> dict:
    found: dict[str, dict] = {}
    ambiguous = []
    duplicate = []

    for number, raw in enumerate(text.splitlines(), 1):
        line = normalize(raw)
        if not line:
            continue
        address = parse_address(line)
        if not address:
            continue
        matches = detect_metric(line)
        if not matches:
            continue
        if len(matches) != 1:
            ambiguous.append({"line": number, "text": line, "matches": [item[0] for item in matches]})
            continue

        key, label = matches[0]
        start, end = address
        kind, function = infer_kind(start)
        item = {
            "key": key,
            "label": label,
            "address": start,
            "endAddress": end,
            "registerCount": end - start + 1,
            "kind": kind,
            "readFunction": function,
            "scale": infer_decimal_scale(line),
            "sourceLine": number,
            "sourceText": line,
        }

        if key in found and found[key]["address"] != start:
            duplicate.append({"key": key, "first": found[key], "second": item})
            continue
        found[key] = item

    missing_ui = [key for key in UI_METRICS if key not in found]
    return {
        "schema": 1,
        "controller": "ComAp InteliGen 200",
        "safeReadOnly": True,
        "metrics": found,
        "missingUiMetrics": missing_ui,
        "ambiguousLines": ambiguous,
        "duplicateMappings": duplicate,
        "readyForReview": not ambiguous and not duplicate,
    }


def self_test() -> None:
    sample = """
01053 8213 BatteryVoltage V Integer 2 1 0 400 Controller I/O
00000 Value 8235 Binary Inputs 1 GCB Feedback Controller I/O
00001 Value 8235 Binary Inputs 2 MCB Feedback Controller I/O
01008 9151 P-Oil bar Integer 2 1 0 100 Controller I/O
01006 9152 T-Coolant C Integer 2 0 0 150 Controller I/O
01055 9153 Fuel Level % Integer 2 0 0 100 Controller I/O
01013-01014 8206 Running Hours h Integer32 4 1 0 999999 Statistics
01020 8202 Load P kW Integer 2 0 0 32767 Load
01382 9887 Controller Mode StringList 2 0 0 20 Info
"""
    result = parse_export(sample)
    metrics = result["metrics"]
    assert metrics["battery_voltage"]["address"] == 1053
    assert metrics["battery_voltage"]["scale"] == 0.1
    assert metrics["gcb_closed"]["address"] == 0
    assert metrics["gcb_closed"]["readFunction"] == 2
    assert metrics["mcb_closed"]["address"] == 1
    assert metrics["oil_pressure"]["scale"] == 0.1
    assert metrics["run_hours"]["registerCount"] == 2
    assert metrics["power_kw"]["address"] == 1020
    assert metrics["controller_mode_raw"]["address"] == 1382
    assert result["readyForReview"] is True
    print("IG200 MODBUS map importer self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa export MODBUS do InteliConfig sem alterar produção")
    parser.add_argument("input", nargs="?", help="arquivo TXT/CSV exportado pelo InteliConfig")
    parser.add_argument("--output", "-o", help="arquivo JSON de saída; sem opção imprime em stdout")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if not args.input:
        parser.error("informe o arquivo exportado pelo InteliConfig")

    source = Path(args.input)
    text = source.read_text(encoding="utf-8-sig", errors="replace")
    result = parse_export(text)
    result["sourceFile"] = source.name
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"

    if args.output:
        target = Path(args.output)
        target.write_text(payload, encoding="utf-8")
        print(target)
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
