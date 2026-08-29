import { type FormEvent, useEffect, useState } from "react";
import { Landmark, Mail, MessageCircle, Webhook } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type WebhookApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

type IntegrationStatus = {
  email: { configured: boolean; host: string; port: number; from: string; authConfigured: boolean; startTls: boolean };
  whatsapp: { configured: boolean; host: string; tokenConfigured: boolean };
  webhook: { configured: boolean; total: number; active: number; privateTargetsAllowed: boolean };
  erpBms: { configured: boolean; adapter: string; notes: string };
};

async function getStatus(): Promise<IntegrationStatus> {
  const response = await fetch("/api/integrations/status", { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<IntegrationStatus>;
}

function ErrorBox({ error }: { error: string }) {
  return error ? <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p> : null;
}

export function EmailV3Screen() {
  const { can } = useAuth();
  const [status, setStatus] = useState<IntegrationStatus["email"] | null>(null);
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void getStatus().then((s) => setStatus(s.email)).catch((e) => setError(e instanceof Error ? e.message : "Falha ao consultar integração.")); }, []);
  const test = async (e: FormEvent) => {
    e.preventDefault(); setMessage("");
    try { const result = await rcApi.notifications.test("email", destination.trim()); setMessage(`Teste enfileirado #${result.id}. A fila de Notificações registra a entrega/tentativas.`); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao testar e-mail."); }
  };
  return <ScreenBody>
    <Stats items={[{ icon: Mail, label: "SMTP", value: status?.configured ? "CONFIGURADO" : "NÃO CONFIGURADO", tone: status?.configured ? "text-online" : undefined }]} />
    <ErrorBox error={error} />
    <Panel title="E-mail / SMTP"><div className="grid gap-2 text-[12px] md:grid-cols-3"><div className="rounded-md border border-border p-3">Host<br/><b>{status?.host || "N/D"}</b></div><div className="rounded-md border border-border p-3">Porta / TLS<br/><b>{status?.port || "N/D"} · {status?.startTls ? "STARTTLS" : "sem STARTTLS"}</b></div><div className="rounded-md border border-border p-3">Remetente<br/><b>{status?.from || "N/D"}</b></div></div><p className="mt-2 text-[11px] text-muted-foreground">Credenciais permanecem no ambiente seguro do backend e nunca são devolvidas ao navegador.</p></Panel>
    {can("manageUsers") && <Panel title="Teste real de entrega"><form onSubmit={test} className="flex gap-2"><input required type="email" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="destino@empresa.com" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" /><button disabled={!status?.configured} className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Enfileirar teste</button></form>{message && <p className="mt-2 text-[11px] text-online">{message}</p>}</Panel>}
  </ScreenBody>;
}

export function WhatsAppV3Screen() {
  const { can } = useAuth();
  const [status, setStatus] = useState<IntegrationStatus["whatsapp"] | null>(null);
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void getStatus().then((s) => setStatus(s.whatsapp)).catch((e) => setError(e instanceof Error ? e.message : "Falha ao consultar integração.")); }, []);
  const test = async (e: FormEvent) => {
    e.preventDefault(); setMessage("");
    try { const result = await rcApi.notifications.test("whatsapp", destination.trim()); setMessage(`Teste enfileirado #${result.id}.`); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao testar WhatsApp."); }
  };
  return <ScreenBody>
    <Stats items={[{ icon: MessageCircle, label: "WhatsApp", value: status?.configured ? "CONFIGURADO" : "NÃO CONFIGURADO", tone: status?.configured ? "text-online" : undefined }]} />
    <ErrorBox error={error} />
    <Panel title="Provedor WhatsApp"><div className="rounded-md border border-border p-3 text-[12px]">Endpoint: <b>{status?.host || "N/D"}</b> · credencial: <b>{status?.tokenConfigured ? "configurada" : "ausente"}</b></div><p className="mt-2 text-[11px] text-muted-foreground">O canal é exclusivamente de notificação. Mensagens recebidas não executam START/STOP, disjuntores ou paralelismo.</p></Panel>
    {can("manageUsers") && <Panel title="Teste real de entrega"><form onSubmit={test} className="flex gap-2"><input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="telefone/destino conforme provedor" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" /><button disabled={!status?.configured} className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Enfileirar teste</button></form>{message && <p className="mt-2 text-[11px] text-online">{message}</p>}</Panel>}
  </ScreenBody>;
}

export function ErpBmsV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<WebhookApi[]>([]);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("*");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const load = async () => {
    try { const [s, hooks] = await Promise.all([getStatus(), rcApi.webhooks.list()]); setStatus(s); setRows(hooks); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar integrações."); }
  };
  useEffect(() => { void load(); }, []);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try { await rcApi.webhooks.create({ url: url.trim(), event: event.trim() || "*" }); setUrl(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao cadastrar conector."); }
  };
  return <ScreenBody>
    <Stats items={[
      { icon: Landmark, label: "ERP/BMS HTTP", value: status?.erpBms.configured ? "ATIVO" : "NÃO CONFIGURADO", tone: status?.erpBms.configured ? "text-online" : undefined },
      { icon: Webhook, label: "Webhooks", value: rows.length },
      { icon: Webhook, label: "Ativos", value: rows.filter((r) => r.status === "Ativo").length },
    ]} />
    <ErrorBox error={error} />
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">ERP/BMS usa adaptador HTTP/webhook para dados e eventos de saída. Para leitura estruturada, use API tokens em Integrações → API. Comandos industriais de entrada não são aceitos por webhook.</p>
    {admin && <Panel title="Novo conector HTTP"><form onSubmit={create} className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.exemplo.com/rc/events" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input required value={event} onChange={(e) => setEvent(e.target.value)} placeholder="* ou evento" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Cadastrar</button></form></Panel>}
    <Panel title="Conectores persistidos"><ScadaTable rows={rows} columns={[
      { label: "Evento", render: (r) => <b>{r.event}</b> },
      { label: "Destino", render: (r) => <span className="num text-[11px]">{r.url}</span> },
      { label: "Estado", render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill> },
      { label: "Falhas", render: (r) => r.failures ?? 0 },
      { label: "Entrega", render: (r) => <Tone tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status === "Ativo" ? "habilitada" : "pausada"}</Tone> },
      { label: "Controle", render: (r) => admin ? <ActionBtn onClick={() => void rcApi.webhooks.update(r.id, { status: r.status === "Ativo" ? "Pausado" : "Ativo" }).then(load).catch((err) => setError(err instanceof Error ? err.message : "Falha ao alterar conector."))}>{r.status === "Ativo" ? "Pausar" : "Ativar"}</ActionBtn> : "—" },
    ]} /></Panel>
  </ScreenBody>;
}
