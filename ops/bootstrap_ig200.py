#!/usr/bin/env python3
import argparse
import os

from app import db


def _port(value: str) -> int:
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("porta deve estar entre 1 e 65535")
    return port


def _unit(value: str) -> int:
    unit = int(value)
    if not 1 <= unit <= 247:
        raise argparse.ArgumentTypeError("Modbus Unit ID deve estar entre 1 e 247")
    return unit


def _device(value: str) -> int:
    device = int(value)
    if not 1 <= device <= 2_147_483_647:
        raise argparse.ArgumentTypeError("Rapid Device deve ser um inteiro positivo")
    return device


def _control_enabled() -> bool:
    return os.environ.get("RC_ENABLE_IG200_CONTROL", "0").strip() == "1"


def _validate_control_identity(device: int) -> bool:
    if _control_enabled() and int(device) != 200:
        print(
            "ERRO: START/STOP homologado permanece restrito ao Rapid Device 200. "
            "Use outro Rapid Device apenas com controle remoto desabilitado até nova validação de campo."
        )
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Cadastra o primeiro InteliGen 200 homologado")
    parser.add_argument("--tag", default="GEN001")
    parser.add_argument("--name", default="Gerador 01")
    parser.add_argument("--site", default="Principal")
    parser.add_argument("--customer", default="")
    parser.add_argument("--port", type=_port, default=15001, help="porta TCP reversa externa")
    parser.add_argument("--unit", type=_unit, default=2, help="Modbus Unit ID")
    parser.add_argument("--rapid-device", type=_device, default=200, help="número do Device no Rapid SCADA")
    args = parser.parse_args()

    tag = args.tag.strip().upper()
    if not tag:
        parser.error("tag não pode ficar vazia")

    db.init_db()
    current = db.get_generator(tag)
    if current:
        controller_type = str(current.get("controller_type") or "").upper()
        controller_model = str(current.get("controller_model") or "").strip().lower()
        if controller_type != "COMAP" or controller_model != "inteligen 200":
            print(
                f"ERRO: {tag} já existe e não é um ComAp InteliGen 200; "
                "o instalador não altera cadastro existente automaticamente."
            )
            return 3
        current_device = int(current.get("rapid_device_num") or 0)
        if not _validate_control_identity(current_device):
            return 4
        print(
            f"{current['tag']} já cadastrado; preservando identidade atual: "
            f"porta={current['listen_port']} unit={current['modbus_unit']} "
            f"rapid={current.get('rapid_device_num')}"
        )
        return 0

    if not _validate_control_identity(args.rapid_device):
        return 4

    created = db.create_generator(
        {
            "tag": tag,
            "name": args.name.strip() or tag,
            "customer": args.customer.strip(),
            "site": args.site.strip(),
            "controller_type": "COMAP",
            "controller_model": "InteliGen 200",
            "transport": "reverse_tcp",
            "host": "",
            "listen_port": args.port,
            "modbus_unit": args.unit,
            "rapid_device_num": args.rapid_device,
            "enabled": True,
        },
        actor="installer",
    )
    print(
        f"IG200 cadastrado: {created['tag']} / porta {created['listen_port']} / "
        f"Unit {created['modbus_unit']} / Rapid Device {created.get('rapid_device_num')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
