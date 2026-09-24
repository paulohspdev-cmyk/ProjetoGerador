#!/usr/bin/env python3
"""Inicializa stores e aplica migrações versionadas antes de iniciar a API."""

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "backend"))

from app import db, domain_store, ops_store, platform_store, transport_store  # noqa: E402
from app.migrations import run_migrations  # noqa: E402


def main() -> int:
    db.init_db()
    ops_store.init_ops_db()
    platform_store.init_platform_db()
    transport_store.init_transport_db()
    domain_store.init_domain_db()
    version = run_migrations()
    print(f"RC Geradores schema pronto: v{version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
