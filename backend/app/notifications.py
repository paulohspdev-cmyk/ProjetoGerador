import ipaddress
import json
import smtplib
import socket
import ssl
import urllib.parse
import urllib.request
from email.message import EmailMessage

from . import ops_store, platform_store
from .config import (
    ALLOW_PRIVATE_WEBHOOKS,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_STARTTLS,
    SMTP_USER,
    WHATSAPP_API_TOKEN,
    WHATSAPP_API_URL,
)


def enqueue_event(event_type: str, subject: str, body: str, payload=None, channels=None):
    channels = channels or ["webhook"]
    ids = []
    for channel in channels:
        ids.append(platform_store.enqueue_notification(event_type, channel, subject=subject, body=body, payload=payload or {}))
    return ids


def _url_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        return False
    if parsed.scheme == "http" and not ALLOW_PRIVATE_WEBHOOKS:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local) and not ALLOW_PRIVATE_WEBHOOKS:
                return False
    except Exception:
        return False
    return True


def _post_json(url: str, payload: dict, headers=None, timeout=8):
    if not _url_allowed(url):
        raise ValueError("Destino HTTP bloqueado pela política de segurança")
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(2048).decode("utf-8", errors="replace")
        if response.status < 200 or response.status >= 300:
            raise ConnectionError(f"HTTP {response.status}: {body}")
        return f"HTTP {response.status} {body[:500]}"


def _deliver_webhooks(item: dict):
    hooks = [h for h in ops_store.list_webhooks() if h.get("status") == "Ativo" and h.get("event") in {item["event_type"], "*"}]
    if item.get("destination"):
        hooks = [{"url": item["destination"], "event": item["event_type"]}]
    if not hooks:
        return True, "Nenhum webhook ativo para este evento"
    errors = []
    for hook in hooks:
        try:
            _post_json(
                hook["url"],
                {
                    "event": item["event_type"],
                    "subject": item.get("subject") or "",
                    "body": item.get("body") or "",
                    "payload": item.get("payload") or {},
                },
            )
        except Exception as exc:
            errors.append(f"{hook['url']}: {exc}")
    return (not errors), "; ".join(errors) if errors else f"{len(hooks)} webhook(s) entregue(s)"


def _deliver_email(item: dict):
    destination = item.get("destination") or ""
    if not SMTP_HOST or not SMTP_FROM or not destination:
        return False, "SMTP ou destinatário não configurado"
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = destination
    msg["Subject"] = item.get("subject") or "RC Geradores"
    msg.set_content(item.get("body") or json.dumps(item.get("payload") or {}, ensure_ascii=False, indent=2))
    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        if SMTP_STARTTLS:
            smtp.starttls(context=context)
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)
    return True, "E-mail enviado"


def _deliver_whatsapp(item: dict):
    destination = item.get("destination") or ""
    if not WHATSAPP_API_URL or not WHATSAPP_API_TOKEN or not destination:
        return False, "Provedor WhatsApp ou destinatário não configurado"
    detail = _post_json(
        WHATSAPP_API_URL,
        {
            "to": destination,
            "text": item.get("body") or item.get("subject") or "RC Geradores",
            "event": item.get("event_type"),
            "payload": item.get("payload") or {},
        },
        headers={"Authorization": f"Bearer {WHATSAPP_API_TOKEN}"},
    )
    return True, detail


def deliver_notification(item: dict):
    channel = str(item.get("channel") or "").lower()
    if channel == "webhook":
        return _deliver_webhooks(item)
    if channel == "email":
        return _deliver_email(item)
    if channel == "whatsapp":
        return _deliver_whatsapp(item)
    if channel == "panel":
        return True, "Notificação registrada para o painel"
    return False, f"Canal não suportado: {channel}"


def process_due_notifications(limit: int = 20):
    processed = 0
    for item in platform_store.claim_due_notifications(limit):
        try:
            ok, detail = deliver_notification(item)
        except Exception as exc:
            ok, detail = False, str(exc)
        platform_store.finish_notification(item["id"], item.get("channel") or "", item.get("destination") or "", ok, detail)
        processed += 1
    return processed
