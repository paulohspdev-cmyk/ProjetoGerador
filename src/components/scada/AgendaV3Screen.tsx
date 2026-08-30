import { CalendarDays } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type AgendaItemApi, type OpsSite } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

export function AgendaV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<AgendaItemApi[]>([]);
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [agenda, siteRows] = await Promise.all([rcApi.agenda.list(), rcApi.sites.list()]);
      setRows(agenda); setSites(siteRows); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar agenda."); }
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setEditing(null); setTitle(""); setWhen(""); setSite(""); };
  const beginEdit = (row: AgendaItemApi) => { setEditing(row.id); setTitle(row.title); setWhen(row.when); setSite(row.site || ""); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (editing) await rcApi.agenda.update(editing, { title: title.trim(), when: when.trim(), site: site.trim() });
      else await rcApi.agenda.create({ title: title.trim(), when: when.trim(), site: site.trim() });
      reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar compromisso."); }
    finally { setBusy(false); }
  };
  const toggle = async (row: AgendaItemApi) => {
    try { await rcApi.agenda.update(row.id, { enabled: row.enabled === false }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao alterar compromisso."); }
  };
  const remove = async (row: AgendaItemApi) => {
    if (!window.confirm(`Excluir o compromisso “${row.title}”?`)) return;
    try { await rcApi.agenda.remove(row.id); if (editing === row.id) reset(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir compromisso."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: CalendarDays, label: "Compromissos", value: rows.length },
      { icon: CalendarDays, label: "Ativos", value: rows.filter((row) => row.enabled !== false).length, tone: "text-online" },
      { icon: CalendarDays, label: "Cancelados", value: rows.filter((row) => row.enabled === false).length },
    ]} />
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    {(can("create") || (editing && can("edit"))) && <Panel title={editing ? "Editar compromisso" : "Novo compromisso"}>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-2">Atividade<input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Quando<input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="28/08 09:00" required className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Local<input list="agenda-v3-sites" value={site} onChange={(e) => setSite(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /><datalist id="agenda-v3-sites">{sites.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
        <div className="sm:col-span-4 flex gap-1"><button disabled={busy} type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : editing ? "Salvar alterações" : "Agendar"}</button>{editing && <button type="button" onClick={reset} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar edição</button>}</div>
      </form>
    </Panel>}
    <Panel title="Agenda operacional"><ScadaTable rows={rows} columns={[
      { label: "Quando", render: (r) => <span className="num">{r.when}</span> },
      { label: "Atividade", render: (r) => <b>{r.title}</b> },
      { label: "Local", render: (r) => r.site || "—" },
      { label: "Tipo", render: (r) => r.kind || "manual" },
      { label: "Estado", render: (r) => <Pill tone={r.enabled === false ? "muted" : "ok"}>{r.enabled === false ? "Cancelado" : "Ativo"}</Pill> },
      { label: "Ações", render: (r) => can("edit") ? <span className="flex flex-wrap gap-1"><ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn><ActionBtn onClick={() => void toggle(r)}>{r.enabled === false ? "Reativar" : "Cancelar"}</ActionBtn>{admin && <ActionBtn tone="danger" onClick={() => void remove(r)}>Excluir</ActionBtn>}</span> : "—" },
    ]} /></Panel>
  </ScreenBody>;
}
