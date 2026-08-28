#!/usr/bin/env python3
import argparse
import getpass
import sys

from app import db
from app.auth import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria o primeiro administrador RC Geradores")
    parser.add_argument("--name", default="Administrador")
    parser.add_argument("--email", default="admin@rcgeradores.local")
    args = parser.parse_args()

    db.init_db()
    if db.count_active_admins() > 0:
        print("Administrador ativo já existe; bootstrap ignorado.")
        return 0

    password = getpass.getpass("Senha inicial do administrador (mín. 8 caracteres): ")
    confirm = getpass.getpass("Confirme a senha: ")
    if password != confirm:
        print("ERRO: as senhas não coincidem.", file=sys.stderr)
        return 2
    try:
        password_hash = hash_password(password)
    except ValueError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 2

    user, created = db.bootstrap_admin(args.name, args.email, password_hash)
    if not created:
        print("ERRO: não foi possível criar o administrador inicial.", file=sys.stderr)
        return 3
    print(f"Administrador criado: {user['email']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
