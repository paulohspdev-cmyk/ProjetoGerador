import ipaddress
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from . import db, domain_store, platform_store, traffic_store
from .config import (
    API_DOCS_ENABLED,
    APP_VERSION,
    BACKUP_OFFSITE_DIR,
    BACKUP_OFFSITE_KEY_FILE,
    BACKUP_OFFSITE_REQUIRED,
    BRIDGE_STATUS_FILE,
    CONTROL_SOCKET,
    ENVIRONMENT,
    PROJECT_ROOT,
    RAPID_BINDINGS_FILE,
    RAPID_COMM_CONFIG,
    RAPID_READER_DLL,
    SMTP_HOST,
    WHATSAPP_API_URL,
)
from .controller_library import pack_for_model, pack_is_production_ready
from .rapid import load_bindings, overlay_generators

SERVICES = [
    "rc-geradores-api.service",
    "rc-geradores-worker.service",
    "rc-geradores-frontend.service",
    "rc-geradores-bridge.service",
    "rc-geradores-provision.service",
    "scadaserver6.service",
    "scadacomm6.service",
]
RAPID_NATIVE_NETWORK_SERVICES = (
    "scadaserver6.service",
    "scadaagent6.service",
    "scadaweb6.service",
)


def _service_names() -> list[str]:
    services = list(SERVICES)
    if os.environ.get("RC_WEB_TLS_MODE", "managed").strip() != "external_proxy":
        services.append("nginx.service")
    return services


def _safe_exists(path) -> bool:
    try:
        return Path(path).exists()
    except OSError:
        return False


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


def _rapid_native_network_policy() -> tuple[bool, str]:
    raw = os.environ.get("RC_RAPID_ADMIN_ALLOWED_CIDRS", "")
    admin_networks: set[str] = set()
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            network = ipaddress.ip_network(token, strict=False)
        except ValueError:
            return False, f"RC_RAPID_ADMIN_ALLOWED_CIDRS contém CIDR inválido: {token}"
        if network.prefixlen == 0:
            return False, f"RC_RAPID_ADMIN_ALLOWED_CIDRS contém rede ampla demais: {network}"
        admin_networks.add(str(network))

    required_allow = {"127.0.0.0/8", "::1/128", *admin_networks}
    required_deny = {"0.0.0.0/0", "::/0"}
    errors: list[str] = []

    for service in RAPID_NATIVE_NETWORK_SERVICES:
        rc, out = _run(
            [
                "systemctl",
                "show",
                service,
                "-p",
                "IPAddressAllow",
                "-p",
                "IPAddressDeny",
                "--no-pager",
            ]
        )
        if rc != 0:
            errors.append(f"{service}: não foi possível ler política systemd")
            continue

        properties: dict[str, set[str]] = {}
        for line in out.splitlines():
            key, sep, value = line.partition("=")
            if sep:
                properties[key] = {item for item in value.split() if item}

        allow = properties.get("IPAddressAllow", set())
        deny = properties.get("IPAddressDeny", set())
        missing_allow = sorted(required_allow - allow)
        missing_deny = sorted(required_deny - deny)
        if missing_allow:
            errors.append(f"{service}: allow ausente {', '.join(missing_allow)}")
        if missing_deny:
            errors.append(f"{service}: deny ausente {', '.join(missing_deny)}")

    if errors:
        return False, "; ".join(errors)
    if admin_networks:
        return (
            True,
            "Server/Agent/Webstation restritos a loopback e redes administrativas: "
            + ", ".join(sorted(admin_networks)),
        )
    return True, "Server/Agent/Webstation restritos somente a loopback"


def _external_proxy_topology(listening_ports: set[int]) -> tuple[bool | None, str]:
    mode = os.environ.get("RC_WEB_TLS_MODE", "managed").strip()
    if mode != "external_proxy":
        return None, ""

    rc, out = _run(["systemctl", "is-active", "nginx.service"])
    local_nginx_active = rc == 0 and out == "active"
    local_tls_active = 443 in listening_ports
    if local_nginx_active and local_tls_active:
        return (
            False,
            "RC_WEB_TLS_MODE=external_proxy, mas Nginx local continua ativo em 443; "
            "valide dupla terminação TLS e preservação do IP real do cliente",
        )
    return True, "HTTPS/TLS não está sendo terminado pelo Nginx local"


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


