#!/usr/bin/env python3
"""Leitor/escritor mínimo e seguro para tabelas BaseDAT do Rapid SCADA 6.x.

Usado somente para acrescentar, reconciliar ou retirar registros RC necessários.
O formato segue BaseTableAdapter do Rapid SCADA: cabeçalho v4, definições de
campo de 60 bytes, blocos 0x0E0E e CRC-16 Modbus.

Regras de segurança:
- preserva cabeçalho e definições de campo byte a byte;
- atualização substitui somente o bloco da linha selecionada;
- remoção retira somente o bloco selecionado, sem reserializar outras linhas;
- gravação é feita em arquivo temporário + os.replace;
- toda escrita é relida e validada antes de retornar.
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HEADER_SIZE = 20
FIELD_DEF_SIZE = 60
BLOCK_MARKER = 0x0E0E

TYPE_UNDEFINED = 0
TYPE_INTEGER = 1
TYPE_DOUBLE = 2
TYPE_BOOLEAN = 3
TYPE_DATETIME = 4
TYPE_STRING = 5


@dataclass
class FieldDef:
    name: str
    data_type: int
    allow_null: bool

    @property
    def fixed_size(self) -> int:
        return {
            TYPE_INTEGER: 4,
            TYPE_DOUBLE: 8,
            TYPE_BOOLEAN: 1,
            TYPE_DATETIME: 8,
            TYPE_STRING: 0,
        }.get(self.data_type, 0)


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def _default_value(field: FieldDef) -> Any:
    if field.allow_null:
        return None
    if field.data_type == TYPE_INTEGER:
        return 0
    if field.data_type == TYPE_DOUBLE:
        return 0.0
    if field.data_type == TYPE_BOOLEAN:
        return False
    if field.data_type == TYPE_DATETIME:
        return 0
    if field.data_type == TYPE_STRING:
        return ""
    raise ValueError(f"tipo de campo não suportado: {field.data_type}")


def _decode_value(field: FieldDef, raw: bytes, pos: int) -> tuple[Any, int]:
    if pos >= len(raw):
        raise ValueError("fim inesperado ao ler flag null")
    is_null = raw[pos] != 0
    pos += 1
    if is_null:
        return None, pos

    if field.data_type == TYPE_INTEGER:
        return struct.unpack_from("<i", raw, pos)[0], pos + 4
    if field.data_type == TYPE_DOUBLE:
        return struct.unpack_from("<d", raw, pos)[0], pos + 8
    if field.data_type == TYPE_BOOLEAN:
        return raw[pos] != 0, pos + 1
    if field.data_type == TYPE_DATETIME:
        return struct.unpack_from("<q", raw, pos)[0], pos + 8
    if field.data_type == TYPE_STRING:
        size = struct.unpack_from("<H", raw, pos)[0]
        pos += 2
        return raw[pos:pos + size].decode("utf-8"), pos + size
    raise ValueError(f"tipo de campo não suportado: {field.data_type}")


def _encode_value(field: FieldDef, value: Any) -> bytes:
    if value is None:
        if not field.allow_null:
            value = _default_value(field)
        else:
            return b"\x01"

    out = bytearray(b"\x00")
    if field.data_type == TYPE_INTEGER:
        out += struct.pack("<i", int(value))
    elif field.data_type == TYPE_DOUBLE:
        out += struct.pack("<d", float(value))
    elif field.data_type == TYPE_BOOLEAN:
        out += b"\x01" if bool(value) else b"\x00"
    elif field.data_type == TYPE_DATETIME:
        out += struct.pack("<q", int(value))
    elif field.data_type == TYPE_STRING:
        encoded = str(value).encode("utf-8")
        if len(encoded) > 65535:
            raise ValueError(f"string grande demais em {field.name}")
        out += struct.pack("<H", len(encoded)) + encoded
    else:
        raise ValueError(f"tipo de campo não suportado: {field.data_type}")
    return bytes(out)


def _encode_row(fields: list[FieldDef], values: dict[str, Any]) -> bytes:
    payload = bytearray()
    for field in fields:
        payload += _encode_value(field, values.get(field.name, _default_value(field)))
    row_data_size = len(payload) + 2
    block = bytearray(struct.pack("<Hi", BLOCK_MARKER, row_data_size))
    block += payload
    block += struct.pack("<H", crc16(block))
    return bytes(block)


def _row_spans(data: bytes, field_count: int) -> list[tuple[int, int]]:
    pos = HEADER_SIZE + field_count * FIELD_DEF_SIZE
    spans: list[tuple[int, int]] = []
    while pos < len(data):
        if len(data) - pos < 6:
            raise ValueError("bloco final BaseDAT truncado")
        marker, row_data_size = struct.unpack_from("<Hi", data, pos)
        if marker != BLOCK_MARKER:
            raise ValueError(f"marcador de linha inválido em offset {pos}: {marker:04X}")
        end = pos + 6 + row_data_size
        if end > len(data):
            raise ValueError("linha BaseDAT truncada")
        spans.append((pos, end))
        pos = end
    return spans


def _atomic_replace(path: str, data: bytes) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, target)
        try:
            dir_fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def read_table(path: str) -> tuple[list[FieldDef], list[dict[str, Any]]]:
    with open(path, "rb") as fh:
        data = fh.read()

    if len(data) < HEADER_SIZE:
        raise ValueError(f"{path}: arquivo BaseDAT muito curto")

    table_type, major, _minor, field_count = struct.unpack_from("<HHHH", data, 0)
    if table_type == 0:
        raise ValueError(f"{path}: tipo de tabela inválido")
    if major != 4:
        raise ValueError(f"{path}: versão BaseDAT incompatível: {major}")

    fields: list[FieldDef] = []
    pos = HEADER_SIZE
    for _ in range(field_count):
        block = data[pos:pos + FIELD_DEF_SIZE]
        if len(block) != FIELD_DEF_SIZE:
            raise ValueError(f"{path}: definição de campo truncada")
        expected = struct.unpack_from("<H", block, FIELD_DEF_SIZE - 2)[0]
        actual = crc16(block[:-2])
        if expected != actual:
            raise ValueError(
                f"{path}: CRC inválido na definição de campo: esperado {expected:04X}, calculado {actual:04X}"
            )
        name_len = block[0]
        name = block[1:1 + name_len].decode("ascii")
        fields.append(FieldDef(name, block[51], block[52] != 0))
        pos += FIELD_DEF_SIZE

    rows: list[dict[str, Any]] = []
    while pos < len(data):
        if len(data) - pos < 6:
            raise ValueError(f"{path}: bloco final truncado")
        marker, row_data_size = struct.unpack_from("<Hi", data, pos)
        if marker != BLOCK_MARKER:
            raise ValueError(f"{path}: marcador de linha inválido em offset {pos}: {marker:04X}")
        full_size = 6 + row_data_size
        block = data[pos:pos + full_size]
        if len(block) != full_size:
            raise ValueError(f"{path}: linha truncada")
        expected = struct.unpack_from("<H", block, full_size - 2)[0]
        actual = crc16(block[:-2])
        if expected != actual:
            raise ValueError(
                f"{path}: CRC inválido em linha: esperado {expected:04X}, calculado {actual:04X}"
            )

        values: dict[str, Any] = {}
        p = 6
        data_end = full_size - 2
        for field in fields:
            value, p = _decode_value(field, block, p)
            values[field.name] = value
        if p != data_end:
            raise ValueError(f"{path}: tamanho de linha divergente ({p} != {data_end})")
        rows.append(values)
        pos += full_size

    return fields, rows


def append_row(path: str, pk_name: str, values: dict[str, Any]) -> str:
    fields, rows = read_table(path)
    field_names = {f.name for f in fields}
    if pk_name not in field_names:
        raise ValueError(f"{path}: chave {pk_name} não existe")
    unknown = sorted(set(values) - field_names)
    if unknown:
        raise ValueError(f"{path}: campos desconhecidos: {', '.join(unknown)}")

    pk_value = values[pk_name]
    for row in rows:
        if row.get(pk_name) == pk_value:
            for key, value in values.items():
                if row.get(key) != value:
                    raise ValueError(
                        f"{path}: {pk_name}={pk_value} já existe com valor diferente em {key}: "
                        f"{row.get(key)!r} != {value!r}"
                    )
            return "exists"

    block = _encode_row(fields, values)
    with open(path, "ab") as fh:
        fh.write(block)
        fh.flush()
        os.fsync(fh.fileno())

    read_table(path)
    return "added"


def update_row(path: str, pk_name: str, pk_value: Any, patch: dict[str, Any]) -> dict[str, Any]:
    """Atualiza uma linha BaseDAT preservando todo o restante byte a byte."""
    fields, rows = read_table(path)
    field_names = {field.name for field in fields}
    if pk_name not in field_names:
        raise ValueError(f"{path}: chave {pk_name} não existe")
    unknown = sorted(set(patch) - field_names)
    if unknown:
        raise ValueError(f"{path}: campos desconhecidos: {', '.join(unknown)}")
    if pk_name in patch and patch[pk_name] != pk_value:
        raise ValueError(f"{path}: update_row não permite alterar a chave primária {pk_name}")

    matches = [index for index, row in enumerate(rows) if row.get(pk_name) == pk_value]
    if not matches:
        raise KeyError(f"{path}: {pk_name}={pk_value} não encontrado")
    if len(matches) != 1:
        raise ValueError(f"{path}: {pk_name}={pk_value} aparece {len(matches)} vezes")

    index = matches[0]
    before = dict(rows[index])
    after = {**before, **patch}
    changed = {key: {"from": before.get(key), "to": after.get(key)} for key in patch if before.get(key) != after.get(key)}
    if not changed:
        return {"status": "unchanged", "before": before, "after": before, "changed": {}}

    raw = Path(path).read_bytes()
    spans = _row_spans(raw, len(fields))
    if len(spans) != len(rows):
        raise ValueError(f"{path}: quantidade de blocos diverge das linhas decodificadas")
    start, end = spans[index]
    updated = raw[:start] + _encode_row(fields, after) + raw[end:]
    _atomic_replace(path, updated)

    _, verified_rows = read_table(path)
    verified = next((row for row in verified_rows if row.get(pk_name) == pk_value), None)
    if verified is None or any(verified.get(key) != value for key, value in patch.items()):
        raise ValueError(f"{path}: validação pós-escrita falhou para {pk_name}={pk_value}")
    return {"status": "updated", "before": before, "after": verified, "changed": changed}


def delete_row(path: str, pk_name: str, pk_value: Any) -> dict[str, Any]:
    """Remove uma única linha BaseDAT sem reescrever ou renumerar as demais."""
    fields, rows = read_table(path)
    field_names = {field.name for field in fields}
    if pk_name not in field_names:
        raise ValueError(f"{path}: chave {pk_name} não existe")
    matches = [index for index, row in enumerate(rows) if row.get(pk_name) == pk_value]
    if not matches:
        return {"status": "absent", "removed": None}
    if len(matches) != 1:
        raise ValueError(f"{path}: {pk_name}={pk_value} aparece {len(matches)} vezes")

    index = matches[0]
    removed = dict(rows[index])
    raw = Path(path).read_bytes()
    spans = _row_spans(raw, len(fields))
    if len(spans) != len(rows):
        raise ValueError(f"{path}: quantidade de blocos diverge das linhas decodificadas")
    start, end = spans[index]
    _atomic_replace(path, raw[:start] + raw[end:])

    _, verified_rows = read_table(path)
    if any(row.get(pk_name) == pk_value for row in verified_rows):
        raise ValueError(f"{path}: validação pós-remoção falhou para {pk_name}={pk_value}")
    return {"status": "deleted", "removed": removed}


def _cli_pk_value(path: str, pk_name: str, raw_value: str) -> Any:
    _, rows = read_table(path)
    sample = rows[0].get(pk_name) if rows else raw_value
    if isinstance(sample, bool):
        return raw_value.lower() in {"1", "true", "yes", "on"}
    if isinstance(sample, int):
        return int(raw_value)
    if isinstance(sample, float):
        return float(raw_value)
    return raw_value


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_check = sub.add_parser("check")
    p_check.add_argument("paths", nargs="+")

    p_show = sub.add_parser("show")
    p_show.add_argument("path")

    p_append = sub.add_parser("append")
    p_append.add_argument("path")
    p_append.add_argument("pk_name")
    p_append.add_argument("json_values")

    p_update = sub.add_parser("update")
    p_update.add_argument("path")
    p_update.add_argument("pk_name")
    p_update.add_argument("pk_value")
    p_update.add_argument("json_patch")

    p_delete = sub.add_parser("delete")
    p_delete.add_argument("path")
    p_delete.add_argument("pk_name")
    p_delete.add_argument("pk_value")

    args = parser.parse_args()

    if args.cmd == "check":
        for path in args.paths:
            fields, rows = read_table(path)
            print(f"OK {path}: {len(fields)} campos, {len(rows)} linhas")
        return 0

    if args.cmd == "show":
        fields, rows = read_table(args.path)
        print("FIELDS:", ", ".join(f.name for f in fields))
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "append":
        values = json.loads(args.json_values)
        result = append_row(args.path, args.pk_name, values)
        print(f"{result.upper()} {args.path}: {args.pk_name}={values[args.pk_name]}")
        return 0

    if args.cmd == "update":
        patch = json.loads(args.json_patch)
        value = _cli_pk_value(args.path, args.pk_name, args.pk_value)
        result = update_row(args.path, args.pk_name, value, patch)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "delete":
        value = _cli_pk_value(args.path, args.pk_name, args.pk_value)
        result = delete_row(args.path, args.pk_name, value)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(2)
