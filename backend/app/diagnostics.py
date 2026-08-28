import os
import shutil
import subprocess
from pathlib import Path

from . import db
from .config import CONTROL_SOCKET, PROJECT_ROOT, RAPID_BINDINGS_FILE, RAPID_COMM_CONFIG, RAPID_READER_DLL
from .rapid import overlay_generators

SERVICES = [
    "rc-geradores-api.service",
    "rc-geradores-worker.service",
    "rc-geradores-frontend.service",
    "rc-geradores-bridge.service",
    "rc-geradores-provision.service",
    "scadaserver6.service",
    "scadacomm6.service",
    "nginx.service",
]


def _run(args, timeout=2):
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return proc.returncode, (proc.stdout or proc.stderr).strip()
    except Exception as exc:
        return 1, str(exc)


def _service(name):
    rc, out = _run(["systemctl", "is-active", name])
    return {
        "id": name,
        "name": name.removesuffix(".service"),
        "status": "OK" if rc == 0 and out == "active" else "DOWN",
        "detail": out or "indisponível",
    }


def _listening_ports() -> set[int]:
    """Lê listeners via ss sem abrir conexão e sem tocar na sessão do modem."""
    rc, out = _run(["ss", "-lntH"])
    if rc != 0:
        return set()
    ports: set[int] = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[3]
        try:
            ports.add(int(local.rsplit(":", 1)[1]))
        except (ValueError, IndexError):
            continue
    return ports


def _memory():
    values = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, rest = line.split(":", 1)
            values[key] = int(rest.strip().split()[0]) * 1024
    except Exception:
        return None
    total = values.get("MemTotal", 0)
    avail = values.get("MemAvailable", 0)
    return {
        "total": total,
        "available": avail,
        "used": max(0, total - avail),
        "usedPercent": round((total - avail) * 100 / total, 1) if total else 0,
    }


def version_info():
    _, git_sha = _run(["git", "-C", str(PROJECT_ROOT), "rev-parse", "--short=12", "HEAD"])
    _, git_branch = _run(["git", "-C", str(PROJECT_ROOT), "branch", "--show-current"])
    rc, rapid_pkg = _run(["dpkg-query", "-W", "-f=${Version}", "rapidscada"])
    return {
        "application": "RC Geradores",
        "apiVersion": "2.0.0",
        "gitSha": git_sha if git_sha and "fatal:" not in git_sha else "N/D",
        "gitBranch": git_branch or "N/D",
        "rapidScada": rapid_pkg if rc == 0 else "detectar na VM",
    }


def system_diagnostics():
    services = [_service(name) for name in SERVICES]
    usage = shutil.disk_usage("/")
    try:
        load = os.getloadavg()
        load_avg = [round(x, 2) for x in load]
    except OSError:
        load_avg = []

    raw_generators = db.list_generators()
    generators = overlay_generators(raw_generators)
    listening = _listening_ports()
    local_offset = int(os.environ.get("RC_RAPID_LOCAL_OFFSET", "10000"))
    reverse_listeners = []
    for generator in raw_generators:
        if not generator.get("enabled") or generator.get("transport") != "reverse_tcp":
            continue
        remote_port = int(generator.get("listen_port") or 0)
        if not 1 <= remote_port <= 65535:
            continue
        local_port = remote_port + local_offset
        reverse_listeners.append(
            {
                "generatorId": generator["id"],
                "tag": generator.get("tag") or generator["id"],
                "remotePort": remote_port,
                "localPort": local_port,
                "remoteListening": remote_port in listening,
                "localListening": local_port in listening,
            }
        )

    return {
        "ok": all(item["status"] == "OK" for item in services),
        "services": services,
        "rapid": {
            "bindingsExists": RAPID_BINDINGS_FILE.exists(),
            "readerExists": RAPID_READER_DLL.exists(),
            "commConfigExists": RAPID_COMM_CONFIG.exists(),
        },
        "bridge": {
            "controlSocket": CONTROL_SOCKET,
            "controlSocketExists": Path(CONTROL_SOCKET).exists(),
            "listeners": reverse_listeners,
        },
        "host": {
            "loadAverage": load_avg,
            "memory": _memory(),
            "disk": {
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "usedPercent": round(usage.used * 100 / usage.total, 1),
            },
        },
        "generators": [
            {
                "id": g["id"],
                "tag": g["tag"],
                "status": g["status"],
                "rapidDeviceNum": g.get("rapidDeviceNum"),
                "source": g.get("telemetrySource"),
                "lastError": g.get("lastError") or "",
                "availableMetrics": g.get("availableMetrics") or [],
            }
            for g in generators
        ],
        "version": version_info(),
    }