def _bridge_runtime_status() -> dict:
    try:
        raw = json.loads(BRIDGE_STATUS_FILE.read_text(encoding="utf-8"))
        updated = int(raw.get("updatedAt") or 0)
        ports = raw.get("ports") if isinstance(raw.get("ports"), list) else []
        security = raw.get("security") if isinstance(raw.get("security"), dict) else {}
        age = max(0, int(time.time()) - updated) if updated else None
        return {
            "statusFile": str(BRIDGE_STATUS_FILE),
            "statusAvailable": True,
            "statusFresh": bool(age is not None and age <= 15),
            "updatedAt": updated or None,
            "ageSeconds": age,
            "sessions": ports,
            "security": security,
        }
    except Exception:
        return {
            "statusFile": str(BRIDGE_STATUS_FILE),
            "statusAvailable": False,
            "statusFresh": False,
            "updatedAt": None,
            "ageSeconds": None,
            "sessions": [],
            "security": {},
        }


def _connection_diagnosis(session: dict, listeners: dict[int, dict], status_fresh: bool) -> dict:
    port = int(session.get("remotePort") or 0)
    listener = listeners.get(port) or {}
    if not status_fresh:
        return {"code": "system_status_stale", "origin": "system", "label": "Monitor do sistema sem atualização"}
    if not listener.get("remoteListening") or not listener.get("localListening"):
        return {"code": "system_listener_down", "origin": "system", "label": "Porta do sistema indisponível"}
    if int(session.get("rejectedConnections") or 0) > 0:
        return {"code": "connection_rejected", "origin": "configuration", "label": "Conexões recusadas por proteção ou configuração"}
    if not session.get("connected"):
        return {"code": "field_tcp_disconnected", "origin": "field", "label": "Modem ou enlace de campo desconectado"}

    generators = session.get("generators") if isinstance(session.get("generators"), list) else []
    provisioned = [item for item in generators if isinstance(item, dict) and item.get("rapidDeviceNum") is not None]
    if generators and not provisioned:
        return {
            "code": "no_rapid_device",
            "origin": "configuration",
            "label": "TCP conectado, mas nenhum gerador desta porta está provisionado no motor de telemetria",
        }

    connected_at = int(session.get("connectedAt") or 0)
    no_traffic = int(session.get("bytesRx") or 0) == 0 and int(session.get("bytesTx") or 0) == 0
    if provisioned and no_traffic and connected_at and int(time.time()) - connected_at >= 60:
        return {
            "code": "rapid_polling_absent",
            "origin": "system",
            "label": "Modem conectado e provisionado, mas sem tráfego de polling do motor de telemetria",
        }

    unit_health = session.get("unitHealth") if isinstance(session.get("unitHealth"), dict) else {}
    timed_out = [
        unit
        for unit, item in unit_health.items()
        if isinstance(item, dict) and int(item.get("consecutiveTimeouts") or 0) > 0
    ]
    if timed_out:
        return {
            "code": "controller_timeout",
            "origin": "controller",
            "label": "Modem conectado; controladora ou barramento sem resposta",
            "units": timed_out,
        }
    return {"code": "healthy", "origin": "none", "label": "Comunicação normal"}


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
    git_base = ["git", "-c", f"safe.directory={PROJECT_ROOT}", "-C", str(PROJECT_ROOT)]
    _, git_sha = _run([*git_base, "rev-parse", "--short=12", "HEAD"])
    _, git_branch = _run([*git_base, "branch", "--show-current"])
    rc, rapid_pkg = _run(["dpkg-query", "-W", "-f=${Version}", "rapidscada"])
    return {
        "application": "RC Geradores",
        "apiVersion": APP_VERSION,
        "gitSha": git_sha if git_sha and "fatal:" not in git_sha else "N/D",
        "gitBranch": git_branch or "N/D",
        "rapidScada": rapid_pkg if rc == 0 else "detectar na VM",
    }


