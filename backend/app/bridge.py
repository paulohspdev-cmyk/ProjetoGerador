"""Primitivas da bridge reverse TCP RC Geradores.

Este módulo contém somente transporte Modbus, sessão TCP e servidor privilegiado
compartilhados. O runtime canônico de produção é exclusivamente
``python -m app.bridge_runtime``. Executar ``app.bridge`` diretamente é
explicitamente bloqueado para impedir que o reconciliador legado volte a abrir
transportes ou resolver um Rapid Device hardcoded.

O caminho TCP usado pelo Rapid SCADA continua somente leitura (FC03/FC04).
Comandos de máquina NÃO são liberados nessa porta. Quando habilitado
explicitamente, o socket Unix local privilegiado aceita apenas START/STOP
homologados para InteliGen 200, com intertravamento e auditoria.
"""

import asyncio
import json
import os
import struct
import time
from pathlib import Path

from . import db

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REMOTE_BIND = os.environ.get("RC_RAPID_REMOTE_BIND", os.environ.get("RC_GATEWAY_BIND", "0.0.0.0"))
LOCAL_BIND = os.environ.get("RC_RAPID_LOCAL_BIND", "127.0.0.1")
LOCAL_OFFSET = int(os.environ.get("RC_RAPID_LOCAL_OFFSET", "10000"))
TIMEOUT = float(os.environ.get("RC_RAPID_BRIDGE_TIMEOUT", "4"))
RECONCILE_SECONDS = float(os.environ.get("RC_RAPID_RECONCILE_SECONDS", "5"))
CONTROL_SOCKET = os.environ.get("RC_RAPID_CONTROL_SOCKET", "/run/rc-geradores/control.sock")
ENABLE_IG200_CONTROL = os.environ.get("RC_ENABLE_IG200_CONTROL", "0").strip() == "1"

READ_FUNCTIONS = {3, 4}
IG200_RPM_ADDRESS = 1000
IG200_COMMAND_ARGUMENT_ADDRESS = 4207
IG200_COMMAND_CODE_ADDRESS = 4209
IG200_PASSWORD_ADDRESS = 4211
IG200_START_ARGUMENT = 0x01FE0000
IG200_STOP_ARGUMENT = 0x02FD0000
IG200_COMMAND_CODE = 0x0001
IG200_START_RETURN = 0x000001FF
IG200_STOP_RETURN = 0x000002FE
IG200_MAX_START_RPM = 100


def log(message):
    print(f"[rapid-bridge] {message}", flush=True)


def mbap(tid, unit, pdu):
    return struct.pack(">HHHB", tid, 0, len(pdu) + 1, unit) + pdu


def exception_pdu(function, code):
    return bytes([(function | 0x80) & 0xFF, code & 0xFF])


def read_holding_pdu(address, count=1):
    return struct.pack(">BHH", 3, int(address), int(count))


def write_single_pdu(address, value):
    return struct.pack(">BHH", 6, int(address), int(value) & 0xFFFF)


def write_multiple_u32_pdu(address, value):
    value = int(value) & 0xFFFFFFFF
    return struct.pack(">BHHBHH", 16, int(address), 2, 4, (value >> 16) & 0xFFFF, value & 0xFFFF)


def parse_registers(pdu, expected_count):
    if not pdu:
        raise ValueError("resposta Modbus vazia")
    if pdu[0] & 0x80:
        code = pdu[1] if len(pdu) > 1 else -1
        raise ValueError(f"exceção Modbus {code}")
    if pdu[0] != 3 or len(pdu) < 2:
        raise ValueError(f"resposta FC03 inválida: {pdu.hex()}")
    byte_count = pdu[1]
    if byte_count != expected_count * 2 or len(pdu) != 2 + byte_count:
        raise ValueError(f"tamanho FC03 inválido: {pdu.hex()}")
    return [struct.unpack_from(">H", pdu, 2 + i * 2)[0] for i in range(expected_count)]


def ensure_write_ok(pdu, expected_function):
    if not pdu:
        raise ValueError("resposta de escrita vazia")
    if pdu[0] & 0x80:
        code = pdu[1] if len(pdu) > 1 else -1
        raise ValueError(f"exceção Modbus {code} na FC{expected_function:02d}")
    if pdu[0] != expected_function:
        raise ValueError(f"função de resposta inesperada {pdu[0]} na FC{expected_function:02d}")


def load_bindings():
    candidates = []
    env_path = os.environ.get("RC_RAPID_BINDINGS")
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend([
        Path("/var/lib/rc-geradores/rapid-bindings.json"),
        PROJECT_ROOT / "rapid" / "bindings.json",
    ])
    for path in candidates:
        try:
            if not path.exists():
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception as exc:
            log(f"bindings inválidos em {path}: {exc}")
    return []


