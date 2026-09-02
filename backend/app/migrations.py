"""Migrações versionadas do banco RC Geradores.

Os módulos de store continuam responsáveis por criar uma instalação vazia de forma
idempotente. Este módulo registra e valida a versão do schema depois que todos os
stores foram inicializados. Novas mudanças destrutivas/estruturais devem entrar
como funções versionadas aqui, nunca como ALTER ad-hoc em deploy.
"""

import time

from . import db

LATEST_SCHEMA_VERSION = 1

_REQUIRED_BASELINE_TABLES = {
    "generators",
    "users",
    "sessions",
    "audit_log",
    "assets",
    "controller_instances",
    "controller_connections",
    "generator_transport_config",
}


def _baseline_v1(conn) -> None:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    present = {str(row[0]) for row in rows}
    missing = sorted(_REQUIRED_BASELINE_TABLES - present)
    if missing:
        raise RuntimeError("Schema base incompleto; tabelas ausentes: " + ", ".join(missing))


_MIGRATIONS = {1: _baseline_v1}


def run_migrations() -> int:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations(
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL,
                description TEXT NOT NULL
            )"""
        )
        row = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
        current = int(row[0] or 0)
        if current > LATEST_SCHEMA_VERSION:
            raise RuntimeError(
                f"Banco está no schema {current}, mas este release suporta até {LATEST_SCHEMA_VERSION}"
            )
        for version in range(current + 1, LATEST_SCHEMA_VERSION + 1):
            migration = _MIGRATIONS.get(version)
            if migration is None:
                raise RuntimeError(f"Migração {version} não implementada")
            migration(conn)
            conn.execute(
                "INSERT INTO schema_migrations(version,applied_at,description) VALUES (?,?,?)",
                (version, int(time.time()), f"RC Geradores schema v{version}"),
            )
        conn.execute(f"PRAGMA user_version={LATEST_SCHEMA_VERSION}")
    return LATEST_SCHEMA_VERSION


def current_schema_version() -> int:
    with db.connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).fetchone()
        if not exists:
            return 0
        row = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
        return int(row[0] or 0)
