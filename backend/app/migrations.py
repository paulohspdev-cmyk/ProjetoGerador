"""Migrações versionadas do banco RC Geradores.

Os módulos de store continuam responsáveis por criar uma instalação vazia de forma
idempotente. Este módulo registra e valida a versão do schema depois que todos os
stores foram inicializados. Novas mudanças destrutivas/estruturais devem entrar
como funções versionadas aqui, nunca como ALTER ad-hoc em deploy.
"""

import time

from . import db

LATEST_SCHEMA_VERSION = 3

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


def _operator_role_v2(conn) -> None:
    """Alinha o CHECK de users.role ao RBAC que já expõe o papel operador."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    schema = str(row[0] or "") if row else ""
    if "'operador'" in schema:
        return

    # Não renomeamos a tabela original: as FKs filhas continuam apontando para
    # "users". Com foreign_keys temporariamente desligado, a troca é atômica no
    # mesmo arquivo e validada antes de reativar o enforcement.
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.executescript(
            """
            BEGIN IMMEDIATE;
            CREATE TABLE users_v2 (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('administrador','operador','cadastro','visualizacao')),
                active INTEGER NOT NULL DEFAULT 1,
                last_access INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO users_v2(
                id,name,email,password_hash,role,active,last_access,created_at,updated_at
            )
            SELECT id,name,email,password_hash,role,active,last_access,created_at,updated_at
            FROM users;
            DROP TABLE users;
            ALTER TABLE users_v2 RENAME TO users;
            COMMIT;
            """
        )
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")

    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        preview = "; ".join(str(tuple(item)) for item in violations[:20])
        raise RuntimeError("Migração v2 deixou FKs inválidas: " + preview)


def _generator_nominal_power_v3(conn) -> None:
    """Adiciona rating cadastral opcional sem inferir valor por modelo/nome."""
    columns = {
        str(row[1])
        for row in conn.execute("PRAGMA table_info(generators)").fetchall()
    }
    if "nominal_power_kw" in columns:
        return
    conn.execute("ALTER TABLE generators ADD COLUMN nominal_power_kw REAL")


_MIGRATIONS = {
    1: _baseline_v1,
    2: _operator_role_v2,
    3: _generator_nominal_power_v3,
}


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

            # Algumas migrações estruturais precisam alterar PRAGMA foreign_keys.
            # O SQLite ignora essa alteração dentro de uma transação aberta; por
            # isso nunca carregamos uma transação da versão anterior para a próxima.
            conn.commit()
            try:
                migration(conn)
                conn.execute(
                    "INSERT INTO schema_migrations(version,applied_at,description) VALUES (?,?,?)",
                    (version, int(time.time()), f"RC Geradores schema v{version}"),
                )
                conn.commit()
            except Exception:
                if conn.in_transaction:
                    conn.rollback()
                raise
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
