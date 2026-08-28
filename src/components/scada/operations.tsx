import { type FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, Gauge, MapPin, Radio, Server } from "lucide-react";

import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import type { Generator } from "@/data/generators";
import { rcApi, type AuditItem, type EventItemApi, type OpsSite, type RapidMetric, type RapidTrend } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone, Trend } from "./kit";

function fmt(n: number, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d).replace(".", ",") : "N/D";
}

function hasMetric(g: Generator, key: string) {
  return (g.availableMetrics ?? []).includes(key);
}

function dateTime(epoch: number) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("pt-BR");
}

function shortTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type LiveAlarm = {
  id: string;
  gen: string;
  site: string;
  severity: "falha" | "alarme" | "aviso";
  message: string;
  since: string;
  ack: boolean;
};

function realAlarms(generators: Generator[], isAcked: (id: string, seed: boolean) => boolean): LiveAlarm[] {
  return generators.flatMap((g) => {
    const rows: Omit<LiveAlarm, "ack">[] = [];
    if (g.status === "offline") {
      rows.push({
        id: `COMM-${g.id}`,
        gen: g.tag,
        site: g.site,
        severity: "falha",
        message: g.lastError?.trim() || "Comunicação/telemetria indisponível",
        since: "estado atual",
      });
    } else if (g.status === "alerta") {
      rows.push({
        id: `SCADA-${g.id}`,
        gen: g.tag,
        site: g.site,
        severity: "alarme",
        message: g.lastError?.trim() || "Controlador reporta estado de alerta; causa específica N/D",
        since: "estado atual",
      });
    }
    return rows.map((row) => ({ ...row, ack: isAcked(row.id, false) }));
  });
}

