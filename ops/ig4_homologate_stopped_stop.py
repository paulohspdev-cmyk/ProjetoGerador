#!/usr/bin/env python3
"""Homologação de campo IG4 200: STOP com o motor comprovadamente parado.

Este utilitário é deliberadamente isolado da bridge/Rapid. Ele deve ser executado
somente enquanto rc-geradores-bridge estiver parado, assumindo temporariamente a
porta TCP transparente do modem. A única escrita implementada é o comando
candidato de STOP da família ComAp, e somente depois de confirmar por leitura:
MAN + Ready + BrksOff + RPM=0.

Não implementa START, GCB, MCB, mudança de modo, setpoints ou qualquer comando
exposto à API/UI.
"""

import argparse
import socket
import struct
import sys
import time

STOP_ARGUMENT = 0x02FD0000
COMMAND_CODE = 0x0001
EXPECTED_STOP_RETURN = 0x000002FE

MODE_MAN = 1
ENGINE_READY = 1
BREAKER_OFF = 1


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc & 0xFFFF


def rtu_frame(unit: int, pdu: bytes) -> bytes:
    body = bytes([unit]) + pdu
    crc = crc16(body)
    return body + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


def recv_exact(sock: socket.socket, count: int) -> bytes:
    out = bytearray()
    while len(out) < count:
        chunk = sock.recv(count - len(out))
        if not chunk:
            raise ConnectionError("modem encerrou a conexão")
        out.extend(chunk)
    return bytes(out)


def validate_crc(frame: bytes) -> None:
    if len(frame) < 5:
        raise RuntimeError(f"resposta RTU curta: {frame.hex()}")
    got = frame[-2] | (frame[-1] << 8)
    expected = crc16(frame[:-2])
    if got != expected:
        raise RuntimeError(
            f"CRC inválido: recebido=0x{got:04X}, calculado=0x{expected:04X}"
        )


def recv_response(sock: socket.socket, unit: int, function: int, *, read_count: int | None = None) -> bytes:
    head = recv_exact(sock, 2)
    if head[0] != unit:
        raise RuntimeError(f"Unit inesperado {head[0]}, esperado {unit}")

    response_function = head[1]
    if response_function == (function | 0x80):
        tail = recv_exact(sock, 3)
        frame = head + tail
        validate_crc(frame)
        raise RuntimeError(f"exceção Modbus {frame[2]} em FC{function:02d}")

    if response_function != function:
        raise RuntimeError(
            f"função inesperada FC{response_function:02d}, esperada FC{function:02d}"
        )

    if function in (3, 4):
        byte_count = recv_exact(sock, 1)
        n = byte_count[0]
        tail = recv_exact(sock, n + 2)
        frame = head + byte_count + tail
        validate_crc(frame)
        if read_count is not None and n != read_count * 2:
            raise RuntimeError(f"byte count {n}, esperado {read_count * 2}")
        return frame[1:-2]

    # FC06/FC16 retornam Unit + Function + Address + Value/Count + CRC = 8 bytes.
    tail = recv_exact(sock, 6)
    frame = head + tail
    validate_crc(frame)
    return frame[1:-2]


def transact(sock: socket.socket, unit: int, pdu: bytes, *, read_count: int | None = None) -> bytes:
    frame = rtu_frame(unit, pdu)
    sock.sendall(frame)
    return recv_response(sock, unit, pdu[0], read_count=read_count)


def read_holding(sock: socket.socket, unit: int, address: int, count: int = 1) -> list[int]:
    pdu = struct.pack(">BHH", 3, address, count)
    response = transact(sock, unit, pdu, read_count=count)
    if response[0] != 3:
        raise RuntimeError("resposta FC03 inválida")
    data = response[2:]
    return [struct.unpack_from(">H", data, i * 2)[0] for i in range(count)]


def write_stop_argument(sock: socket.socket, unit: int) -> None:
    hi = (STOP_ARGUMENT >> 16) & 0xFFFF
    lo = STOP_ARGUMENT & 0xFFFF
    pdu = struct.pack(">BHHBHH", 16, 4207, 2, 4, hi, lo)
    response = transact(sock, unit, pdu)
    if len(response) != 5:
        raise RuntimeError(f"resposta FC16 inválida: {response.hex()}")
    _, address, count = struct.unpack(">BHH", response)
    if address != 4207 or count != 2:
        raise RuntimeError(
            f"eco FC16 inválido: address={address}, count={count}"
        )


def write_command_code(sock: socket.socket, unit: int) -> None:
    pdu = struct.pack(">BHH", 6, 4209, COMMAND_CODE)
    response = transact(sock, unit, pdu)
    if len(response) != 5:
        raise RuntimeError(f"resposta FC06 inválida: {response.hex()}")
    _, address, value = struct.unpack(">BHH", response)
    if address != 4209 or value != COMMAND_CODE:
        raise RuntimeError(
            f"eco FC06 inválido: address={address}, value=0x{value:04X}"
        )


