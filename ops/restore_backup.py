#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
from pathlib import Path

BASE = Path("/opt/rc-geradores")
sys.path.insert(0, str(BASE / "backend"))

from app.backup_manager import restore_archive  # noqa: E402

SERVICES = [
    "rc-geradores-worker.service",
    "rc-geradores-api.service",
    "rc-geradores-frontend.service",
    "scadacomm6.service",
    "scadaserver6.service",
]


def systemctl(action: str, service: str):
    subprocess.run(["systemctl", action, service], check=False)


def main():
    parser = argparse.ArgumentParser(description="Restaura backup completo do RC Geradores")
    parser.add_argument("archive")
    parser.add_argument("--no-rapid", action="store_true", help="não restaura configuração do Rapid SCADA")
    parser.add_argument("--confirm", required=True, help="deve ser exatamente RESTORE")
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise SystemExit("Execute como root")
    if args.confirm != "RESTORE":
        raise SystemExit("Confirmação inválida. Use --confirm RESTORE")

    for svc in SERVICES:
        systemctl("stop", svc)
    try:
        result = restore_archive(args.archive, restore_rapid=not args.no_rapid)
        print(result)
    finally:
        for svc in reversed(SERVICES):
            systemctl("start", svc)


if __name__ == "__main__":
    main()