export function OperationCenter() {
  const { generators } = useGenerators();
  const { isAcked } = useScadaOps();
  const loadRows = generators.filter((g) => hasMetric(g, "power_kw"));
  const measuredLoad = loadRows.length ? loadRows.reduce((sum, g) => sum + Number(g.load), 0) : null;
  const alarmRows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const configured = generators.filter((g) => g.status !== "nao_configurado");
  const rapidOk = configured.filter((g) => g.telemetrySource === "rapid_scada" && g.status !== "offline").length;

  return (
    <ScreenBody>
      <Stats items={[
        { icon: Server, label: "Parque", value: generators.length, sub: "geradores", tone: "text-foreground" },
        { icon: Gauge, label: "Carga medida", value: measuredLoad == null ? "N/D" : `${fmt(measuredLoad, 1)} kW`, sub: measuredLoad == null ? "sem canal power_kw" : `${loadRows.length} gerador(es)` },
        { icon: BellRing, label: "Condições ativas", value: alarmRows.filter((a) => !a.ack).length, tone: alarmRows.length ? "text-alert" : "text-online" },
        { icon: Radio, label: "Telemetria Rapid", value: configured.length ? `${rapidOk}/${configured.length}` : "0/0" },
      ]} />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Estado do parque" className="lg:col-span-2">
          {!generators.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum gerador cadastrado.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {generators.map((g) => {
                const rpm = hasMetric(g, "rpm") ? `${fmt(g.rpm, 0)} rpm` : "RPM N/D";
                const hz = hasMetric(g, "frequency") && g.frequency != null ? `${fmt(g.frequency, 2)} Hz` : "Hz N/D";
                return (
                  <div key={g.id} className="rounded-md border border-border bg-background/40 p-2">
                    <div className="flex items-center justify-between gap-1"><p className="text-[12px] font-bold">{g.tag}</p><StatusPill status={g.status} /></div>
                    <p className="truncate text-[10px] text-muted-foreground">{g.site || "Sem site"}</p>
                    <p className="num mt-1 text-[11px]">{g.telemetrySource === "rapid_scada" ? `${rpm} · ${hz}` : "sem telemetria Rapid"}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Condições ativas">
          {!alarmRows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma condição real ativa.</p>
          ) : (
            <ul className="space-y-2">
              {alarmRows.slice(0, 8).map((a) => (
                <li key={a.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-bold">{a.gen}</span><Pill tone={a.severity === "falha" ? "err" : "warn"}>{a.severity}</Pill></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </ScreenBody>
  );
}

export function SitesScreen() {
  const { generators } = useGenerators();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.sites.list().then((rows) => { if (active) { setSites(rows); setError(null); } }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Falha ao consultar sites."); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => sites.map((site) => {
    const gens = generators.filter((g) => g.site.trim().toLowerCase() === site.name.trim().toLowerCase());
    const loadRows = gens.filter((g) => hasMetric(g, "power_kw"));
    const measuredLoad = loadRows.length ? loadRows.reduce((sum, g) => sum + Number(g.load), 0) : null;
    return {
      ...site,
      online: gens.filter((g) => g.status === "online").length,
      alerta: gens.filter((g) => g.status === "alerta").length,
      offline: gens.filter((g) => g.status === "offline").length,
      total: gens.length,
      measuredLoad,
      loadSources: loadRows.length,
    };
  }), [generators, sites]);
  const allMeasured = rows.flatMap((site) => site.measuredLoad == null ? [] : [site.measuredLoad]);
  const parkLoad = allMeasured.length ? allMeasured.reduce((sum, value) => sum + value, 0) : null;

  return (
    <ScreenBody>
      <Stats items={[
        { icon: MapPin, label: "Sites cadastrados", value: sites.length },
        { icon: Server, label: "Geradores", value: generators.length },
        { icon: Gauge, label: "Carga medida", value: parkLoad == null ? "N/D" : `${fmt(parkLoad, 1)} kW` },
      ]} />
      {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
      {!rows.length ? (
        <Panel title="Sites"><p className="py-8 text-center text-sm text-muted-foreground">Nenhum site cadastrado. Cadastre em Gestão → Unidades.</p></Panel>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((s) => (
            <article key={s.id} className="rounded-lg border border-border bg-card p-3">
              <h3 className="font-bold">{s.name}</h3>
              <p className="text-[11px] text-muted-foreground">{[s.city, s.state].filter(Boolean).join(" / ") || "Localização não informada"}</p>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                <div><p className="num text-lg font-bold text-online">{s.online}</p><p className="text-muted-foreground">Online</p></div>
                <div><p className="num text-lg font-bold text-alert">{s.alerta}</p><p className="text-muted-foreground">Alerta</p></div>
                <div><p className="num text-lg font-bold text-offline">{s.offline}</p><p className="text-muted-foreground">Off</p></div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{s.total} geradores · {s.measuredLoad == null ? "carga N/D" : `${fmt(s.measuredLoad, 1)} kW em ${s.loadSources} fonte(s)`}</p>
              {s.lat != null && s.lng != null && <p className="num mt-1 text-[10px] text-muted-foreground">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</p>}
            </article>
          ))}
        </div>
      )}
    </ScreenBody>
  );
}

export function AlarmsScreen() {
  const { generators } = useGenerators();
  const { isAcked, ackAlarm, ackAll } = useScadaOps();
  const rows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const pending = rows.filter((a) => !a.ack);

  return (
    <ScreenBody>
      <Stats items={[
        { icon: BellRing, label: "Ativos", value: pending.length, tone: pending.length ? "text-alert" : "text-online" },
        { icon: BellRing, label: "Falhas", value: rows.filter((a) => a.severity === "falha" && !a.ack).length, tone: "text-offline" },
        { icon: BellRing, label: "Reconhecidos", value: rows.filter((a) => a.ack).length },
      ]} />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Esta fila contém somente estados comprovados pela API. Alarmes nativos adicionais aparecem quando o Controller Pack fornecer canais/eventos próprios.</p>
      <Panel title="Fila de alarmes" actions={pending.length ? <ActionBtn onClick={() => ackAll(pending.map((a) => a.id))}>Reconhecer todos</ActionBtn> : undefined}>
        {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma condição ativa.</p> : <ScadaTable rows={rows} columns={[
          { label: "ID", render: (r) => <span className="num">{r.id}</span> },
          { label: "Gerador", render: (r) => <b>{r.gen}</b> },
          { label: "Site", render: (r) => r.site || "—", hide: "hidden md:table-cell" },
          { label: "Severidade", render: (r) => <Pill tone={r.severity === "falha" ? "err" : "warn"}>{r.severity}</Pill> },
          { label: "Mensagem", render: (r) => r.message },
          { label: "Desde", render: (r) => <span className="num">{r.since}</span> },
          { label: "ACK", render: (r) => r.ack ? <Tone tone="ok">Sim</Tone> : <ActionBtn onClick={() => ackAlarm(r.id)}>Reconhecer</ActionBtn> },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function EventsScreen() {
  const [rows, setRows] = useState<EventItemApi[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await rcApi.events.list(500);
        if (active) { setRows(data); setError(null); }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Falha ao consultar eventos.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const tableRows = rows.map((r) => ({ ...r, id: String(r.id) }));
  return (
    <ScreenBody>
      {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
      <Panel title="Eventos reais da aplicação / operação">
        {!tableRows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento registrado.</p> : <ScadaTable rows={tableRows} columns={[
          { label: "Quando", render: (r) => <span className="num">{dateTime(r.created_at)}</span> },
          { label: "Gerador", render: (r) => <b>{r.tag || "Sistema"}</b> },
          { label: "Site", render: (r) => r.site || "—", hide: "hidden md:table-cell" },
          { label: "Evento", render: (r) => r.message },
          { label: "Nível", render: (r) => <Pill tone={r.level === "ERROR" || r.level === "FAULT" ? "err" : r.level === "WARN" ? "warn" : "info"}>{r.level}</Pill> },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function TrendsScreen() {
  const { generators } = useGenerators();
  const [generatorId, setGeneratorId] = useState("");
  const [metrics, setMetrics] = useState<RapidMetric[]>([]);
  const [metric, setMetric] = useState("");
  const [hours, setHours] = useState(24);
  const [trend, setTrend] = useState<RapidTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!generatorId && generators.length) setGeneratorId(generators[0]!.id);
  }, [generatorId, generators]);

  useEffect(() => {
    let active = true;
    if (!generatorId) { setMetrics([]); setMetric(""); setTrend(null); return; }
    void rcApi.generators.metrics(generatorId).then((rows) => {
      if (!active) return;
      setMetrics(rows);
      setMetric((prev) => rows.some((x) => x.key === prev) ? prev : rows[0]?.key || "");
      setError(null);
    }).catch((err) => {
      if (active) { setMetrics([]); setMetric(""); setTrend(null); setError(err instanceof Error ? err.message : "Falha ao consultar métricas Rapid."); }
    });
    return () => { active = false; };
  }, [generatorId]);

  useEffect(() => {
    let active = true;
    if (!generatorId || !metric) { setTrend(null); return; }
    setLoading(true);
    void rcApi.generators.trend(generatorId, metric, hours, hours <= 48 ? 1 : hours <= 24 * 14 ? 2 : 3).then((data) => {
      if (active) { setTrend(data); setError(null); }
    }).catch((err) => {
      if (active) { setTrend(null); setError(err instanceof Error ? err.message : "Histórico ainda indisponível no Rapid SCADA."); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [generatorId, metric, hours]);

  const chart = (trend?.points ?? []).map((p) => ({ t: shortTime(p.timestamp), v: p.value }));
  const selected = generators.find((g) => g.id === generatorId);

  return (
    <ScreenBody>
      <Panel title="Tendência Rapid SCADA">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted-foreground">Gerador<select value={generatorId} onChange={(e) => setGeneratorId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione</option>{generators.map((g) => <option key={g.id} value={g.id}>{g.tag} — {g.controller}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Métrica disponível no Controller Pack<select value={metric} onChange={(e) => setMetric(e.target.value)} disabled={!metrics.length} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Sem métrica</option>{metrics.map((m) => <option key={m.key} value={m.key}>{m.key} · canal {m.cnl}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Período<select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value={6}>6 horas</option><option value={24}>24 horas</option><option value={168}>7 dias</option><option value={720}>30 dias</option></select></label>
        </div>
      </Panel>
      {error && <p className="rounded-md border border-alert/40 bg-alert/10 p-3 text-sm text-alert">{error}</p>}
      <Panel title={selected && metric ? `${selected.tag} · ${metric}` : "Histórico"}>
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">Consultando arquivo do Rapid SCADA…</p> : chart.length ? <Trend data={chart} /> : <p className="py-16 text-center text-sm text-muted-foreground">Sem pontos históricos definidos para a seleção.</p>}
      </Panel>
    </ScreenBody>
  );
}

export function HistoryScreen() {
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.audit.list(1000).then((data) => { if (active) { setRows(data); setError(null); } }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Falha ao consultar histórico operacional."); });
    return () => { active = false; };
  }, []);

  const tableRows = rows.map((r) => ({ ...r, id: String(r.id) }));
  return (
    <ScreenBody>
      {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
      <Panel title="Histórico operacional auditável">
        {!tableRows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento auditável disponível.</p> : <ScadaTable rows={tableRows} columns={[
          { label: "Quando", render: (r) => <span className="num">{dateTime(r.created_at)}</span> },
          { label: "Origem", render: (r) => <b>{r.actor}</b> },
          { label: "Ação", render: (r) => r.action },
          { label: "Entidade", render: (r) => `${r.entity_type} / ${r.entity_id}` },
          { label: "Detalhe", render: (r) => r.detail || "—" },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

export function ReportsScreen() {
  const { generators } = useGenerators();
  const { reports, generateReport, downloadReport } = useScadaOps();
  const [name, setName] = useState("Parque — geradores");
  const [period, setPeriod] = useState("Hoje");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    generateReport({ name, period, format: "CSV" }, generators);
  };

  return (
    <ScreenBody>
      <Panel title="Gerar relatório">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted-foreground">Nome<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" required /></label>
          <label className="text-[11px] font-semibold text-muted-foreground">Período / referência<input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" required /></label>
          <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90">Gerar CSV real</button></div>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">O relatório exporta somente dados disponíveis na API/Rapid SCADA; ausência permanece N/D.</p>
      </Panel>
      <Panel title="Relatórios">
        {!reports.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum relatório gerado.</p> : <ScadaTable rows={reports} columns={[
          { label: "ID", render: (r) => <span className="num">{r.id}</span> },
          { label: "Relatório", render: (r) => <b>{r.name}</b> },
          { label: "Período", render: (r) => r.period },
          { label: "Formato", render: (r) => r.format },
          { label: "Status", render: (r) => <Pill tone={r.status === "Pronto" ? "ok" : "warn"}>{r.status}</Pill> },
          { label: "Download", render: (r) => <ActionBtn onClick={() => downloadReport(r.id, generators)}>Baixar</ActionBtn> },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}