def snapshot(sock: socket.socket, unit: int) -> dict[str, int]:
    return {
        "mode": read_holding(sock, unit, 1320)[0],
        "engine": read_holding(sock, unit, 1322)[0],
        "breaker": read_holding(sock, unit, 1323)[0],
        "rpm": read_holding(sock, unit, 1000)[0],
        "battery_raw": read_holding(sock, unit, 1051)[0],
    }


def require_safe_stopped_state(state: dict[str, int]) -> None:
    failures = []
    if state["mode"] != MODE_MAN:
        failures.append(f"modo={state['mode']} (esperado MAN=1)")
    if state["engine"] != ENGINE_READY:
        failures.append(f"engine={state['engine']} (esperado Ready=1)")
    if state["breaker"] != BREAKER_OFF:
        failures.append(f"breaker={state['breaker']} (esperado BrksOff=1)")
    if state["rpm"] != 0:
        failures.append(f"rpm={state['rpm']} (esperado 0)")
    if failures:
        raise RuntimeError("pré-condição de homologação recusada: " + "; ".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=15003)
    parser.add_argument("--expected-peer", required=True)
    parser.add_argument("--unit", type=int, choices=(3, 4), required=True)
    parser.add_argument("--accept-timeout", type=float, default=90.0)
    parser.add_argument("--io-timeout", type=float, default=5.0)
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()

    if args.confirm != "HOMOLOGATE_STOP_ON_STOPPED_IG4":
        print("CONFIRMAÇÃO INVÁLIDA. Nenhuma escrita enviada.", file=sys.stderr)
        return 2

    print("IG4 200 - HOMOLOGATION STEP 2")
    print("REAL COMMAND: STOP only, and only with MAN + Ready + BrksOff + RPM=0")
    print("START/GCB/MCB/MODE are not implemented by this tool")
    print(f"Unit: {args.unit}; expected modem peer: {args.expected_peer}:{args.port}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((args.listen, args.port))
        server.listen(1)
        server.settimeout(args.accept_timeout)
        print(f"Waiting modem on {args.listen}:{args.port} ...")
        conn, peer = server.accept()

        with conn:
            conn.settimeout(args.io_timeout)
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            peer_ip = str(peer[0])
            print(f"Modem connected from {peer_ip}:{peer[1]}")
            if peer_ip != args.expected_peer:
                raise RuntimeError(
                    f"peer recusado: {peer_ip}; esperado {args.expected_peer}"
                )

            time.sleep(0.15)
            before = snapshot(conn, args.unit)
            print("STATE BEFORE:", before)
            require_safe_stopped_state(before)

            block_before = read_holding(conn, args.unit, 4207, 2)
            print(f"4207-4208 BEFORE: {block_before}")

            # Revalida imediatamente antes da primeira escrita.
            immediate = snapshot(conn, args.unit)
            require_safe_stopped_state(immediate)
            if immediate != before:
                raise RuntimeError(
                    f"estado mudou entre validações: before={before}, immediate={immediate}"
                )

            print("PRECONDITIONS: OK")
            print("Sending STOP argument to 4207-4208 via FC16 ...")
            write_stop_argument(conn, args.unit)
            time.sleep(0.10)
            print("Sending command code 0x0001 to 4209 via FC06 ...")
            write_command_code(conn, args.unit)
            time.sleep(0.35)

            regs = read_holding(conn, args.unit, 4207, 2)
            return_value = (regs[0] << 16) | regs[1]
            print(f"COMMAND RETURN: 0x{return_value:08X} raw={regs}")

            after = snapshot(conn, args.unit)
            print("STATE AFTER :", after)

            if after["rpm"] != 0:
                raise RuntimeError(f"falha segura: RPM deixou de ser zero ({after['rpm']})")
            if after["breaker"] != BREAKER_OFF:
                raise RuntimeError(
                    f"falha segura: breaker saiu de BrksOff ({after['breaker']})"
                )

            if return_value == EXPECTED_STOP_RETURN:
                print("RESULT: STOP COMMAND ACCEPTED WITH EXPECTED RETURN 0x000002FE")
                print("RESULT: STOP protocol candidate validated for this Unit/firmware")
                return 0
            if return_value == 0x00000001:
                print("RESULT: controller returned INVALID ARGUMENT")
                return 10
            if return_value == 0x00000002:
                print("RESULT: controller REFUSED command (mode/access/interlock)")
                return 11

            print(f"RESULT: unexpected return 0x{return_value:08X}")
            return 12


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted. No further action.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
