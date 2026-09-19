"""Fail-closed checks for a production RC Geradores runtime.

This module deliberately validates only settings that can make an unsafe LAB
path reachable from production. Readiness items that require site-specific
values (CIDRs, off-site destination, generator nominal data, etc.) are reported
by diagnostics and do not crash the service.
"""

from __future__ import annotations

import os


def environment() -> str:
    return os.environ.get("RC_ENVIRONMENT", "development").strip().lower() or "development"


def production_mode() -> bool:
    return environment() == "production"


def validate_production_runtime() -> None:
    if not production_mode():
        return

    forbidden = {
        "RC_ENABLE_DSE_LAB_CONTROL": "DSE LAB command path",
        "RC_ENABLE_IG4_LAB_CONTROL": "IG4 LAB command path",
    }
    enabled = [name for name in forbidden if os.environ.get(name, "0").strip() == "1"]
    if enabled:
        details = ", ".join(f"{name}=1 ({forbidden[name]})" for name in enabled)
        raise RuntimeError(
            "Production runtime refused because experimental industrial control is enabled: "
            + details
        )

    if os.environ.get("RC_API_DOCS", "0").strip() == "1":
        raise RuntimeError("Production runtime refused because RC_API_DOCS=1")
