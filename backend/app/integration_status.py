from __future__ import annotations

from urllib.parse import urlparse

from . import ops_store
from .config import (
    ALLOW_PRIVATE_WEBHOOKS,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_STARTTLS,
    SMTP_USER,
    WHATSAPP_API_TOKEN,
    WHATSAPP_API_URL,
)


def _host(url: str) -> str:
    try:
        return urlparse(url).hostname or ""
    except Exception:
        return ""


def safe_integration_status() -> dict:
    """Retorna somente estado não sensível de integrações.

    Senhas e tokens nunca são devolvidos ao frontend. O objetivo é permitir que
    a UI diferencie configuração real de placeholders sem expor segredo.
    """
    hooks = ops_store.list_webhooks()
    return {
        "email": {
            "configured": bool(SMTP_HOST and SMTP_FROM),
            "host": SMTP_HOST or "",
            "port": int(SMTP_PORT or 0),
            "from": SMTP_FROM or "",
            "authConfigured": bool(SMTP_USER),
            "startTls": bool(SMTP_STARTTLS),
        },
        "whatsapp": {
            "configured": bool(WHATSAPP_API_URL and WHATSAPP_API_TOKEN),
            "host": _host(WHATSAPP_API_URL or ""),
            "tokenConfigured": bool(WHATSAPP_API_TOKEN),
        },
        "webhook": {
            "configured": any(h.get("status") == "Ativo" for h in hooks),
            "total": len(hooks),
            "active": sum(h.get("status") == "Ativo" for h in hooks),
            "privateTargetsAllowed": bool(ALLOW_PRIVATE_WEBHOOKS),
        },
        "erpBms": {
            "configured": any(h.get("status") == "Ativo" and h.get("event") == "*" for h in hooks),
            "adapter": "webhook-http",
            "notes": "ERP/BMS HTTP usa webhooks autenticados pela infraestrutura de destino; comandos industriais de entrada não são aceitos por este adaptador.",
        },
    }
