import json
import math
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone

from .config import RAPID_BINDINGS_FILE, RAPID_CACHE_TTL, RAPID_COMM_CONFIG, RAPID_READER_DLL
from .controller_library import pack_for_model

_cache = {"at": 0.0, "channels": {}, "error": ""}
_cache_lock = threading.Lock()

_IG200_UNDEFINED = {-32768.0, 32768.0, -2147483648.0, 2147483648.0}


def load_bindings():
    try:
        data = json.loads(RAPID_BINDINGS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def binding_for(generator, bindings):
    ctype = str(generator.get("controller_type", "")).upper()
    model = str(generator.get("controller_model", "")).strip().lower()
    port = int(generator.get("listen_port") or 0)
    unit = int(generator.get("modbus_unit") or 0)
    rapid_device = generator.get("rapid_device_num")

    for item in bindings:
        if str(item.get("controller_type", "")).upper() != ctype:
            continue
        if str(item.get("controller_model", "")).strip().lower() != model:
            continue
        if rapid_device and int(item.get("rapid_device_num") or 0) == int(rapid_device):
            return item
        if int(item.get("listen_port") or 0) == port and int(item.get("modbus_unit") or 0) == unit:
            return item
    return None


def _reader_ready():
    if not RAPID_READER_DLL.exists():
        return f"Leitor Rapid SCADA não instalado: {RAPID_READER_DLL}"
    if not RAPID_COMM_CONFIG.exists():
        return f"Configuração Rapid SCADA não encontrada: {RAPID_COMM_CONFIG}"
    return ""


def _is_undefined_raw(generator, raw_value):
    model = str(generator.get("controller_model") or "").strip().lower()
    if model not in {"inteligen 200", "comap inteligen 200", "ig200", "ig 200"}:
        return False
    try:
        return float(raw_value) in _IG200_UNDEFINED
    except (TypeError, ValueError, OverflowError):
        return False


def _cache_hit(nums, now):
    return now - _cache["at"] < RAPID_CACHE_TTL and all(n in _cache["channels"] for n in nums)


def read_channels(channel_nums):
    """Lê todos os canais em lote e evita stampede do processo .NET quando o cache expira."""
    nums = sorted({int(n) for n in channel_nums})
    if not nums:
        return {}, ""

    now = time.monotonic()
    if _cache_hit(nums, now):
        return {n: _cache["channels"][n] for n in nums}, _cache["error"]

    with _cache_lock:
        now = time.monotonic()
        if _cache_hit(nums, now):
            return {n: _cache["channels"][n] for n in nums}, _cache["error"]

        ready_error = _reader_ready()
        if ready_error:
            return {}, ready_error

        cmd = [
            "dotnet",
            str(RAPID_READER_DLL),
            str(RAPID_COMM_CONFIG),
            "current",
            *[str(n) for n in nums],
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=4, check=False)
        except Exception as exc:
            return {}, f"Falha ao consultar Rapid SCADA: {exc}"

        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "erro desconhecido").strip()
            return {}, f"Rapid SCADA: {detail[:300]}"

        try:
            payload = json.loads(proc.stdout)
            channels = {
                int(item["cnl"]): {
                    "val": item.get("val", 0),
                    "stat": int(item.get("stat", 0)),
                    "defined": bool(item.get("defined", False)),
                }
                for item in payload.get("channels", [])
            }
        except Exception as exc:
            return {}, f"Resposta inválida do Rapid SCADA: {exc}"

        _cache["at"] = time.monotonic()
        _cache["channels"] = channels
        _cache["error"] = ""
        return channels, ""


