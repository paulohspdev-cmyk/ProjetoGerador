import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, History, ShieldAlert, Wrench } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { industrialApi, type EscalationPolicy, type IndustrialAlarm, type MaintenancePlan, type ProcessEvent } from "@/lib/industrial-api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

function severityTone(value: string): "err" | "warn" | "info" | "muted" {
  if (value === "fault") return "err";
  if (value === "alarm" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "muted";
}

export function IndustrialAlarmsScreen() {
  const { generators } = useGenerators();
  const { can } = useAuth();
  const [rows, setRows] = useState<IndustrialAlarm[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try { setRows(await industrialApi.alarms.list(true)); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar alarmes industriais."); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, []);

  const tagById = useMemo(() => new Map(generators.map((g) => [g.id, g.tag])), [generators]);
  const pending = rows.filter((r) => !r.acked_at);

  return <ScreenBody>
    <Stats items={[
      { icon: BellRing, label: "Ativos", value: rows.length, tone: rows.length ? "text-alert" : "text-online" },
      { icon: ShieldAlert, label: "Falhas", value: rows.filter((r) => r.severity === "fault").length, tone: "text-offline" },
      { icon: AlertTriangle, label: "Não reconhecidos", value: pending.length, tone: pending.length ? "text-alert" : "text-online" },
      { icon: CheckCircle2, label: "Reconhecidos", value: rows.filter((r) => !!r.acked_at).length },
    ]} />
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">A fila registra somente condições comprováveis. Perda de comunicação, estado de alerta e alarm_count entram quando realmente observados; causas nativas individuais só aparecem depois que o Controller Pack homologar seus códigos/bitfields.</p>
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    <Panel title="Alarmes industriais ativos">
      <ScadaTable rows={rows.map((r) => ({ ...r, id: r.alarm_key }))} columns={[
        { label: "Gerador / asset", render: (r) => <b>{r.generator_id ? tagById.get(r.generator_id) || r.generator_id : r.asset_id || "Sistema"}</b> },
        { label: "Severidade", render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity.toUpperCase()}</Pill> },
        { label: "Código", render: (r) => <span className="num">{r.code || "—"}</span> },
        { label: "Mensagem", render: (r) => r.message },
        { label: "Fonte", render: (r) => <span className="num text-[10px]">{r.source}</span> },
        { label: "Desde", render: (r) => <span className="num">{dt(r.first_seen)}</span> },
        { label: "ACK", render: (r) => r.acked_at ? <span><Tone tone="ok">Sim</Tone><span className="block text-[10px] text-muted-foreground">{r.acked_by}</span></span> : can("operate") ? <ActionBtn onClick={() => void industrialApi.alarms.ack(r.alarm_key).then(load).catch((err) => setError(err instanceof Error ? err.message : "Falha no ACK"))}>Reconhecer</ActionBtn> : <Tone tone="warn">Pendente</Tone> },
      ]} />
    </Panel>
  </ScreenBody>;
}

export function ProcessHistoryScreen() {
  const { generators } = useGenerators();
  const [rows, setRows] = useState<ProcessEvent[]>([]);
  const [generatorId, setGeneratorId] = useState("");
  const [severity, setSeverity] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try { setRows(await industrialApi.processEvents.list(1000, generatorId, severity)); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar histórico de processo."); }
  };
  useEffect(() => { void load(); }, [generatorId, severity]);
  const tagById = useMemo(() => new Map(generators.map((g) => [g.id, g.tag])), [generators]);

  return <ScreenBody>
    <Stats items={[
      { icon: History, label: "Eventos de processo", value: rows.length },
      { icon: ShieldAlert, label: "Alarmes/falhas", value: rows.filter((r) => r.event_type.startsWith("alarm_")).length },
      { icon: Wrench, label: "Manutenções", value: rows.filter((r) => r.event_type === "maintenance_completed").length },
    ]} />
    <Panel title="Filtros">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-muted-foreground">Gerador<select value={generatorId} onChange={(e) => setGeneratorId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Todos</option>{generators.map((g) => <option key={g.id} value={g.id}>{g.tag}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Severidade<select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Todas</option><option value="fault">Fault</option><option value="alarm">Alarm</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
      </div>
    </Panel>
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Este histórico é de eventos/estados industriais. Tendências analógicas continuam no menu Tendências, lendo o archive do Rapid SCADA. Auditoria de usuários permanece separada em Gestão → Auditoria.</p>
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    <Panel title="Linha do tempo de processo">
      <ScadaTable rows={rows} columns={[
        { label: "Quando", render: (r) => <span className="num">{dt(r.created_at)}</span> },
        { label: "Gerador / asset", render: (r) => <b>{r.generator_id ? tagById.get(r.generator_id) || r.generator_id : r.asset_id || "Sistema"}</b> },
        { label: "Evento", render: (r) => r.event_type },
        { label: "Severidade", render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill> },
        { label: "Código", render: (r) => <span className="num">{r.code || "—"}</span> },
        { label: "Mensagem", render: (r) => r.message },
        { label: "Fonte", render: (r) => <span className="num text-[10px]">{r.source}</span> },
      ]} />
    </Panel>
  </ScreenBody>;
}

export function MaintenanceV3Screen() {
  const { generators } = useGenerators();
  const { workOrders, addWorkOrder } = useScadaOps();
  const { can } = useAuth();
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [generatorId, setGeneratorId] = useState("");
  const [name, setName] = useState("Preventiva");
  const [hours, setHours] = useState("250");
  const [days, setDays] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try { setPlans(await industrialApi.maintenance.list()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar manutenção."); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!generatorId && generators.length) setGeneratorId(generators[0]!.id); }, [generatorId, generators]);

  const byId = useMemo(() => new Map(generators.map((g) => [g.id, g])), [generators]);
  const onCreate = async (e: FormEvent) => {
    e.preventDefault(); setMessage(""); setError("");
    const g = byId.get(generatorId);
    if (!g) return;
    const intervalHours = hours ? Number(hours) : undefined;
    const intervalDays = days ? Number(days) : undefined;
    if (!intervalHours && !intervalDays) { setError("Informe intervalo por horas e/ou dias."); return; }
    const runKnown = (g.availableMetrics ?? []).includes("run_hours");
    try {
      await industrialApi.maintenance.create({ generatorId, name, ...(intervalHours ? { intervalHours } : {}), ...(intervalDays ? { intervalDays } : {}), ...(runKnown ? { lastServiceHours: g.runHours } : {}) });
      setMessage(runKnown ? `Plano iniciado na leitura real de ${g.runHours.toFixed(1)} h.` : "Plano criado; referência por horas ficará N/D até existir run_hours homologado.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar plano."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: Wrench, label: "Planos ativos", value: plans.filter((p) => p.enabled).length },
      { icon: AlertTriangle, label: "Vencidos", value: plans.filter((p) => p.state === "due").length, tone: plans.some((p) => p.state === "due") ? "text-offline" : "text-online" },
      { icon: CalendarClock, label: "Próximos", value: plans.filter((p) => p.state === "warning").length, tone: "text-alert" },
      { icon: Wrench, label: "OS abertas", value: workOrders.filter((w) => w.status !== "Concluída").length },
    ]} />
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    {message && <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">{message}</p>}
    {can("create") && <Panel title="Novo plano preventivo">
      <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-semibold text-muted-foreground">Gerador<select value={generatorId} onChange={(e) => setGeneratorId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{generators.map((g) => <option key={g.id} value={g.id}>{g.tag}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Plano<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" required /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Intervalo horas<input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="250" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Intervalo dias<input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="opcional" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="sm:col-span-4"><button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Criar plano</button></div>
      </form>
    </Panel>}
    <Panel title="Planos de manutenção">
      <ScadaTable rows={plans} columns={[
        { label: "Gerador", render: (r) => <b>{r.generator_tag || r.generator_id || r.asset_id || "—"}</b> },
        { label: "Plano", render: (r) => <span><b>{r.name}</b><span className="block text-[10px] text-muted-foreground">{r.kind}</span></span> },
        { label: "Intervalo", render: (r) => <span className="num">{[r.interval_hours ? `${r.interval_hours} h` : "", r.interval_days ? `${r.interval_days} d` : ""].filter(Boolean).join(" / ")}</span> },
        { label: "Horímetro", render: (r) => r.current_hours == null ? "N/D" : <span className="num">{r.current_hours.toFixed(1)} h</span> },
        { label: "Restante", render: (r) => <span className="num">{[r.hour_remaining != null ? `${r.hour_remaining.toFixed(1)} h` : "", r.day_remaining != null ? `${r.day_remaining.toFixed(1)} d` : ""].filter(Boolean).join(" / ") || "N/D"}</span> },
        { label: "Estado", render: (r) => <Pill tone={r.state === "due" ? "err" : r.state === "warning" ? "warn" : r.state === "ok" ? "ok" : "muted"}>{(r.state || "unknown").toUpperCase()}</Pill> },
        { label: "Último serviço", render: (r) => <span className="num">{dt(r.last_service_at)}</span> },
        { label: "Ações", render: (r) => <span className="flex flex-wrap gap-1">{can("edit") && <ActionBtn tone="ok" onClick={() => void industrialApi.maintenance.complete(r.id, r.current_hours ?? undefined, "Conclusão registrada pelo painel").then(load).catch((err) => setError(err instanceof Error ? err.message : "Falha ao concluir"))}>Concluir</ActionBtn>}{can("create") && (r.state === "due" || r.state === "warning") && <ActionBtn onClick={() => { const g = r.generator_id ? byId.get(r.generator_id) : undefined; if (g) void addWorkOrder({ gen: g.tag, site: g.site, type: `Preventiva — ${r.name}` }); }}>Abrir OS</ActionBtn>}</span> },
      ]} />
    </Panel>
  </ScreenBody>;
}

export function EscalationV3Screen() {
  const { user } = useAuth();
  const admin = user?.role === "administrador";
  const [rows, setRows] = useState<EscalationPolicy[]>([]);
  const [name, setName] = useState("Falha crítica");
  const [severity, setSeverity] = useState("fault");
  const [afterMinutes, setAfterMinutes] = useState("5");
  const [channel, setChannel] = useState("panel");
  const [destination, setDestination] = useState("");
  const [repeatMinutes, setRepeatMinutes] = useState("0");
  const [maxRepeats, setMaxRepeats] = useState("1");
  const [error, setError] = useState("");

  const load = async () => { try { setRows(await industrialApi.escalations.list()); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar escalonamento."); } };
  useEffect(() => { void load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await industrialApi.escalations.create({ name, severity, afterSeconds: Number(afterMinutes || 0) * 60, channel, destination, repeatSeconds: Number(repeatMinutes || 0) * 60, maxRepeats: Number(maxRepeats || 1) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar política."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: ShieldAlert, label: "Políticas", value: rows.length },
      { icon: BellRing, label: "Ativas", value: rows.filter((r) => r.enabled).length, tone: "text-online" },
      { icon: CalendarClock, label: "Com repetição", value: rows.filter((r) => r.repeat_seconds > 0).length },
    ]} />
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Escalonamento atua somente sobre alarmes industriais ativos e não reconhecidos. As ações são notificações; START, STOP, MCB, GCB, modos e paralelismo não fazem parte deste motor.</p>
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    {admin && <Panel title="Nova política de escalonamento">
      <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
        <label className="text-[11px] font-semibold text-muted-foreground xl:col-span-2">Nome<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Severidade<select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="fault">Fault</option><option value="alarm">Alarm</option><option value="warning">Warning</option><option value="any">Qualquer</option></select></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Após (min)<input inputMode="numeric" value={afterMinutes} onChange={(e) => setAfterMinutes(e.target.value.replace(/\D/g, ""))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Canal<select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="panel">Painel</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="webhook">Webhook</option></select></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Repete (min)<input inputMode="numeric" value={repeatMinutes} onChange={(e) => setRepeatMinutes(e.target.value.replace(/\D/g, ""))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Máx. envios<input inputMode="numeric" value={maxRepeats} onChange={(e) => setMaxRepeats(e.target.value.replace(/\D/g, ""))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-3 xl:col-span-6">Destino<input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e-mail / telefone / URL; vazio para painel" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground">Criar</button></div>
      </form>
    </Panel>}
    <Panel title="Políticas">
      <ScadaTable rows={rows} columns={[
        { label: "Nome", render: (r) => <b>{r.name}</b> },
        { label: "Severidade", render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill> },
        { label: "Espera", render: (r) => <span className="num">{duration(r.after_seconds)}</span> },
        { label: "Canal", render: (r) => r.channel },
        { label: "Destino", render: (r) => r.destination || "Painel" },
        { label: "Repetição", render: (r) => r.repeat_seconds ? `${duration(r.repeat_seconds)} · máx ${r.max_repeats}` : "Não" },
        { label: "Estado", render: (r) => <Tone tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativa" : "Pausada"}</Tone> },
        { label: "Ações", render: (r) => admin ? <span className="flex gap-1"><ActionBtn onClick={() => void industrialApi.escalations.update(r.id, { enabled: !r.enabled }).then(load).catch((err) => setError(err instanceof Error ? err.message : "Falha"))}>{r.enabled ? "Pausar" : "Ativar"}</ActionBtn><ActionBtn tone="danger" onClick={() => { if (window.confirm(`Excluir política ${r.name}?`)) void industrialApi.escalations.remove(r.id).then(load).catch((err) => setError(err instanceof Error ? err.message : "Falha")); }}>Excluir</ActionBtn></span> : "—" },
      ]} />
    </Panel>
  </ScreenBody>;
}