def _production_readiness(
    raw_generators: list[dict],
    *,
    reverse_tcp_exposed: bool,
    reverse_tcp_allowlist: bool,
    rapid_native_policy_ok: bool | None = None,
    rapid_native_policy_detail: str = "",
    external_proxy_topology_ok: bool | None = None,
    external_proxy_topology_detail: str = "",
) -> dict:
    checks: list[dict] = []

    def add(check_id: str, label: str, ok: bool, severity: str, detail: str) -> None:
        checks.append(
            {
                "id": check_id,
                "label": label,
                "ok": bool(ok),
                "severity": "ok" if ok else severity,
                "detail": detail,
            }
        )

    add(
        "environment",
        "Modo de execução",
        ENVIRONMENT == "production",
        "blocker",
        f"RC_ENVIRONMENT={ENVIRONMENT}",
    )

    lab_flags = [
        name
        for name in ("RC_ENABLE_DSE_LAB_CONTROL", "RC_ENABLE_IG4_LAB_CONTROL")
        if os.environ.get(name, "0").strip() == "1"
    ]
    add(
        "lab_control",
        "Controles LAB",
        not lab_flags,
        "blocker",
        "Desabilitados" if not lab_flags else "Ativos: " + ", ".join(lab_flags),
    )
    add(
        "api_docs",
        "Documentação interativa da API",
        not API_DOCS_ENABLED,
        "warning",
        "Desabilitada" if not API_DOCS_ENABLED else "RC_API_DOCS=1",
    )
    if external_proxy_topology_ok is not None:
        add(
            "external_proxy_topology",
            "Topologia do proxy externo",
            external_proxy_topology_ok,
            "warning",
            external_proxy_topology_detail
            or (
                "Sem terminação TLS local adicional"
                if external_proxy_topology_ok
                else "Possível dupla terminação TLS local"
            ),
        )
    add(
        "reverse_tcp_allowlist",
        "Proteção das portas reverse TCP",
        not reverse_tcp_exposed or reverse_tcp_allowlist,
        "blocker",
        (
            "Sem listener reverse TCP exposto"
            if not reverse_tcp_exposed
            else "Allowlist ativa"
            if reverse_tcp_allowlist
            else "Listeners expostos sem allowlist de origem"
        ),
    )
    if rapid_native_policy_ok is not None:
        add(
            "rapid_native_network_policy",
            "Proteção das portas nativas do Rapid SCADA",
            rapid_native_policy_ok,
            "blocker",
            rapid_native_policy_detail
            or (
                "Política systemd aplicada"
                if rapid_native_policy_ok
                else "Política systemd não aplicada ou incompleta"
            ),
        )

    offsite_ready = bool(
        BACKUP_OFFSITE_REQUIRED
        and BACKUP_OFFSITE_DIR
        and BACKUP_OFFSITE_KEY_FILE
        and Path(BACKUP_OFFSITE_KEY_FILE).is_file()
    )
    add(
        "backup_offsite",
        "Backup off-site",
        offsite_ready,
        "blocker",
        (
            "Obrigatório, destino e chave configurados"
            if offsite_ready
            else "Falta RC_BACKUP_OFFSITE_REQUIRED=1, destino off-site e/ou chave externa"
        ),
    )

    users = [item for item in db.list_users() if item.get("active")]
    privileged = [
        item for item in users if item.get("role") in {"administrador", "operador"}
    ]
    missing_2fa = []
    for user in privileged:
        item = platform_store.get_totp(str(user.get("id") or ""))
        if not item or not item.get("enabled"):
            missing_2fa.append(str(user.get("email") or user.get("name") or user.get("id")))
    add(
        "privileged_2fa",
        "2FA de contas privilegiadas",
        not missing_2fa,
        "blocker",
        "Todas protegidas" if not missing_2fa else "Sem 2FA: " + ", ".join(missing_2fa),
    )

    bindings = {
        str(item.get("generator_id") or ""): item
        for item in load_bindings()
        if item.get("generator_id")
    }
    no_pack: list[str] = []
    no_binding: list[str] = []
    missing_nominal_support: list[str] = []
    missing_site: list[str] = []
    missing_customer: list[str] = []
    missing_command_firmware: list[str] = []
    missing_readonly_firmware: list[str] = []
    test_assets: list[str] = []

    assets_by_generator = {
        str(item.get("legacy_generator_id") or ""): item
        for item in domain_store.list_assets()
        if item.get("legacy_generator_id")
    }
    controllers_by_asset: dict[str, list[dict]] = {}
    for controller in domain_store.list_controllers():
        controllers_by_asset.setdefault(str(controller.get("asset_id") or ""), []).append(controller)

    for generator in raw_generators:
        if not generator.get("enabled"):
            continue
        tag = str(generator.get("tag") or generator.get("id") or "N/D")
        pack = pack_for_model(generator.get("controller_model") or "")
        pack_ready = pack_is_production_ready(pack)
        if not pack_ready:
            no_pack.append(tag)
        elif str(generator.get("id") or "") not in bindings:
            no_binding.append(tag)

        # nominal_power_kw é telemetria da controladora nos packs que a
        # documentam; não existe campo nominal persistido no cadastro legado.
        # Portanto production readiness não pode criar um blocker impossível
        # de satisfazer quando a controladora está desligada.
        validated_metrics = set((pack or {}).get("validatedTelemetry") or [])
        mapped_registers = ((pack or {}).get("mapping") or {}).get("registers") or {}
        nominal_supported = (
            "nominal_power_kw" in validated_metrics
            or (
                isinstance(mapped_registers, dict)
                and "nominal_power_kw" in mapped_registers
            )
        )
        if not nominal_supported:
            missing_nominal_support.append(tag)
        site = str(generator.get("site") or "").strip().lower()
        if not site or site in {"sem unidade", "n/d"}:
            missing_site.append(tag)
        if not str(generator.get("customer") or "").strip():
            missing_customer.append(tag)

        asset = assets_by_generator.get(str(generator.get("id") or ""))
        controllers = controllers_by_asset.get(str((asset or {}).get("id") or ""), [])
        firmware_missing = not controllers or all(
            not str(item.get("firmware") or "").strip() for item in controllers
        )
        if pack_ready and firmware_missing:
            capabilities = (pack or {}).get("capabilities") or {}
            command_capable = any(
                bool(capabilities.get(action))
                for action in (
                    "start",
                    "stop",
                    "auto",
                    "manual",
                    "test",
                    "mcb_open",
                    "mcb_close",
                    "gcb_open",
                    "gcb_close",
                    "paralleling",
                )
            )
            if command_capable:
                missing_command_firmware.append(tag)
            else:
                missing_readonly_firmware.append(tag)

        if tag.upper().startswith(("TESTE", "TEST-", "LAB-")):
            test_assets.append(tag)

    add(
        "controller_packs",
        "Controller Packs de produção",
        not no_pack,
        "blocker",
        "Todos os ativos possuem pack production" if not no_pack else "Sem pack production: " + ", ".join(no_pack),
    )
    add(
        "industrial_bindings",
        "Bindings industriais",
        not no_binding,
        "blocker",
        "Todos os equipamentos suportados estão provisionados" if not no_binding else "Sem binding: " + ", ".join(no_binding),
    )
    add(
        "nominal_power",
        "Potência nominal disponível",
        not missing_nominal_support,
        "warning",
        (
            "Controller Packs disponibilizam kW nominal quando a telemetria estiver ativa"
            if not missing_nominal_support
            else "Sem métrica nominal homologada: " + ", ".join(missing_nominal_support)
        ),
    )
    add(
        "site_assignment",
        "Unidade/site cadastrado",
        not missing_site,
        "warning",
        "Completo" if not missing_site else "Sem unidade: " + ", ".join(missing_site),
    )
    add(
        "customer_assignment",
        "Cliente cadastrado",
        not missing_customer,
        "warning",
        "Completo" if not missing_customer else "Sem cliente: " + ", ".join(missing_customer),
    )
    add(
        "controller_firmware",
        "Firmware de controladoras com comando",
        not missing_command_firmware,
        "blocker",
        "Firmware registrado para todas as controladoras com comando habilitado"
        if not missing_command_firmware
        else "Firmware não informado em controladora com comando: "
        + ", ".join(missing_command_firmware),
    )
    add(
        "controller_firmware_readonly",
        "Inventário de firmware read-only",
        not missing_readonly_firmware,
        "warning",
        "Firmware registrado para as controladoras read-only"
        if not missing_readonly_firmware
        else "Firmware ainda não inventariado em read-only: "
        + ", ".join(missing_readonly_firmware),
    )
    notifications_ready = bool(SMTP_HOST or WHATSAPP_API_URL)
    add(
        "notification_channel",
        "Canal de notificação",
        notifications_ready,
        "warning",
        "Canal externo configurado"
        if notifications_ready
        else "SMTP e WhatsApp não configurados",
    )
    add(
        "test_assets",
        "Cadastros de teste",
        not test_assets,
        "warning",
        "Nenhum cadastro de teste ativo" if not test_assets else "Ativos: " + ", ".join(test_assets),
    )

    blockers = [item for item in checks if not item["ok"] and item["severity"] == "blocker"]
    warnings = [item for item in checks if not item["ok"] and item["severity"] == "warning"]
    return {
        "ready": not blockers,
        "blockers": len(blockers),
        "warnings": len(warnings),
        "checks": checks,
        "note": "Estado online das controladoras não é requisito deste checklist enquanto equipamentos estiverem desligados.",
    }