def resolve_ig200(device_num):
    """Fail-closed: bridge_runtime injeta o resolver baseado em binding/cadastro."""
    raise RuntimeError(
        f"resolver canônico não instalado para Rapid Device {int(device_num or 0)}; "
        "execute app.bridge_runtime"
    )


class BridgePort:
    def __init__(self, remote_port):
        self.remote_port = int(remote_port)
        self.local_port = self.remote_port + LOCAL_OFFSET
        self.remote_server = None
        self.local_server = None
        self.remote_reader = None
        self.remote_writer = None
        self.remote_peer = None
        self.remote_lock = asyncio.Lock()
        self.next_tid = 1
        self.connected_at = None
        self.last_rx_at = None
        self.last_tx_at = None
        self.bytes_rx = 0
        self.bytes_tx = 0
        self.connection_count = 0
        self.timeouts = 0
        self.errors = 0

    def alloc_tid(self):
        tid = self.next_tid
        self.next_tid = 1 if tid >= 65535 else tid + 1
        return tid

    def snapshot(self):
        peer_ip = None
        peer_port = None
        if isinstance(self.remote_peer, (tuple, list)) and self.remote_peer:
            peer_ip = str(self.remote_peer[0])
            if len(self.remote_peer) > 1:
                try:
                    peer_port = int(self.remote_peer[1])
                except (TypeError, ValueError):
                    peer_port = None
        connected = bool(self.remote_writer is not None and not self.remote_writer.is_closing())
        return {
            "remotePort": self.remote_port,
            "localPort": self.local_port,
            "connected": connected,
            "remoteIp": peer_ip,
            "remotePeerPort": peer_port,
            "connectedAt": self.connected_at if connected else None,
            "lastRxAt": self.last_rx_at,
            "lastTxAt": self.last_tx_at,
            "bytesRx": self.bytes_rx,
            "bytesTx": self.bytes_tx,
            "connections": self.connection_count,
            "reconnections": max(0, self.connection_count - 1),
            "timeouts": self.timeouts,
            "errors": self.errors,
        }

    async def start(self):
        self.remote_server = await asyncio.start_server(self.accept_remote, REMOTE_BIND, self.remote_port)
        try:
            self.local_server = await asyncio.start_server(self.accept_local, LOCAL_BIND, self.local_port)
        except Exception:
            self.remote_server.close()
            await self.remote_server.wait_closed()
            self.remote_server = None
            raise
        log(f"porta {self.remote_port}: modem em {REMOTE_BIND}:{self.remote_port}; Rapid SCADA em {LOCAL_BIND}:{self.local_port}")

    async def stop(self):
        if self.remote_server:
            self.remote_server.close()
            await self.remote_server.wait_closed()
            self.remote_server = None
        if self.local_server:
            self.local_server.close()
            await self.local_server.wait_closed()
            self.local_server = None
        await self.clear_remote()

    async def clear_remote(self, only_writer=None):
        writer = self.remote_writer
        if only_writer is not None and writer is not only_writer:
            return
        self.remote_reader = None
        self.remote_writer = None
        self.remote_peer = None
        self.connected_at = None
        if writer:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def accept_remote(self, reader, writer):
        peer = writer.get_extra_info("peername")
        old = self.remote_writer
        self.remote_reader = reader
        self.remote_writer = writer
        self.remote_peer = peer
        self.connected_at = int(time.time())
        self.connection_count += 1
        if old and old is not writer:
            try:
                old.close()
                await old.wait_closed()
            except Exception:
                pass
        log(f"porta {self.remote_port}: modem conectado de {peer}")
        try:
            await writer.wait_closed()
        except Exception:
            pass
        finally:
            if self.remote_writer is writer:
                self.remote_reader = None
                self.remote_writer = None
                self.remote_peer = None
                self.connected_at = None
                log(f"porta {self.remote_port}: modem desconectado")

    async def read_remote_response(self, expected_tid, expected_unit, expected_function):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + TIMEOUT
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise asyncio.TimeoutError()
            reader = self.remote_reader
            if reader is None:
                raise ConnectionError("modem desconectado")
            header = await asyncio.wait_for(reader.readexactly(7), remaining)
            self.bytes_rx += len(header)
            self.last_rx_at = int(time.time())
            tid, proto, length, unit = struct.unpack(">HHHB", header)
            if proto != 0 or length < 2 or length > 260:
                raise ValueError(f"MBAP remoto inválido: tid={tid} proto={proto} length={length} unit={unit}")
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise asyncio.TimeoutError()
            pdu = await asyncio.wait_for(reader.readexactly(length - 1), remaining)
            self.bytes_rx += len(pdu)
            self.last_rx_at = int(time.time())
            if tid != expected_tid or unit != expected_unit:
                log(f"porta {self.remote_port}: descartado frame atrasado tid={tid} unit={unit}; esperado tid={expected_tid} unit={expected_unit}")
                continue
            if not pdu:
                raise ValueError("PDU remoto vazio")
            response_function = pdu[0]
            if response_function not in (expected_function, expected_function | 0x80):
                raise ValueError(f"função remota inesperada {response_function}; esperada {expected_function}")
            return pdu

    async def request_locked(self, unit, pdu):
        if not pdu:
            raise ValueError("PDU vazio")
        function = pdu[0]
        reader = self.remote_reader
        writer = self.remote_writer
        if reader is None or writer is None or writer.is_closing():
            raise ConnectionError("modem desconectado")
        remote_tid = self.alloc_tid()
        frame = mbap(remote_tid, unit, pdu)
        writer.write(frame)
        await writer.drain()
        self.bytes_tx += len(frame)
        self.last_tx_at = int(time.time())
        return await self.read_remote_response(remote_tid, unit, function)

    async def transact(self, local_tid, unit, pdu):
        if not pdu:
            return exception_pdu(0, 3)
        function = pdu[0]
        if function not in READ_FUNCTIONS:
            return exception_pdu(function, 1)
        async with self.remote_lock:
            writer = self.remote_writer
            try:
                return await self.request_locked(unit, pdu)
            except asyncio.TimeoutError:
                self.timeouts += 1
                log(f"porta {self.remote_port}: timeout Unit {unit} FC{function:02d}; mantendo conexão compartilhada")
                return exception_pdu(function, 11)
            except (ConnectionError, asyncio.IncompleteReadError) as exc:
                self.errors += 1
                log(f"porta {self.remote_port}: conexão perdida Unit {unit} FC{function:02d}: {type(exc).__name__}")
                await self.clear_remote(only_writer=writer)
                return exception_pdu(function, 11)
            except Exception as exc:
                self.errors += 1
                log(f"porta {self.remote_port}: erro remoto Unit {unit} FC{function:02d}: {exc}")
                await self.clear_remote(only_writer=writer)
                return exception_pdu(function, 11)

    async def read_registers_privileged(self, unit, address, count):
        async with self.remote_lock:
            pdu = await self.request_locked(unit, read_holding_pdu(address, count))
            return parse_registers(pdu, count)

    async def ig200_command(self, unit, action, password=None):
        if action not in ("start", "stop"):
            raise ValueError("ação inválida")
        argument = IG200_START_ARGUMENT if action == "start" else IG200_STOP_ARGUMENT
        expected_return = IG200_START_RETURN if action == "start" else IG200_STOP_RETURN
        async with self.remote_lock:
            rpm_pdu = await self.request_locked(unit, read_holding_pdu(IG200_RPM_ADDRESS, 1))
            rpm_before = parse_registers(rpm_pdu, 1)[0]
            if action == "start" and rpm_before > IG200_MAX_START_RPM:
                return {"ok": False, "accepted": False, "reason": f"partida bloqueada: motor já apresenta {rpm_before} rpm", "rpm_before": rpm_before}
            if password is not None:
                pw = int(password)
                if pw < 0 or pw > 65535:
                    raise ValueError("senha Modbus deve caber em uint16")
                pw_resp = await self.request_locked(unit, write_single_pdu(IG200_PASSWORD_ADDRESS, pw))
                ensure_write_ok(pw_resp, 6)
            arg_resp = await self.request_locked(unit, write_multiple_u32_pdu(IG200_COMMAND_ARGUMENT_ADDRESS, argument))
            ensure_write_ok(arg_resp, 16)
            cmd_resp = await self.request_locked(unit, write_single_pdu(IG200_COMMAND_CODE_ADDRESS, IG200_COMMAND_CODE))
            ensure_write_ok(cmd_resp, 6)
            await asyncio.sleep(0.2)
            ret_pdu = await self.request_locked(unit, read_holding_pdu(IG200_COMMAND_ARGUMENT_ADDRESS, 2))
            regs = parse_registers(ret_pdu, 2)
            return_value = (regs[0] << 16) | regs[1]
        if return_value == expected_return:
            accepted = True
            reason = "comando aceito pelo controlador"
        elif return_value == 0x00000001:
            accepted = False
            reason = "controlador recusou: argumento inválido"
        elif return_value == 0x00000002:
            accepted = False
            reason = "controlador recusou o comando (modo, acesso ou intertravamento)"
        else:
            accepted = False
            reason = f"retorno inesperado 0x{return_value:08X}"
        rpm_after = None
        if accepted:
            await asyncio.sleep(2.0)
            try:
                rpm_after = (await self.read_registers_privileged(unit, IG200_RPM_ADDRESS, 1))[0]
            except Exception:
                rpm_after = None
        return {
            "ok": accepted,
            "accepted": accepted,
            "action": action,
            "reason": reason,
            "return_value": f"0x{return_value:08X}",
            "rpm_before": rpm_before,
            "rpm_after": rpm_after,
        }

    async def accept_local(self, reader, writer):
        peer = writer.get_extra_info("peername")
        log(f"porta local {self.local_port}: Rapid SCADA conectado de {peer}")
        try:
            while not reader.at_eof():
                header = await reader.readexactly(7)
                local_tid, proto, length, unit = struct.unpack(">HHHB", header)
                if proto != 0 or length < 2 or length > 260:
                    raise ValueError(f"MBAP local inválido: proto={proto} length={length} unit={unit}")
                pdu = await reader.readexactly(length - 1)
                response_pdu = await self.transact(local_tid, unit, pdu)
                writer.write(mbap(local_tid, unit, response_pdu))
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        except Exception as exc:
            log(f"porta local {self.local_port}: sessão encerrada por erro: {exc}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            log(f"porta local {self.local_port}: Rapid SCADA desconectado")


bridges = {}
control_server = None


async def handle_control(reader, writer):
    response = {"ok": False, "error": "requisição inválida"}
    generator = None
    action = ""
    try:
        raw = await asyncio.wait_for(reader.readline(), 5)
        if not raw or len(raw) > 4096:
            raise ValueError("requisição vazia ou grande demais")
        req = json.loads(raw.decode("utf-8"))
        if not ENABLE_IG200_CONTROL:
            raise PermissionError("controle IG200 desabilitado; execute o instalador de controle")
        if req.get("confirm") != "REMOTE_CONTROL_CONFIRMED":
            raise PermissionError("confirmação explícita ausente")
        action = str(req.get("action", "")).strip().lower()
        if action not in ("start", "stop"):
            raise ValueError("somente start e stop são permitidos")
        generator, port, unit = resolve_ig200(int(req.get("device") or 0))
        bridge = bridges.get(port)
        if bridge is None:
            raise ConnectionError(f"ponte da porta {port} não está ativa")
        if bridge.remote_writer is None:
            raise ConnectionError(f"modem da porta {port} está desconectado")
        result = await bridge.ig200_command(unit, action, password=req.get("password"))
        response = {**result, "device": int(req.get("device")), "generator": generator.get("tag"), "port": port, "unit": unit}
        level = "WARN" if result.get("accepted") else "ERROR"
        db.add_event(generator["id"], level, f"Controle remoto IG200 {action.upper()}: {result.get('reason', '')}; retorno={result.get('return_value', '-')}; rpm={result.get('rpm_before', '-')}")
        log(f"controle IG200 {action}: gerador={generator.get('tag')} unit={unit} aceito={result.get('accepted')} retorno={result.get('return_value')}")
    except Exception as exc:
        response = {"ok": False, "accepted": False, "error": str(exc), "action": action}
        if generator:
            try:
                db.add_event(generator["id"], "ERROR", f"Controle remoto IG200 falhou: {exc}")
            except Exception:
                pass
        log(f"controle privilegiado recusado/falhou: {exc}")
    finally:
        try:
            writer.write((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
            await writer.drain()
        except Exception:
            pass
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def start_control_server():
    global control_server
    socket_path = Path(CONTROL_SOCKET)
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        socket_path.unlink(missing_ok=True)
    except Exception:
        pass
    control_server = await asyncio.start_unix_server(handle_control, path=str(socket_path))
    os.chmod(socket_path, 0o660)
    mode = "ATIVO: start/stop IG200 restritos" if ENABLE_IG200_CONTROL else "DESABILITADO"
    log(f"socket de controle local {socket_path} ({mode})")


async def stop_control_server():
    global control_server
    if control_server:
        control_server.close()
        await control_server.wait_closed()
        control_server = None
    try:
        Path(CONTROL_SOCKET).unlink(missing_ok=True)
    except Exception:
        pass


if __name__ == "__main__":
    raise SystemExit("runtime legado desativado; execute: python -m app.bridge_runtime")
