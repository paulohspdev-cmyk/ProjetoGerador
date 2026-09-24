from __future__ import annotations

import json
from pathlib import Path

from .config import RAPID_BINDINGS_FILE


class BindingStoreError(RuntimeError):
    """Indica que o estado de bindings existe, mas não é seguro usá-lo."""


def _positive_int(value, label: str, index: int) -> int:
    try:
        parsed = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise BindingStoreError(f"binding[{index}] possui {label} inválido") from exc
    if parsed <= 0:
        raise BindingStoreError(f"binding[{index}] possui {label} inválido")
    return parsed


def validate_runtime_bindings(items: list[dict]) -> list[dict]:
    """Valida identidade e propriedade dos recursos Rapid usados em runtime.

    Lines podem ser compartilhadas por vários Units no mesmo reverse TCP, mas
    DeviceNum e CnlNum são recursos globais do BaseDAT e nunca podem pertencer a
    dois bindings ativos diferentes.
    """
    generator_owners: dict[str, int] = {}
    device_owners: dict[int, int] = {}
    channel_owners: dict[int, tuple[int, str]] = {}

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise BindingStoreError(f"binding[{index}] não é um objeto JSON")

        generator_id = str(item.get("generator_id") or "").strip()
        if generator_id:
            previous = generator_owners.get(generator_id)
            if previous is not None:
                raise BindingStoreError(
                    f"generator_id duplicado nos bindings: {generator_id} "
                    f"(índices {previous} e {index})"
                )
            generator_owners[generator_id] = index

        # Bindings canônicos legados podem não ter owner, mas quando carregados
        # no runtime precisam continuar apontando para identidade Rapid válida.
        if any(key in item for key in ("rapid_line_num", "rapid_device_num", "channels")):
            _positive_int(item.get("rapid_line_num"), "rapid_line_num", index)
            device_num = _positive_int(item.get("rapid_device_num"), "rapid_device_num", index)
            previous_device = device_owners.get(device_num)
            if previous_device is not None:
                raise BindingStoreError(
                    f"Rapid Device {device_num} pertence a mais de um binding "
                    f"(índices {previous_device} e {index})"
                )
            device_owners[device_num] = index

        for source_name in ("channels", "orphaned_channels"):
            source = item.get(source_name) or {}
            if not isinstance(source, dict):
                raise BindingStoreError(f"binding[{index}].{source_name} não é um objeto")
            for key, cfg in source.items():
                if not isinstance(cfg, dict):
                    raise BindingStoreError(
                        f"binding[{index}].{source_name}.{key} não é um objeto"
                    )
                cnl = _positive_int(cfg.get("cnl"), f"{source_name}.{key}.cnl", index)
                previous_channel = channel_owners.get(cnl)
                if previous_channel is not None:
                    other_index, other_key = previous_channel
                    raise BindingStoreError(
                        f"CnlNum {cnl} duplicado: binding[{other_index}].{other_key} "
                        f"e binding[{index}].{source_name}.{key}"
                    )
                channel_owners[cnl] = (index, f"{source_name}.{key}")

    return items


def load_runtime_bindings(path: str | Path | None = None) -> list[dict]:
    """Carrega bindings ativos sem converter corrupção em estado vazio.

    Arquivo ausente significa plataforma ainda não provisionada. Arquivo presente
    e inválido é falha de integridade e deve bloquear operações destrutivas.
    """
    target = Path(path) if path is not None else Path(RAPID_BINDINGS_FILE)
    if not target.exists():
        return []
    try:
        value = json.loads(target.read_text(encoding="utf-8"))
    except Exception as exc:
        raise BindingStoreError(f"Bindings Rapid corrompidos: {target}: {exc}") from exc
    if not isinstance(value, list):
        raise BindingStoreError(f"Bindings Rapid inválidos: {target} deve conter uma lista JSON")
    return validate_runtime_bindings(value)
