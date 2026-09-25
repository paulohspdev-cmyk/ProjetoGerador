"""Resolução fail-safe da topologia elétrica exibida nos cards de gerador.

A presença instantânea de tensão de rede nunca decide o tipo visual do card.
A resolução usa somente configuração estável: override cadastral, metadados/topologia
de assets, catálogo técnico explicitamente marcado e canais realmente provisionados.
"""

import json

from . import db
from .controller_library import catalog_for_model

POWER_TOPOLOGY_AUTO = "auto"
POWER_TOPOLOGY_MAINS = "mains_genset"
POWER_TOPOLOGY_GENSET_ONLY = "genset_only"
POWER_TOPOLOGY_UNKNOWN = "unknown"

_FIXED_TOPOLOGIES = {POWER_TOPOLOGY_MAINS, POWER_TOPOLOGY_GENSET_ONLY}


def normalize_power_topology(value: object, *, allow_auto: bool = True) -> str:
    text = str(value or "").strip().lower()
    allowed = set(_FIXED_TOPOLOGIES)
    if allow_auto:
        allowed.add(POWER_TOPOLOGY_AUTO)
    if text not in allowed:
        raise ValueError(
            "Topologia elétrica inválida; use auto, mains_genset ou genset_only"
        )
    return text


def topology_from_configured_metrics(
    configured_metrics: list[str] | tuple[str, ...] | set[str] | None,
    binding_present: bool,
) -> tuple[str, str] | None:
    """Infere pela configuração estável do binding, nunca pelo valor instantâneo."""
    if not binding_present:
        return None
    metrics = {str(key).strip() for key in (configured_metrics or []) if str(key).strip()}
    if not metrics:
        return None
    has_mains_channel = any(
        key == "mcb_closed" or key.startswith("mains_")
        for key in metrics
    )
    if has_mains_channel:
        return POWER_TOPOLOGY_MAINS, "binding"
    return POWER_TOPOLOGY_GENSET_ONLY, "binding"


def _catalog_topology(generator: dict) -> tuple[str, str] | None:
    item = catalog_for_model(str(generator.get("controller_model") or ""))
    if not item:
        return None
    raw = item.get("powerTopology", item.get("power_topology"))
    if raw is None:
        return None
    try:
        topology = normalize_power_topology(raw, allow_auto=False)
    except ValueError:
        return None
    return topology, "catalog"


def _asset_graph_topology(generator: dict) -> tuple[str, str] | None:
    generator_id = str(generator.get("id") or "").strip()
    if not generator_id:
        return None

    try:
        with db.connect() as conn:
            tables = {
                str(row[0])
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            if not {"assets", "asset_links"}.issubset(tables):
                return None

            asset = conn.execute(
                "SELECT id, metadata_json FROM assets WHERE legacy_generator_id=?",
                (generator_id,),
            ).fetchone()
            if not asset:
                return None

            try:
                metadata = json.loads(str(asset["metadata_json"] or "{}"))
            except (TypeError, ValueError, json.JSONDecodeError):
                metadata = {}

            explicit = metadata.get("powerTopology", metadata.get("power_topology"))
            if explicit is not None:
                try:
                    return normalize_power_topology(explicit, allow_auto=False), "asset_metadata"
                except ValueError:
                    pass

            if isinstance(metadata.get("hasMainsSource"), bool):
                return (
                    POWER_TOPOLOGY_MAINS
                    if metadata["hasMainsSource"]
                    else POWER_TOPOLOGY_GENSET_ONLY,
                    "asset_metadata",
                )

            rows = conn.execute("SELECT id, kind FROM assets").fetchall()
            kinds = {str(row["id"]): str(row["kind"] or "").strip().lower() for row in rows}
            links = conn.execute(
                "SELECT from_asset_id, to_asset_id FROM asset_links"
            ).fetchall()
    except Exception:
        # A topologia de domínio é uma evidência auxiliar. Falha de leitura não pode
        # derrubar o dashboard nem forçar uma classificação.
        return None

    adjacency: dict[str, set[str]] = {}
    for link in links:
        left = str(link["from_asset_id"])
        right = str(link["to_asset_id"])
        adjacency.setdefault(left, set()).add(right)
        adjacency.setdefault(right, set()).add(left)

    start = str(asset["id"])
    seen = {start}
    frontier = {start}
    # Até quatro saltos cobre GEN -> BUS -> ATS -> REDE sem transformar qualquer
    # asset remoto do site em evidência indevida.
    for _ in range(4):
        next_frontier: set[str] = set()
        for node in frontier:
            for neighbor in adjacency.get(node, set()):
                if neighbor in seen:
                    continue
                seen.add(neighbor)
                if kinds.get(neighbor) in {"mains", "ats"}:
                    return POWER_TOPOLOGY_MAINS, "asset_graph"
                next_frontier.add(neighbor)
        if not next_frontier:
            break
        frontier = next_frontier
    return None


def resolve_power_topology(
    generator: dict,
    configured_metrics: list[str] | tuple[str, ...] | set[str] | None,
    binding_present: bool,
) -> tuple[str, str]:
    """Retorna (topologia_resolvida, origem_da_decisão)."""
    configured = str(generator.get("power_topology") or POWER_TOPOLOGY_AUTO).strip().lower()
    if configured in _FIXED_TOPOLOGIES:
        return configured, "configured"

    graph = _asset_graph_topology(generator)
    if graph:
        return graph

    catalog = _catalog_topology(generator)
    if catalog:
        return catalog

    binding = topology_from_configured_metrics(configured_metrics, binding_present)
    if binding:
        return binding

    return POWER_TOPOLOGY_UNKNOWN, "unknown"
