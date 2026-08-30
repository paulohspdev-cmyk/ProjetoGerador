import http.client
import ipaddress
import json
import smtplib
import socket
import ssl
import urllib.parse
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


def _resolve_http_target(url: str) -> tuple[urllib.parse.ParseResult, int, str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise ValueError("Destino HTTP inválido")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("Destino HTTP com credenciais/fragmento não é permitido")
    if parsed.scheme == "http" and not ALLOW_PRIVATE_WEBHOOKS:
        raise ValueError("Webhook HTTP sem TLS bloqueado pela política de segurança")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("Não foi possível resolver o destino HTTP") from exc

    approved: list[str] = []
    for info in infos:
        text = str(info[4][0])
        try:
            ip = ipaddress.ip_address(text)
        except ValueError:
            continue
        if not ALLOW_PRIVATE_WEBHOOKS and not ip.is_global:
            raise ValueError("Destino HTTP aponta para endereço não público")
        canonical = str(ip)
        if canonical not in approved:
            approved.append(canonical)
    if not approved:
        raise ValueError("Destino HTTP não possui endereço permitido")

    # O IP é escolhido uma vez e usado diretamente na conexão TCP. Assim uma
    # segunda resolução DNS não consegue trocar o destino entre validação e POST.
    return parsed, port, approved[0]


def _url_allowed(url: str) -> bool:
    try:
        _resolve_http_target(url)
        return True
    except ValueError:
        return False


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, hostname: str, connect_ip: str, port: int, timeout: float):
        super().__init__(hostname, port=port, timeout=timeout, context=ssl.create_default_context())
        self._connect_ip = connect_ip

    def connect(self):
        self.sock = socket.create_connection(
            (self._connect_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


def _post_json(url: str, payload: dict, headers=None, timeout=8):
    parsed, port, connect_ip = _resolve_http_target(url)
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    default_port = 443 if parsed.scheme == "https" else 80
    host_header = parsed.hostname or ""
    if port != default_port:
        host_header = f"{host_header}:{port}"
    request_headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(data)),
        "Host": host_header,
        "User-Agent": "RC-Geradores/3 webhook",
        **(headers or {}),
    }

    if parsed.scheme == "https":
        conn: http.client.HTTPConnection = _PinnedHTTPSConnection(
            parsed.hostname or "", connect_ip, port, timeout
        )
    else:
        conn = http.client.HTTPConnection(connect_ip, port=port, timeout=timeout)

    try:
        conn.request("POST", path, body=data, headers=request_headers)
        response = conn.getresponse()
        body = response.read(2048).decode("utf-8", errors="replace")
        # http.client não segue redirect. Qualquer 3xx é recusado para impedir
        # que um destino público redirecione a requisição para rede privada.
        if response.status < 200 or response.status >= 300:
            raise ConnectionError(f"HTTP {response.status}: {body}")
        return f"HTTP {response.status} {body[:500]}"
    finally:
        conn.close()


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
