import { Webhook } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type WebhookApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
      {message}
    </p>
  );
}

function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <ActionBtn tone="danger" onClick={onConfirm}>
      {label}
    </ActionBtn>
  );
}

export function WebhooksScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<WebhookApi[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("alarme.criado");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRows(await rcApi.webhooks.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar webhooks.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const reset = () => {
    setEditing(null);
    setUrl("");
    setEvent("alarme.criado");
  };
  const beginEdit = (row: WebhookApi) => {
    setEditing(row.id);
    setUrl(row.url);
    setEvent(row.event);
    setError("");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) await rcApi.webhooks.update(editing, { url: url.trim(), event: event.trim() });
      else await rcApi.webhooks.create({ url: url.trim(), event: event.trim() });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar webhook.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (row: WebhookApi) => {
    try {
      await rcApi.webhooks.update(row.id, { status: row.status === "Ativo" ? "Pausado" : "Ativo" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar webhook.");
    }
  };
  const remove = async (row: WebhookApi) => {
    if (!window.confirm(`Excluir o webhook ${row.event} → ${row.url}?`)) return;
    try {
      await rcApi.webhooks.remove(row.id);
      if (editing === row.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir webhook.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Webhook, label: "Webhooks", value: rows.length },
          {
            icon: Webhook,
            label: "Ativos",
            value: rows.filter((row) => row.status === "Ativo").length,
            tone: "text-online",
          },
        ]}
      />
      <ErrorBox message={error} />
      {admin && (
        <Panel title={editing ? "Editar webhook" : "Cadastrar webhook"}>
          <form onSubmit={submit} className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              required
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="evento"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <div className="flex gap-1">
              <button
                disabled={busy}
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : editing ? "Salvar" : "Cadastrar"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={reset}
                  className="h-9 rounded-md border border-border px-3 text-xs"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Webhooks persistidos">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Evento", render: (r) => <b>{r.event}</b> },
            { label: "URL", render: (r) => <span className="num text-[11px]">{r.url}</span> },
            {
              label: "Status",
              render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill>,
            },
            { label: "Falhas", render: (r) => r.failures ?? 0 },
            {
              label: "Ações",
              render: (r) =>
                admin ? (
                  <span className="flex flex-wrap gap-1">
                    <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>
                    <ActionBtn onClick={() => void toggle(r)}>
                      {r.status === "Ativo" ? "Pausar" : "Ativar"}
                    </ActionBtn>
                    <ConfirmButton label="Excluir" onConfirm={() => void remove(r)} />
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
