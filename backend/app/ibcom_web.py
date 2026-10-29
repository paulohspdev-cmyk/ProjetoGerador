from __future__ import annotations

import hashlib
import html
import http.cookiejar
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import logging
import json
from pathlib import Path

LOG = logging.getLogger("rc.ibcom_web")
_STATUS_FILE = Path(os.environ.get("RC_IBCOM_WEB_STATUS_FILE", "/var/lib/rc-geradores/ibcom-web-status.json"))

_CACHE_TTL = max(3.0, float(os.environ.get("RC_IBCOM_WEB_CACHE_TTL", "5")))
_STALE_AFTER = max(_CACHE_TTL * 3, float(os.environ.get("RC_IBCOM_WEB_STALE_SECONDS", "20")))
_RETRY_AFTER = max(10.0, float(os.environ.get("RC_IBCOM_WEB_RETRY_SECONDS", "60")))

_cache: dict[str, dict] = {}
_sessions: dict[str, "_Session"] = {}
_guard = threading.Lock()
_background_stop = threading.Event()
_background_thread: threading.Thread | None = None
_suspended_until: dict[str, float] = {}

_GROUPS = ("values5.htm", "values6.htm", "values7.htm", "values17.htm", "values22.htm", "values23.htm")

_NUMERIC_MAP = {
    "RPM": "rpm",
    "Ubat": "battery_voltage",
    "Act power": "power_kw",
    "Pwr factor": "power_factor",
    "Gen freq": "frequency",
    "Gen V L1-N": "voltage_l1",
    "Gen V L2-N": "voltage_l2",
    "Gen V L3-N": "voltage_l3",
    "Gen curr L1": "current_l1",
    "Gen curr L2": "current_l2",
    "Gen curr L3": "current_l3",
    "Bus freq": "mains_frequency",
    "Bus V L1-N": "mains_voltage_l1",
    "Bus V L2-N": "mains_voltage_l2",
    "Bus V L3-N": "mains_voltage_l3",
    "Run hours": "run_hours",
    "Num starts": "number_starts",
}

_MODE = {"OFF": 0, "MAN": 1, "SEM": 2, "AUT": 3}
_ENGINE = {
    "Init": 0, "Ready": 1, "NotReady": 2, "Prestart": 3, "Cranking": 4,
    "Pause": 5, "Starting": 6, "Running": 7, "Loaded": 8, "Soft unld": 9,
    "Cooling": 10, "Stop": 11, "Shutdown": 12, "Ventil": 13, "EmergMan": 14,
    "Cooldown": 15, "Offload": 16, "Soft load": 17, "WaitStop": 18,
    "Warming": 19, "SDVentil": 20,
}
_BREAKER = {
    "Init": 0, "BrksOff": 1, "IslOper": 2, "MainsOper": 3, "ParalOper": 4,
    "RevSync": 5, "Synchro": 6, "MainsFlt": 7, "ValidFlt": 8, "MainsRet": 9,
    "MultIslOp": 10, "MultParOp": 11, "EmergMan": 12, "StrUpSync": 13,
}


def _access_code(generator_id: str) -> str | None:
    key = "RC_IBCOM_ACCESS_CODE_" + re.sub(r"[^A-Za-z0-9]", "_", generator_id).upper()
    return os.environ.get(key)


def supports(generator: dict) -> bool:
    return (
        str(generator.get("controller_model") or "").strip().casefold()
        == "inteligen nt basebox"
        and str(generator.get("transport") or "").strip() == "modbus_tcp_direct"
        and bool(str(generator.get("host") or "").strip())
        and _access_code(str(generator.get("id") or "")) is not None
    )


def _strip(cell: str) -> str:
    value = re.sub(r"<[^>]+>", " ", cell)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def _rows(page: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.I | re.S):
        cells = [
            _strip(cell)
            for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, flags=re.I | re.S)
        ]
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2 and cells[0] not in {"Scada", "Groups"}:
            out[cells[0]] = cells[1]
    return out


def _number(value: str):
    value = str(value or "").strip()
    if not value or "#" in value:
        return None
    try:
        number = float(value.replace(",", "."))
    except ValueError:
        return None
    if not (number == number and abs(number) != float("inf")):
        return None
    return int(number) if number.is_integer() else number


