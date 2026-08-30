import { type FormEvent, useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi } from "@/lib/api";
import { Panel, ScreenBody, Stats } from "./kit";

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
