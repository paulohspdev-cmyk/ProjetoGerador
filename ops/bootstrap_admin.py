#!/usr/bin/env python3
import argparse
import getpass
import os
import stat
import sys
from pathlib import Path

from app import db
from app.auth import hash_password


def _password_from_file(path_text: str) -> str:
    path = Path(path_text)
    try:
        info = path.stat()
    except OSError as exc:
        raise ValueError(f"não foi possível ler o arquivo de senha: {exc}") from exc
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("arquivo de senha deve ser um arquivo regular")
    if info.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise ValueError("arquivo de senha deve ser acessível somente pelo proprietário (chmod 600)")
    if os.geteuid() == 0 and info.st_uid != 0:
        raise ValueError("quando executado como root, o arquivo de senha também deve pertencer ao root")
    try:
        password = path.read_text(encoding="utf-8").splitlines()[0]
    except (OSError, IndexError) as exc:
        raise ValueError(f"arquivo de senha vazio ou ilegível: {exc}") from exc
    return password


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria o primeiro administrador RC Geradores")
    parser.add_argument("--name", default="Administrador")
    parser.add_argument("--email", default="admin@rcgeradores.local")
    parser.add_argument(
        "--password-file",
        default="",
        help="arquivo chmod 600 com a senha inicial; evita senha em argumento/variável",
    )
    args = parser.parse_args()

    db.init_db()
    if db.count_active_admins() > 0:
        print("Administrador ativo já existe; bootstrap ignorado.")
        return 0

    try:
        if args.password_file:
            password = _password_from_file(args.password_file)
        else:
            if not sys.stdin.isatty():
                print(
                    "ERRO: criação do primeiro administrador exige terminal interativo "
                    "ou --password-file com arquivo chmod 600.",
                    file=sys.stderr,
                )
                return 2
            password = getpass.getpass("Senha inicial do administrador (mín. 8 caracteres): ")
            confirm = getpass.getpass("Confirme a senha: ")
            if password != confirm:
                print("ERRO: as senhas não coincidem.", file=sys.stderr)
                return 2
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