def system_diagnostics():
    services = [_service(name) for name in _service_names()]
    usage = shutil.disk_usage("/")
    try:
        load = os.getloadavg()
        load_avg = [round(x, 2) for x in load]
    except OSError:
        load_avg = []

    raw_generators = db.list_generators()
    generators = overlay_generators(raw_generators)
    listening = _listening_ports()
    external_proxy_topology_ok, external_proxy_topology_detail = _external_proxy_topology(listening)
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

    runtime_bridge = _bridge_runtime_status()
    bridge_security = runtime_bridge.get("security") if isinstance(runtime_bridge.get("security"), dict) else {}
    listeners_exposed = any(item.get("remoteListening") for item in reverse_listeners)
    allowlist_enabled = bool(bridge_security.get("peerAllowlistEnabled"))
    bridge_security = {
        **bridge_security,
        "reverseTcpListenersExposed": listeners_exposed,
        "risk": "high" if listeners_exposed and not allowlist_enabled else "ok",
        "label": (
            "Listeners reverse TCP expostos sem allowlist de peers"
            if listeners_exposed and not allowlist_enabled
            else "Peers reverse TCP protegidos por allowlist"
            if listeners_exposed
            else "Nenhum listener reverse TCP exposto"
        ),
    }
    runtime_bridge["security"] = bridge_security
    listeners_by_port = {int(item["remotePort"]): item for item in reverse_listeners}
    runtime_bridge["sessions"] = [
        {
            **session,
            "diagnosis": _connection_diagnosis(
                session,
                listeners_by_port,
                bool(runtime_bridge.get("statusFresh")),
            ),
        }
        for session in runtime_bridge.get("sessions") or []
    ]
    traffic = traffic_store.record_bridge_traffic(
        runtime_bridge.get("sessions") or [],
        runtime_bridge.get("updatedAt") or int(time.time()),
    )
    workers = platform_store.worker_health()
    queues = platform_store.queue_health()
    observability = {
        "healthy": all(item.get("healthy") for item in workers) and bool(queues.get("healthy")),
        "workers": workers,
        "queues": queues,
    }
    rapid_native_policy_ok, rapid_native_policy_detail = _rapid_native_network_policy()
    return {
        "ok": all(item["status"] == "OK" for item in services),
        "services": services,
        "rapid": {
            "bindingsExists": _safe_exists(RAPID_BINDINGS_FILE),
            "readerExists": _safe_exists(RAPID_READER_DLL),
            "commConfigExists": _safe_exists(RAPID_COMM_CONFIG),
        },
        "bridge": {
            "controlSocket": CONTROL_SOCKET,
            "controlSocketExists": _safe_exists(CONTROL_SOCKET),
            "listeners": reverse_listeners,
            **runtime_bridge,
            "traffic": traffic,
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
        "observability": observability,
        "productionReadiness": _production_readiness(
            raw_generators,
            reverse_tcp_exposed=listeners_exposed,
            reverse_tcp_allowlist=allowlist_enabled,
            rapid_native_policy_ok=rapid_native_policy_ok,
            rapid_native_policy_detail=rapid_native_policy_detail,
            external_proxy_topology_ok=external_proxy_topology_ok,
            external_proxy_topology_detail=external_proxy_topology_detail,
        ),
        "version": version_info(),
    }