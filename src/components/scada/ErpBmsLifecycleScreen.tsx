import { type FormEvent, useEffect, useState } from "react";
import { Landmark, Webhook } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type WebhookApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

type IntegrationStatus = {
  erpBms: { configured: boolean; adapter: string; notes: string };
};

async function getStatus(): Promise<IntegrationStatus> {
  const response = await fetch("/api/integrations/status", { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<IntegrationStatus>;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação.";
}

export function ErpBmsLifecycleScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<WebhookApi[]>([]);
  const [status, setStatus] = useState<IntegrationStatus["erpBms"] | null>(null);
  const [editing, setEditing] = useState<WebhookApi | null>(null);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("*");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [integration, hooks] = await Promise.all([getStatus(), rcApi.webhooks.list()]);
      setStatus(integration.erpBms); setRows(hooks); setError("");
    } catch (err) { setError(errorText(err)); }
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setEditing(null); setUrl(""); setEvent("*"); };
  const beginEdit = (row: WebhookApi) => { setEditing(row); setUrl(row.url); setEvent(row.event); setError(""); setMessage(""); };

  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setMessage("");
    try {
      if (editing) {
        await rcApi.webhooks.update(editing.id, { url: url.trim(), event: event.trim() || "*" });
        setMessage("Conector atualizado.");
      } else {
        await rcApi.webhooks.create({ url: url.trim(), event: event.trim() || "*" });
        setMessage("Conector cadastrado.");
      }
      reset(); await load();
    } catch (err) { setError(errorText(err)); }
  };

  const toggle = async (row: WebhookApi) => {
    try {
      await rcApi.webhooks.update(row.id, { status: row.status === "Ativo" ? "Pausado" : "Ativo" });
      setMessage(row.status === "Ativo" ? "Conector pausado." : "Conector ativado."); setError(""); await load();
    } catch (err) { setError(errorText(err)); }
  };

  const remove = async (row: WebhookApi) => {
    if (!window.confirm(`Excluir o conector ${row.url}?`)) return;
    try { await rcApi.webhooks.remove(row.id); if (editing?.id === row.id) reset(); setMessage("Conector excluído."); setError(""); await load(); }
    catch (err) { setError(errorText(err)); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: Landmark, label: "ERP/BMS HTTP", value: status?.configured ? "ATIVO" : "NÃO CONFIGURADO", tone: status?.configured ? "text-online" : undefined },
      { icon: Webhook, label: "Conectores", value: rows.length },
      { icon: Webhook, label: "Ativos", value: rows.filter((r) => r.status === "Ativo").length, tone: "text-online" },
    ]} />
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
      ERP/BMS usa HTTP/webhook exclusivamente para saída de dados e eventos. Para leitura estruturada, use a API com token. Webhook recebido nunca executa START, STOP, MCB, GCB, transferência ou paralelismo.
    </p>
    {status?.adapter && <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Adaptador: <b>{status.adapter}</b>{status.notes ? ` · ${status.notes}` : ""}</p>}
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    {message && <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">{message}</p>}

    {admin && <Panel title={editing ? "Editar conector HTTP" : "Novo conector HTTP"}>
      <form onSubmit={save} className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
        <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.exemplo.com/rc/events" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input required value={event} onChange={(e) => setEvent(e.target.value)} placeholder="* ou evento" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <div className="flex gap-1"><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">{editing ? "Salvar" : "Cadastrar"}</button>{editing && <button type="button" onClick={reset} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar</button>}</div>
      </form>
    </Panel>}

    <Panel title="Conectores persistidos">
      <ScadaTable rows={rows} min="850px" columns={[
        { label: "Evento", render: (r) => <b>{r.event}</b> },
        { label: "Destino", render: (r) => <span className="num break-all text-[11px]">{r.url}</span> },
        { label: "Estado", render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill> },
        { label: "Falhas", render: (r) => <span className="num">{r.failures ?? 0}</span> },
        { label: "Ações", render: (r) => admin ? <span className="flex flex-wrap gap-1"><ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn><ActionBtn onClick={() => void toggle(r)}>{r.status === "Ativo" ? "Pausar" : "Ativar"}</ActionBtn><ActionBtn tone="danger" onClick={() => void remove(r)}>Excluir</ActionBtn></span> : "—" },
      ]} />
    </Panel>
  </ScreenBody>;
}
