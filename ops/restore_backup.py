#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
from pathlib import Path

BASE = Path("/opt/rc-geradores")
sys.path.insert(0, str(BASE / "backend"))

from app.backup_manager import (  # noqa: E402
    materialize_offsite_backup,
    restore_archive,
    safe_archive_path,
)

# Ordem de parada: primeiro processos RC que podem escrever/atuar sobre o banco,
# bindings ou Rapid; depois o próprio Rapid. A retomada ocorre na ordem inversa.
SERVICES = [
    "rc-geradores-worker.service",
    "rc-geradores-api.service",
    "rc-geradores-frontend.service",
    "rc-geradores-bridge.service",
    "rc-geradores-provision.service",
    "scadacomm6.service",
    "scadaserver6.service",
]


def systemctl(action: str, service: str, *, check: bool = False):
    return subprocess.run(
        ["systemctl", action, service],
        check=check,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def was_active(service: str) -> bool:
    return systemctl("is-active", service).returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Restaura backup completo do RC Geradores")
    parser.add_argument("archive", help=".tar.gz local ou .tar.gz.fernet off-site")
    parser.add_argument("--no-rapid", action="store_true", help="não restaura configuração do Rapid SCADA")
    parser.add_argument(
        "--offsite-key-file",
        default=None,
        help="chave Fernet externa para envelope off-site; padrão: RC_BACKUP_OFFSITE_KEY_FILE",
    )
    parser.add_argument("--confirm", required=True, help="deve ser exatamente RESTORE")
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise SystemExit("Execute como root")
    if args.confirm != "RESTORE":
        raise SystemExit("Confirmação inválida. Use --confirm RESTORE")

    # Todo decrypt/quick_check ocorre antes de tocar nos serviços.
    requested = Path(args.archive)
    if requested.name.endswith(".tar.gz.fernet"):
        archive = materialize_offsite_backup(requested, key_file=args.offsite_key_file)
        print(f"Envelope off-site autenticado e materializado em: {archive}")
    else:
        archive = safe_archive_path(requested)

    active_before = {svc: was_active(svc) for svc in SERVICES}

    for svc in SERVICES:
        if active_before[svc]:
            systemctl("stop", svc, check=True)

    restore_error: Exception | None = None
    try:
        result = restore_archive(archive, restore_rapid=not args.no_rapid)
        print(result)
    except Exception as exc:
        restore_error = exc
        raise
    finally:
        restart_errors: list[str] = []
        for svc in reversed(SERVICES):
            if not active_before[svc]:
                continue
            try:
                systemctl("start", svc, check=True)
            except subprocess.CalledProcessError:
                restart_errors.append(svc)
        if restart_errors and restore_error is None:
            raise SystemExit(
                "Restore concluído, mas falhou ao religar: " + ", ".join(restart_errors)
            )


if __name__ == "__main__":
    main()