def trend_for_generator(generator, metric, hours=24, archive_bit=1):
    hours = max(1, min(int(hours), 24 * 31))
    archive_bit = int(archive_bit)
    if archive_bit not in {1, 2, 3}:
        raise ValueError("ArchiveBit permitido: 1 minuto, 2 horário ou 3 diário")

    binding = binding_for(generator, load_bindings())
    if not binding:
        raise ValueError("Gerador sem binding Rapid SCADA")
    channel_cfg = (binding.get("channels") or {}).get(metric)
    if not channel_cfg or "cnl" not in channel_cfg:
        available = ", ".join(sorted((binding.get("channels") or {}).keys()))
        raise ValueError(f"Métrica não disponível neste Controller Pack. Disponíveis: {available}")

    ready_error = _reader_ready()
    if ready_error:
        raise ConnectionError(ready_error)

    cnl = int(channel_cfg["cnl"])
    scale = float(channel_cfg.get("scale", 1.0))
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    cmd = [
        "dotnet",
        str(RAPID_READER_DLL),
        str(RAPID_COMM_CONFIG),
        "trend",
        str(archive_bit),
        str(cnl),
        start.isoformat(),
        end.isoformat(),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15, check=False)
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Timeout ao consultar histórico do Rapid SCADA") from exc
    except Exception as exc:
        raise ConnectionError(f"Falha ao consultar histórico Rapid SCADA: {exc}") from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "erro desconhecido").strip()
        raise ConnectionError(f"Rapid SCADA: {detail[:500]}")

    try:
        payload = json.loads(proc.stdout)
    except Exception as exc:
        raise ConnectionError(f"Resposta inválida do histórico Rapid SCADA: {exc}") from exc

    points = []
    for item in payload.get("points", []):
        if not item.get("defined"):
            continue
        raw_value = item.get("val", 0)
        if _is_undefined_raw(generator, raw_value):
            continue
        try:
            value = float(raw_value) * scale
        except (TypeError, ValueError, OverflowError):
            continue
        if not math.isfinite(value):
            continue
        points.append(
            {
                "timestamp": item.get("timestamp"),
                "value": round(value, 4),
                "stat": int(item.get("stat", 0)),
            }
        )

    max_points = 2000
    if len(points) > max_points:
        step = max(1, len(points) // max_points)
        sampled = points[::step]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])
        points = sampled[: max_points + 1]

    return {
        "generatorId": generator["id"],
        "tag": generator["tag"],
        "metric": metric,
        "cnl": cnl,
        "scale": scale,
        "archiveBit": archive_bit,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "points": points,
    }


def available_metrics(generator):
    binding = binding_for(generator, load_bindings())
    if not binding:
        return []
    return [
        {
            "key": key,
            "cnl": int(cfg["cnl"]),
            "scale": float(cfg.get("scale", 1.0)),
        }
        for key, cfg in (binding.get("channels") or {}).items()
        if "cnl" in cfg
    ]


def _mode(values):
    if "controller_mode_raw" not in values:
        return "OFF"
    raw = values.get("controller_mode_raw")
    return {0: "OFF", 1: "MANUAL", 2: "AUTO", 3: "TESTE"}.get(raw, "OFF")


def _pack(generator):
    model = str(generator.get("controller_model") or "").strip()
    return pack_for_model(model) if model else None


def _metric_units(generator, configured: list[str]) -> dict[str, str]:
    pack = _pack(generator)
    if not pack:
        return {}
    allowed = set(configured)
    units = dict(pack.get("metricUnits") or {})
    for spec in (pack.get("rapid") or {}).get("channels") or []:
        key = str(spec.get("key") or "")
        unit = str(spec.get("unit") or "")
        if key and unit:
            units.setdefault(key, unit)
    return {str(key): str(unit) for key, unit in units.items() if key in allowed and str(unit)}


def _metric_limits(generator) -> dict:
    pack = _pack(generator)
    limits = (pack or {}).get("metricLimits") or {}
    return dict(limits) if isinstance(limits, dict) else {}


def _effective_capabilities(generator, status: str, binding_present: bool) -> dict[str, bool]:
    pack = _pack(generator)
    declared = (pack or {}).get("capabilities") or {}
    production = bool(pack and pack.get("lifecycle") == "production" and pack.get("status") == "field_validated")
    online = status == "online"
    return {
        "telemetry": bool(production and binding_present and declared.get("telemetry")),
        "start": bool(production and online and declared.get("start")),
        "stop": bool(production and online and declared.get("stop")),
        "auto": False,
        "manual": False,
        "test": False,
        "mcb_open": False,
        "mcb_close": False,
        "gcb_open": False,
        "gcb_close": False,
        "paralleling": False,
    }


