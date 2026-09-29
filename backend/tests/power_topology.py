from app.power_topology import (
    POWER_TOPOLOGY_GENSET_ONLY,
    POWER_TOPOLOGY_MAINS,
    topology_from_configured_metrics,
    topology_from_defined_metrics,
)

assert topology_from_configured_metrics([], False) is None
assert topology_from_configured_metrics([], True) is None
assert topology_from_configured_metrics(["rpm", "frequency", "gcb_closed"], True) == (
    POWER_TOPOLOGY_GENSET_ONLY,
    "binding",
)
assert topology_from_configured_metrics(["rpm", "mains_frequency"], True) == (
    POWER_TOPOLOGY_MAINS,
    "binding",
)
assert topology_from_configured_metrics(["mcb_closed", "gcb_closed"], True) == (
    POWER_TOPOLOGY_MAINS,
    "binding",
)
assert topology_from_defined_metrics(["rpm", "bus_frequency", "bus_voltage_l1"], True) == (
    POWER_TOPOLOGY_GENSET_ONLY,
    "telemetry_capability",
)
assert topology_from_defined_metrics(["rpm", "mains_frequency", "bus_frequency"], True) == (
    POWER_TOPOLOGY_MAINS,
    "telemetry_capability",
)
assert topology_from_defined_metrics(["rpm"], True) is None

print("power topology: ok")
