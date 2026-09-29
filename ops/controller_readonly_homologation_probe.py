#!/usr/bin/env python3
"""Probe de homologação estritamente somente leitura.

Não implementa FC05/06/15/16 e não chama sockets privilegiados de controle.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import db  # noqa: E402
from app.bridge import LOCAL_OFFSET  # noqa: E402
from app.controller_library import pack_for_model  # noqa: E402
from app.dse_control import (  # noqa: E402
    AVAILABILITY_ADDRESS,
    AVAILABILITY_COUNT,
    MODE_ADDRESS,
    RPM_ADDRESS,
    _ModbusTcp,
)

READ_FUNCTIONS = {3, 4}


def decode_ascii_registers(registers: list[int]) -> dict:
    raw_ab = b"".join(struct.pack(">H", int(value) & 0xFFFF) for value in registers)
    raw_ba = b"".join(struct.pack(">H", int(value) & 0xFFFF)[::-1] for value in registers)
    def text(raw: bytes) -> str:
        return raw.split(b"\x00", 1)[0].decode("ascii", errors="replace").strip()
    return {
        "AB": {"text": text(raw_ab), "hex": raw_ab.hex()},
        "BA": {"text": text(raw_ba), "hex": raw_ba.hex()},
    }


class ReadOnlyModbusTcp:
    def __init__(self, host: str, port: int, unit: int, timeout: float = 3.0):
        self.host = host
        self.port = int(port)
        self.unit = int(unit)
        self.timeout = float(timeout)
        self.transaction = 0
        self.reader = None
        self.writer = None

    async def __aenter__(self):
        self.reader, self.writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port), timeout=self.timeout
        )
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self.writer:
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass

    async def request(self, function: int, address: int, count: int = 1):
        if function not in READ_FUNCTIONS:
            raise PermissionError(f"função Modbus fora do contrato read-only FC03/04: FC{function:02d}")
        self.transaction = (self.transaction + 1) & 0xFFFF or 1
        pdu = struct.pack(">BHH", function, int(address), int(count))
        frame = struct.pack(">HHHB", self.transaction, 0, len(pdu) + 1, self.unit) + pdu
        self.writer.write(frame)
        await self.writer.drain()
        header = await asyncio.wait_for(self.reader.readexactly(7), timeout=self.timeout)
        txn, proto, length, unit = struct.unpack(">HHHB", header)
        if (txn, proto, unit) != (self.transaction, 0, self.unit):
            raise ValueError("MBAP inconsistente")
        body = await asyncio.wait_for(self.reader.readexactly(length - 1), timeout=self.timeout)
        if not body:
            raise ValueError("resposta vazia")
        if body[0] & 0x80:
            raise PermissionError(f"exceção Modbus {body[1] if len(body)>1 else '?'}")
        if body[0] not in READ_FUNCTIONS:
            raise PermissionError(f"resposta de escrita inesperada FC{body[0]:02d}")
        byte_count = body[1]
        data = body[2 : 2 + byte_count]
        if function in {3, 4}:
            if len(data) != count * 2:
                raise ValueError("contagem de registradores inválida")
            return list(struct.unpack(f">{count}H", data))
        bits=[]
        for idx in range(count):
            bits.append(bool(data[idx // 8] & (1 << (idx % 8))))
        return bits


def find_generator(tag: str) -> dict:
    matches = [g for g in db.list_generators() if str(g.get("tag") or "").casefold() == tag.casefold()]
    if len(matches) != 1:
        raise ValueError(f"gerador não encontrado/unívoco: {tag}")
    return matches[0]


def plan(generator: dict) -> dict:
    model = " ".join(str(generator.get("controller_model") or "").split())
    model_cf = model.casefold()
    if model_cf == "inteligen 200":
        reads = [
            {"name":"rpm","function":3,"address":1000,"count":1},
            {"name":"controller_mode_raw","function":3,"address":1342,"count":1},
            {"name":"engine_state_raw","function":3,"address":1258,"count":1},
            {"name":"breaker_state_raw","function":3,"address":1259,"count":1},
            {"name":"firmware_raw","function":3,"address":1281,"count":8},
        ]
        endpoint={"host":"127.0.0.1","port":int(generator["listen_port"])+LOCAL_OFFSET}
    elif model_cf in {"ig4 200","inteligen4 200"}:
        reads = [
            {"name":"rpm","function":3,"address":1000,"count":1},
            {"name":"controller_mode_raw","function":3,"address":1320,"count":1},
            {"name":"engine_state_raw","function":3,"address":1322,"count":1},
            {"name":"breaker_state_raw","function":3,"address":1323,"count":1},
            {"name":"firmware_raw","function":3,"address":1344,"count":8},
        ]
        endpoint={"host":"127.0.0.1","port":int(generator["listen_port"])+LOCAL_OFFSET}
    elif str(generator.get("controller_type") or "").upper() == "DSE":
        reads = [
            {"name":"mode_raw","function":3,"address":MODE_ADDRESS,"count":1},
            {"name":"rpm","function":3,"address":RPM_ADDRESS,"count":1},
            {"name":"control_availability","function":3,"address":AVAILABILITY_ADDRESS,"count":AVAILABILITY_COUNT},
        ]
        endpoint={"host":str(generator.get("host") or ""),"port":int(generator.get("listen_port") or 502)}
    else:
        reads=[]
        endpoint={}
    return {
        "tag":generator.get("tag"),
        "model":model,
        "unit":int(generator.get("modbus_unit") or 0),
        "endpoint":endpoint,
        "reads":reads,
        "packId":(pack_for_model(model) or {}).get("packId"),
        "writeFunctionsAllowed":[],
        "strictReadOnly":True,
    }


async def execute(generator: dict) -> dict:
    spec=plan(generator)
    if not spec["reads"]:
        return {**spec,"ok":False,"error":"modelo sem probe read-only preparado"}
    host=spec["endpoint"]["host"]
    port=spec["endpoint"]["port"]
    unit=spec["unit"]
    if not host or not port or not unit:
        return {**spec,"ok":False,"error":"endpoint/unit incompleto"}
    values={}
    errors={}
    try:
        async with ReadOnlyModbusTcp(host,port,unit) as client:
            for item in spec["reads"]:
                try:
                    values[item["name"]]=await client.request(item["function"],item["address"],item["count"])
                except Exception as exc:
                    errors[item["name"]]=str(exc)
    except Exception as exc:
        return {**spec,"ok":False,"error":str(exc),"values":values,"errors":errors}
    decoded = {}
    if isinstance(values.get("firmware_raw"), list) and len(values["firmware_raw"]) == 8:
        decoded["firmwareCandidates"] = decode_ascii_registers(values["firmware_raw"])
    return {**spec,"ok":not errors,"values":values,"decoded":decoded,"errors":errors}


def main():
    ap=argparse.ArgumentParser(description="Probe Modbus estritamente read-only para homologação.")
    ap.add_argument("--tag",required=True)
    ap.add_argument("--execute-readonly",action="store_true")
    args=ap.parse_args()
    generator=find_generator(args.tag)
    if not args.execute_readonly:
        print(json.dumps(plan(generator),ensure_ascii=False,indent=2))
        return
    print(json.dumps(asyncio.run(execute(generator)),ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