def _derive_breaker_feedback(values):
    """Deriva feedbacks apenas para estados agregados semanticamente inequívocos."""
    raw = values.get("breaker_state_raw")
    mapping = {
        1: (False, False),
        2: (False, True),
        3: (True, False),
        4: (True, True),
        10: (False, True),
        11: (True, True),
    }
    if raw not in mapping:
        return []
    mcb, gcb = mapping[raw]
    values["mcb_closed"] = 1 if mcb else 0
    values["gcb_closed"] = 1 if gcb else 0
    return ["mcb_closed", "gcb_closed"]


def _frontend_generator(
    generator,
    values,
    status,
    error="",
    defined=None,
    configured_metrics=None,
    binding_present=False,
):
    enabled = bool(generator.get("enabled"))
    rpm = int(values.get("rpm") or 0)
    online = status == "online"
    fault = status == "fault"
    defined_metrics = sorted(set(defined or []))
    configured_metrics = sorted(set(configured_metrics or []))
    units = _metric_units(generator, configured_metrics)
    metric_states = {
        key: {
            "configured": True,
            "defined": key in values,
            "value": values.get(key),
            "unit": units.get(key),
        }
        for key in configured_metrics
    }

    return {
        "id": generator["id"],
        "tag": generator["tag"],
        "name": generator.get("name") or generator["tag"],
        "customer": generator.get("customer") or "",
        "controller": generator.get("controller_model") or generator.get("controller_type") or "",
        "controllerType": generator.get("controller_type") or "",
        "site": generator.get("site") or "",
        "enabled": enabled,
        "status": "alerta"
        if fault
        else "online"
        if online
        else "offline"
        if enabled
        else "nao_configurado",
        "mode": _mode(values),
        "ip": generator.get("host")
        or (f"TCP {generator.get('listen_port')}" if generator.get("listen_port") else "—"),
        "transport": generator.get("transport") or "reverse_tcp",
        "listenPort": generator.get("listen_port"),
        "modbusUnit": generator.get("modbus_unit"),
        "battery": values.get("battery_voltage"),
        "frequency": values.get("frequency"),
        "mainsFrequency": values.get("mains_frequency"),
        "nominalPower": values.get("nominal_power_kw"),
        "rpm": rpm,
        "load": float(values.get("power_kw") or 0),
        "oilPressure": float(values.get("oil_pressure") or 0),
        "coolantTemp": float(values.get("coolant_temperature") or 0),
        "fuelLevel": float(values.get("fuel_level") or 0),
        "alternatorVoltage": float(values.get("alternator_voltage") or 0),
        "maintenance": float(values.get("maintenance_hours") or 0),
        "runHours": float(values.get("run_hours") or 0),
        "latency": None,
        "alarms": 1 if fault else int(values.get("alarm_count") or 0),
        "mcb": bool(values.get("mcb_closed", False)),
        "gcb": bool(values.get("gcb_closed", False)),
        "mains": {
            "l1": float(values.get("mains_voltage_l1") or 0),
            "l2": float(values.get("mains_voltage_l2") or 0),
            "l3": float(values.get("mains_voltage_l3") or 0),
            "l12": float(values.get("mains_voltage_l1_l2") or 0),
        },
        "gen": {
            "l1": float(values.get("voltage_l1") or 0),
            "l2": float(values.get("voltage_l2") or 0),
            "l3": float(values.get("voltage_l3") or 0),
            "l12": float(values.get("voltage_l1_l2") or 0),
        },
        "metrics": dict(values),
        # Compatibilidade: availableMetrics passa a significar valor definido agora.
        "availableMetrics": defined_metrics,
        "definedMetrics": defined_metrics,
        "configuredMetrics": configured_metrics,
        "metricStates": metric_states,
        "metricUnits": units,
        "metricLimits": _metric_limits(generator),
        "capabilities": _effective_capabilities(generator, status, binding_present),
        "telemetrySource": "rapid_scada"
        if status in {"online", "fault", "connected"}
        else "none",
        "rapidDeviceNum": generator.get("rapid_device_num"),
        "lastError": error,
    }


