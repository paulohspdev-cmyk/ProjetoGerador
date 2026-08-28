#!/usr/bin/env python3
import argparse

from app import db


def main() -> int:
    parser = argparse.ArgumentParser(description="Cadastra o primeiro InteliGen 200 homologado")
    parser.add_argument("--tag", default="GEN001")
    parser.add_argument("--name", default="Gerador 01")
    parser.add_argument("--site", default="Principal")
    parser.add_argument("--customer", default="")
    args = parser.parse_args()

    db.init_db()
    current = db.get_generator(args.tag)
    if current:
        print(
            f"{current['tag']} já cadastrado: porta={current['listen_port']} "
            f"unit={current['modbus_unit']} rapid={current.get('rapid_device_num')}"
        )
        return 0

    created = db.create_generator(
        {
            "tag": args.tag,
            "name": args.name,
            "customer": args.customer,
            "site": args.site,
            "controller_type": "COMAP",
            "controller_model": "InteliGen 200",
            "transport": "reverse_tcp",
            "host": "",
            "listen_port": 15001,
            "modbus_unit": 2,
            "rapid_device_num": 200,
            "enabled": True,
        },
        actor="installer",
    )
    print(
        f"IG200 cadastrado: {created['tag']} / porta 15001 / Unit 2 / Rapid Device 200"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