class _Session:
    def __init__(self, generator: dict):
        self.generator_id = str(generator["id"])
        self.base = f"http://{str(generator['host']).strip()}/"
        self.code = _access_code(self.generator_id) or ""
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.lock = threading.Lock()

    def _open(self, path: str, data: bytes | None = None) -> str:
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method="POST" if data is not None else "GET",
            headers={"Connection": "close", "User-Agent": "RC-Geradores/IBCOM-readonly"},
        )
        with self.opener.open(request, timeout=3.5) as response:
            return response.read().decode("latin1", "ignore")

    @staticmethod
    def _needs_login(page: str) -> bool:
        return "IB-COM access verification" in page or 'name="pA"' in page

    def _login(self, path: str, page: str | None = None) -> str:
        page = page if page is not None else self._open(path)
        nonce_match = re.search(r'name="pA" value="([A-Fa-f0-9]+)"', page)
        if not nonce_match:
            raise RuntimeError("IB-COM não forneceu nonce de autenticação")
        digest = hashlib.md5((nonce_match.group(1) + self.code).encode("ascii")).hexdigest().upper()
        body = urllib.parse.urlencode({"q": "", "pA": digest}).encode()
        authenticated = self._open(path.upper(), body)
        if self._needs_login(authenticated):
            raise RuntimeError("AccessCode rejeitado pelo IB-COM")
        if "Too many other clients connected" in authenticated:
            raise RuntimeError("IB-COM sem slot de cliente disponível")
        return authenticated

    def page(self, path: str) -> str:
        page = self._open(path)
        if "Too many other clients connected" in page:
            raise RuntimeError("IB-COM sem slot de cliente disponível")
        if self._needs_login(page):
            return self._login(path, page)
        return page

    def logout(self) -> None:
        with self.lock:
            try:
                self._open("exit.htm")
            except Exception:
                pass
            self.jar.clear()

    def read(self) -> dict:
        with self.lock:
            merged: dict[str, str] = {}
            page_errors: list[str] = []
            pages_ok: list[str] = []
            for path in _GROUPS:
                try:
                    merged.update(_rows(self.page(path)))
                    pages_ok.append(path)
                except Exception as exc:
                    page_errors.append(f"{path}: {exc}")
                    # A slot rejection applies to the whole web session. Do not
                    # hammer the remaining pages in the same cycle.
                    if "sem slot de cliente" in str(exc).casefold():
                        break

            values: dict[str, float | int] = {}
            for source, target in _NUMERIC_MAP.items():
                number = _number(merged.get(source, ""))
                if number is not None:
                    values[target] = number

            mode = merged.get("ControllerMode")
            engine = merged.get("Engine state")
            breaker = merged.get("Breaker state")
            sw_version = str(
                merged.get("SW version")
                or merged.get("SW Version")
                or merged.get("FW version")
                or merged.get("Firmware version")
                or ""
            ).strip()
            sw_branch = str(
                merged.get("SW branch")
                or merged.get("SW Branch")
                or merged.get("FW branch")
                or merged.get("Firmware branch")
                or ""
            ).strip()
            if mode in _MODE:
                values["controller_mode_raw"] = _MODE[mode]
            if engine in _ENGINE:
                values["engine_state_raw"] = _ENGINE[engine]
            if breaker in _BREAKER:
                values["breaker_state_raw"] = _BREAKER[breaker]

            if "rpm" not in values:
                suffix = ("; " + " | ".join(page_errors[:3])) if page_errors else ""
                raise RuntimeError("IB-COM respondeu sem RPM; telemetria não comprovada" + suffix)
            return {
                "values": values,
                "at": int(time.time()),
                "detail": {
                    "controllerMode": mode,
                    "engineState": engine,
                    "breakerState": breaker,
                    "swVersion": sw_version,
                    "swBranch": sw_branch,
                    "pagesOk": pages_ok,
                    "pageErrors": page_errors,
                },
            }


def _write_status(generator_id: str, *, ok: bool, error: str = "", data: dict | None = None) -> None:
    try:
        payload = {
            "generatorId": generator_id,
            "ok": bool(ok),
            "updatedAt": int(time.time()),
            "error": error,
            "metrics": sorted(((data or {}).get("values") or {}).keys()),
            "detail": dict((data or {}).get("detail") or {}),
        }
        _STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _STATUS_FILE.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + chr(10),
            encoding="utf-8",
        )
        os.replace(tmp, _STATUS_FILE)
    except OSError:
        pass