def _overlay_generators(generators):
    bindings = load_bindings()
    matched = []
    all_channels = []

    for generator in generators:
        binding = binding_for(generator, bindings)
        matched.append(binding)
        if binding:
            for cfg in (binding.get("channels") or {}).values():
                if "cnl" in cfg:
                    all_channels.append(int(cfg["cnl"]))

    channel_data, read_error = read_channels(all_channels)
    result = []

    for generator, binding in zip(generators, matched):
        configured = sorted((binding.get("channels") or {}).keys()) if binding else []
        if not generator.get("enabled"):
            result.append(
                _frontend_generator(
                    generator,
                    {},
                    "disabled",
                    defined=[],
                    configured_metrics=configured,
                    binding_present=bool(binding),
                )
            )
            continue
        if not binding:
            result.append(
                _frontend_generator(
                    generator,
                    {},
                    "offline",
                    "Sem binding Rapid SCADA",
                    defined=[],
                    configured_metrics=[],
                    binding_present=False,
                )
            )
            continue

        values = {}
        invalid_values = []
        for key, cfg in (binding.get("channels") or {}).items():
            item = channel_data.get(int(cfg["cnl"]))
            if not item or not item.get("defined"):
                continue
            raw_value = item.get("val")
            if _is_undefined_raw(generator, raw_value):
                continue
            try:
                scale = float(cfg.get("scale", 1.0))
                value = float(raw_value) * scale
            except (TypeError, ValueError, OverflowError):
                invalid_values.append(key)
                continue
            if not math.isfinite(value):
                invalid_values.append(key)
                continue
            values[key] = (
                int(round(value))
                if abs(value - round(value)) < 1e-9
                and key not in {"frequency", "mains_frequency"}
                else round(value, 3)
            )

        derived = _derive_breaker_feedback(values)
        if derived:
            configured = sorted(set([*configured, *derived]))
        defined = sorted(values.keys())

        if read_error:
            result.append(
                _frontend_generator(
                    generator,
                    {},
                    "fault",
                    read_error,
                    defined=[],
                    configured_metrics=configured,
                    binding_present=True,
                )
            )
        elif values:
            detail = ""
            if invalid_values:
                detail = "Canais Rapid com valor inválido: " + ", ".join(sorted(invalid_values))
            result.append(
                _frontend_generator(
                    generator,
                    values,
                    "online",
                    detail,
                    defined=defined,
                    configured_metrics=configured,
                    binding_present=True,
                )
            )
        elif invalid_values:
            result.append(
                _frontend_generator(
                    generator,
                    {},
                    "fault",
                    "Rapid SCADA retornou apenas valores inválidos: "
                    + ", ".join(sorted(invalid_values)),
                    defined=[],
                    configured_metrics=configured,
                    binding_present=True,
                )
            )
        else:
            result.append(
                _frontend_generator(
                    generator,
                    {},
                    "connected",
                    "Rapid SCADA conectado, canais ainda sem dados definidos",
                    defined=[],
                    configured_metrics=configured,
                    binding_present=True,
                )
            )

    return result


def overlay_generators(generators):
    """Combina inventário persistido com telemetria sem permitir que a telemetria apague o parque."""
    generators = list(generators)
    try:
        return _overlay_generators(generators)
    except Exception as exc:
        print(f"[rapid] falha ao compor overlay: {type(exc).__name__}: {exc}", flush=True)
        detail = f"Telemetria Rapid indisponível ({type(exc).__name__})"
        return [
            _frontend_generator(
                generator,
                {},
                "offline",
                detail,
                defined=[],
                configured_metrics=[],
                binding_present=False,
            )
            for generator in generators
        ]


def dashboard(generators):
    return {
        "total": len(generators),
        "online": sum(g["status"] == "online" for g in generators),
        "alerts": sum(g["status"] == "alerta" for g in generators),
        "offline": sum(g["status"] == "offline" for g in generators),
        "notConfigured": sum(g["status"] == "nao_configurado" for g in generators),
        "running": sum(
            "rpm" in (g.get("definedMetrics") or g.get("availableMetrics") or [])
            and (g.get("rpm") or 0) > 300
            for g in generators
        ),
        "loadKw": round(
            sum(
                float(g.get("load") or 0)
                for g in generators
                if "power_kw" in (g.get("definedMetrics") or g.get("availableMetrics") or [])
            ),
            3,
        ),
    }