def _refresh(generator: dict) -> None:
    generator_id = str(generator["id"])
    try:
        with _guard:
            session = _sessions.get(generator_id)
            if session is None:
                session = _Session(generator)
                _sessions[generator_id] = session
        data = session.read()
        entry = {"at": time.monotonic(), "data": data, "error": "", "refreshing": False}
        _write_status(generator_id, ok=True, data=data)
        LOG.info("IB-COM telemetry refreshed for %s", generator_id)
    except Exception as exc:
        # Preserve the CookieJar/session on transient read failures. Old IB-COM
        # firmware can keep a server-side web slot reserved even after a socket
        # timeout; creating a new client on every failure eventually exhausts
        # the available slots. The same session can re-authenticate itself when
        # the controller asks for login again.
        entry = {"at": time.monotonic(), "data": None, "error": str(exc), "refreshing": False}
        _write_status(generator_id, ok=False, error=str(exc))
        LOG.warning("IB-COM telemetry refresh failed for %s: %s", generator_id, exc)
    with _guard:
        previous = _cache.get(generator_id) or {}
        if entry["data"] is None and previous.get("data"):
            entry["data"] = previous["data"]
            entry["data_at"] = previous.get("data_at", previous.get("at"))
        else:
            entry["data_at"] = entry["at"]
        _cache[generator_id] = entry


def telemetry(generator: dict) -> tuple[dict | None, str]:
    if not supports(generator):
        return None, ""
    generator_id = str(generator["id"])
    now = time.monotonic()
    with _guard:
        entry = _cache.get(generator_id)
        suspended = now < float(_suspended_until.get(generator_id) or 0)
        if suspended:
            data = (entry or {}).get("data")
            if data:
                data_age = now - float((entry or {}).get("data_at") or (entry or {}).get("at") or 0)
                if data_age <= _STALE_AFTER:
                    return data, ""
            return None, "IB-COM reservado para controle remoto"
        if entry and entry.get("data"):
            data_age = now - float(entry.get("data_at") or entry.get("at") or 0)
            if data_age <= _CACHE_TTL:
                return entry["data"], ""
        retry_blocked = bool(
            entry
            and entry.get("error")
            and entry.get("at")
            and now - float(entry["at"]) < _RETRY_AFTER
        )
        if not retry_blocked and (not entry or not entry.get("refreshing")):
            if entry:
                entry["refreshing"] = True
            else:
                _cache[generator_id] = {"at": 0.0, "data": None, "error": "", "refreshing": True}
            threading.Thread(target=_refresh, args=(dict(generator),), daemon=True).start()
        entry = _cache.get(generator_id) or {}
        data = entry.get("data")
        if data:
            data_age = now - float(entry.get("data_at") or entry.get("at") or 0)
            if data_age <= _STALE_AFTER:
                # A última leitura continua válida até STALE_AFTER. Uma falha
                # isolada de refresh não deve fazer o card oscilar online/offline.
                return data, ""
        return None, entry.get("error") or "Leitura IB-COM em inicialização"


def start_background(generator_provider) -> None:
    global _background_thread
    with _guard:
        if _background_thread is not None and _background_thread.is_alive():
            return
        _background_stop.clear()

        def run() -> None:
            while not _background_stop.is_set():
                try:
                    generators = list(generator_provider())
                except Exception as exc:
                    LOG.warning("IB-COM background inventory failed: %s", exc)
                    _background_stop.wait(5.0)
                    continue
                for generator in generators:
                    if supports(generator):
                        telemetry(generator)
                _background_stop.wait(max(1.0, _CACHE_TTL))

        _background_thread = threading.Thread(
            target=run,
            name="rc-ibcom-web",
            daemon=True,
        )
        _background_thread.start()


def stop_background() -> None:
    global _background_thread
    _background_stop.set()
    thread = _background_thread
    if thread is not None and thread.is_alive():
        thread.join(timeout=2.0)
    _background_thread = None
    with _guard:
        sessions = list(_sessions.values())
        _sessions.clear()
    for session in sessions:
        try:
            session.logout()
        except Exception:
            pass


def suspend_for_control(generator_id: str, seconds: float = 45.0) -> None:
    generator_id = str(generator_id or "")
    session = None
    with _guard:
        _suspended_until[generator_id] = time.monotonic() + max(5.0, float(seconds))
        session = _sessions.pop(generator_id, None)
    if session is not None:
        session.logout()


def resume_after_control(generator_id: str, delay_seconds: float = 2.0) -> None:
    generator_id = str(generator_id or "")
    with _guard:
        _suspended_until[generator_id] = time.monotonic() + max(0.0, float(delay_seconds))
