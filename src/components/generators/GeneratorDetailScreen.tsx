import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Gauge, History, Radio, ShieldCheck, Zap } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/data/controller-images";
import { displayGenName, type Generator } from "@/data/generators";
import { rcApi, type EventItemApi, type RapidTrend } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import "./generator-detail.css";

const METRIC_LABELS: Record<string, string> = {
  rpm: "RPM",
  frequency: "Frequência",
  voltage_l1: "Tensão GEN L1-N",
  voltage_l2: "Tensão GEN L2-N",
  voltage_l3: "Tensão GEN L3-N",
  voltage_l1_l2: "Tensão GEN L1-L2",
  voltage_l2_l3: "Tensão GEN L2-L3",
  voltage_l3_l1: "Tensão GEN L3-L1",
  mains_voltage_l1: "Rede L1-N",
  mains_voltage_l2: "Rede L2-N",
  mains_voltage_l3: "Rede L3-N",
  mains_voltage_l1_l2: "Rede L1-L2",
  battery_voltage: "Bateria",
  power_kw: "Potência ativa",
  oil_pressure: "Pressão do óleo",
  coolant_temperature: "Temperatura do líquido",
  fuel_level: "Combustível",
  alternator_voltage: "Tensão alternador",
  maintenance_hours: "Horas para manutenção",
  run_hours: "Horímetro",
  alarm_count: "Alarmes",
  mcb_closed: "MCB fechado",
  gcb_closed: "GCB fechado",
  controller_mode_raw: "Modo da controladora",
};

const METRIC_UNITS: Record<string, string> = {
  rpm: "rpm",
  frequency: "Hz",
  voltage_l1: "V",
  voltage_l2: "V",
  voltage_l3: "V",
  voltage_l1_l2: "V",
  voltage_l2_l3: "V",
  voltage_l3_l1: "V",
  mains_voltage_l1: "V",
  mains_voltage_l2: "V",
  mains_voltage_l3: "V",
  mains_voltage_l1_l2: "V",
  battery_voltage: "V",
  power_kw: "kW",
  oil_pressure: "bar",
  coolant_temperature: "°C",
  fuel_level: "%",
  alternator_voltage: "V",
  maintenance_hours: "h",
  run_hours: "h",
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "N/D";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function valueFor(gen: Generator, metric: string): number | boolean | string | null {
  switch (metric) {
    case "rpm": return gen.rpm;
    case "frequency": return gen.frequency;
    case "voltage_l1": return gen.gen.l1;
    case "voltage_l2": return gen.gen.l2;
    case "voltage_l3": return gen.gen.l3;
    case "voltage_l1_l2": return gen.gen.l12;
    case "mains_voltage_l1": return gen.mains.l1;
    case "mains_voltage_l2": return gen.mains.l2;
    case "mains_voltage_l3": return gen.mains.l3;
    case "mains_voltage_l1_l2": return gen.mains.l12;
    case "battery_voltage": return gen.battery;
    case "power_kw": return gen.load;
    case "oil_pressure": return gen.oilPressure;
    case "coolant_temperature": return gen.coolantTemp;
    case "fuel_level": return gen.fuelLevel;
    case "alternator_voltage": return gen.alternatorVoltage;
    case "maintenance_hours": return gen.maintenance;
    case "run_hours": return gen.runHours;
    case "alarm_count": return gen.alarms;
    case "mcb_closed": return gen.mcb;
    case "gcb_closed": return gen.gcb;
    case "controller_mode_raw": return gen.mode;
    default: return null;
  }
}

function metricDisplay(gen: Generator, metric: string) {
  const value = valueFor(gen, metric);
  if (typeof value === "boolean") return value ? "SIM" : "NÃO";
  if (typeof value === "string") return value;
  if (value == null) return "N/D";
  const digits = metric === "frequency" ? 2 : metric.includes("voltage") || metric === "rpm" || metric === "alarm_count" ? 0 : 1;
  const formatted = formatNumber(value, digits);
  const unit = METRIC_UNITS[metric];
  return unit ? `${formatted} ${unit}` : formatted;
}

function TelemetryCard({ label, value, available }: { label: string; value: string; available: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", !available && "opacity-70")}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-xl font-extrabold", available ? "text-foreground" : "text-muted-foreground")}>{available ? value : "N/D"}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{available ? "Rapid SCADA" : "Canal não homologado neste pack"}</p>
    </div>
  );
}

export function GeneratorDetailScreen({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [eventError, setEventError] = useState("");
  const available = useMemo(() => new Set(gen.availableMetrics ?? []), [gen.availableMetrics]);
  const preferredTrend = useMemo(() => {
    const order = ["frequency", "rpm", "voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2", "power_kw"];
    return order.find((key) => available.has(key)) ?? [...available][0] ?? "";
  }, [available]);
  const [trendMetric, setTrendMetric] = useState(preferredTrend);
  const [trend, setTrend] = useState<RapidTrend | null>(null);
  const [trendError, setTrendError] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    if (!trendMetric || available.has(trendMetric)) return;
    setTrendMetric(preferredTrend);
  }, [available, preferredTrend, trendMetric]);

  useEffect(() => {
    let active = true;
    void rcApi.events.list(300)
      .then((rows) => {
        if (!active) return;
        setEvents(rows.filter((item) => item.generator_id === gen.id || item.tag?.toLowerCase() === gen.tag.toLowerCase()));
        setEventError("");
      })
      .catch((error) => {
        if (active) setEventError(error instanceof Error ? error.message : "Falha ao carregar eventos reais.");
      });
    return () => { active = false; };
  }, [gen.id, gen.tag]);

  useEffect(() => {
    if (!trendMetric) {
      setTrend(null);
      setTrendError("");
      return;
    }
    let active = true;
    setTrendLoading(true);
    void rcApi.generators.trend(gen.id, trendMetric, 24, 1)
      .then((result) => {
        if (!active) return;
        setTrend(result);
        setTrendError("");
      })
      .catch((error) => {
        if (!active) return;
        setTrend(null);
        setTrendError(error instanceof Error ? error.message : "Histórico indisponível.");
      })
      .finally(() => { if (active) setTrendLoading(false); });
    return () => { active = false; };
  }, [gen.id, trendMetric]);

  const command = async (action: "start" | "stop") => {
    if (!can("operate")) {
      setMessage("Seu perfil não possui permissão para operar o gerador.");
      return;
    }
    if (!confirmCmd(action.toUpperCase())) return;
    setCommandBusy(action);
    setMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setMessage(result.accepted ? `${action.toUpperCase()} aceito pelo caminho homologado.` : result.reason || "Comando não aceito.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar comando homologado.");
    } finally {
      setCommandBusy(null);
    }
  };

  const configured = gen.status !== "nao_configurado";
  const runningKnown = available.has("rpm");
  const running = runningKnown ? gen.rpm > 300 : null;
  const modeKnown = available.has("controller_mode_raw");
  const mcbKnown = available.has("mcb_closed");
  const gcbKnown = available.has("gcb_closed");
  const mainsKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"].some((m) => available.has(m));
  const genVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"].some((m) => available.has(m));
  const chartRows = trend?.points.map((point) => ({
    t: new Date(point.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    value: point.value,
  })) ?? [];

  return (
    <article className="gen-detail overflow-auto">
      <div className="space-y-3 p-3 sm:p-4 lg:p-5">
        {message && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-[12px]">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background">
                <img src={controllerImageSrc(gen.controller)} alt={gen.controller} className="max-h-full max-w-full object-contain" onError={(e) => { e.currentTarget.src = CONTROLLER_IMAGE_FALLBACK; }} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold">{displayGenName(gen.tag)}</h1>
                  <StatusPill status={gen.status} />
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{gen.tag} · {gen.controller} · {gen.site || "Sem site"}</p>
                <p className="num mt-1 text-[11px] text-muted-foreground">{gen.ip || "Endpoint N/D"} · Rapid Device {gen.rapidDeviceNum ?? "N/D"} · fonte {gen.telemetrySource || "none"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!can("operate") || !configured || commandBusy !== null} onClick={() => void command("start")} className="h-10 rounded-md bg-online/15 px-4 text-[12px] font-extrabold text-online ring-1 ring-online/40 disabled:cursor-not-allowed disabled:opacity-40">
                {commandBusy === "start" ? "ENVIANDO…" : "START"}
              </button>
              <button type="button" disabled={!can("operate") || !configured || commandBusy !== null} onClick={() => void command("stop")} className="h-10 rounded-md bg-offline/15 px-4 text-[12px] font-extrabold text-offline ring-1 ring-offline/40 disabled:cursor-not-allowed disabled:opacity-40">
                {commandBusy === "stop" ? "ENVIANDO…" : "STOP"}
              </button>
              {(["AUTO", "TEST", "MCB", "GCB", "PRLL"] as const).map((label) => (
                <button key={label} type="button" disabled title="Comando não homologado para este Controller Pack" className="h-10 rounded-md border border-border bg-secondary/30 px-3 text-[11px] font-bold text-muted-foreground opacity-60">
                  {label} · BLOQUEADO
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 rounded-md border border-border bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
            START/STOP usam exclusivamente o backend e o caminho industrial homologado. AUTO, TEST, MCB, GCB e paralelismo permanecem bloqueados até existir documentação e validação específica do Controller Pack.
          </p>
        </section>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <TelemetryCard label="RPM" value={metricDisplay(gen, "rpm")} available={available.has("rpm")} />
          <TelemetryCard label="Frequência" value={metricDisplay(gen, "frequency")} available={available.has("frequency")} />
          <TelemetryCard label="Tensão L1-N" value={metricDisplay(gen, "voltage_l1")} available={available.has("voltage_l1")} />
          <TelemetryCard label="Tensão L2-N" value={metricDisplay(gen, "voltage_l2")} available={available.has("voltage_l2")} />
          <TelemetryCard label="Tensão L3-N" value={metricDisplay(gen, "voltage_l3")} available={available.has("voltage_l3")} />
          <TelemetryCard label="Tensão L1-L2" value={metricDisplay(gen, "voltage_l1_l2")} available={available.has("voltage_l1_l2")} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-card p-3 lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[12px] font-extrabold uppercase tracking-wider">Telemetria homologada</h2>
                <p className="text-[10px] text-muted-foreground">Somente canais presentes no binding do Controller Pack.</p>
              </div>
              <span className="num text-[11px] text-muted-foreground">{available.size} canais</span>
            </div>
            {!available.size && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum canal Rapid homologado para este gerador.</p>}
            {!!available.size && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[...available].map((metric) => (
                  <div key={metric} className="rounded-md border border-border bg-background/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{METRIC_LABELS[metric] ?? metric}</p>
                    <p className="num mt-1 text-[15px] font-bold">{metricDisplay(gen, metric)}</p>
                    <p className="mt-1 truncate text-[9px] text-muted-foreground">{metric}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="text-[12px] font-extrabold uppercase tracking-wider">Estado conhecido</h2>
            <div className="mt-3 space-y-2 text-[12px]">
              <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"><span className="flex items-center gap-2"><Radio className="size-3.5"/>Comunicação</span><b>{gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"}</b></div>
              <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"><span className="flex items-center gap-2"><Activity className="size-3.5"/>Motor em funcionamento</span><b>{running == null ? "N/D" : running ? "SIM" : "NÃO"}</b></div>
              <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"><span className="flex items-center gap-2"><Gauge className="size-3.5"/>Modo</span><b>{modeKnown ? gen.mode : "N/D"}</b></div>
              <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"><span>MCB</span><b>{mcbKnown ? (gen.mcb ? "FECHADO" : "ABERTO") : "N/D"}</b></div>
              <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"><span>GCB</span><b>{gcbKnown ? (gen.gcb ? "FECHADO" : "ABERTO") : "N/D"}</b></div>
            </div>
            {gen.lastError && <div className="mt-3 rounded-md border border-offline/40 bg-offline/10 p-2 text-[11px] text-offline"><AlertTriangle className="mr-1 inline size-3.5"/>{gen.lastError}</div>}
          </section>
        </div>

        <section className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-extrabold uppercase tracking-wider">Histórico real do Rapid SCADA</h2>
              <p className="text-[10px] text-muted-foreground">Arquivo de 1 minuto, últimas 24 horas.</p>
            </div>
            <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)} disabled={!available.size} className="h-8 rounded-md border border-input bg-background px-2 text-[11px]">
              {!available.size && <option value="">Sem métricas</option>}
              {[...available].map((metric) => <option key={metric} value={metric}>{METRIC_LABELS[metric] ?? metric}</option>)}
            </select>
          </div>
          {trendLoading && <p className="py-8 text-center text-sm text-muted-foreground">Consultando histórico…</p>}
          {!trendLoading && trendError && <p className="mt-3 rounded-md border border-border bg-background/40 p-3 text-[11px] text-muted-foreground">{trendError}</p>}
          {!trendLoading && !trendError && trend && !chartRows.length && <p className="py-8 text-center text-sm text-muted-foreground">O Rapid SCADA não retornou pontos definidos para esta janela.</p>}
          {!trendLoading && chartRows.length > 0 && (
            <div className="mt-3 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 8, right: 10, bottom: 0, left: -15 }}>
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} minTickGap={32} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={50} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} formatter={(value: number) => [`${formatNumber(value, 2)} ${METRIC_UNITS[trendMetric] ?? ""}`, METRIC_LABELS[trendMetric] ?? trendMetric]} />
                  <Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wider"><History className="size-4"/>Eventos reais</h2>
              <span className="num text-[10px] text-muted-foreground">{events.length}</span>
            </div>
            {eventError && <p className="text-[11px] text-offline">{eventError}</p>}
            {!eventError && !events.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento registrado para este gerador.</p>}
            <div className="space-y-1.5">
              {events.slice(0, 30).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-md border border-border px-2 py-1.5 text-[11px]">
                  <div className="min-w-0"><b>{event.level}</b><p className="truncate text-muted-foreground">{event.message}</p></div>
                  <span className="num shrink-0 text-[9px] text-muted-foreground">{new Date(event.created_at * 1000).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wider"><ShieldCheck className="size-4"/>Disponibilidade de sinais</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Tensões gerador</span><p className="font-bold">{genVoltageKnown ? "DISPONÍVEL" : "N/D"}</p></div>
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Tensões rede</span><p className="font-bold">{mainsKnown ? "DISPONÍVEL" : "N/D"}</p></div>
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Potência kW</span><p className="font-bold">{available.has("power_kw") ? "DISPONÍVEL" : "N/D"}</p></div>
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Bateria</span><p className="font-bold">{available.has("battery_voltage") ? "DISPONÍVEL" : "N/D"}</p></div>
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Óleo / temperatura</span><p className="font-bold">{available.has("oil_pressure") || available.has("coolant_temperature") ? "DISPONÍVEL" : "N/D"}</p></div>
              <div className="rounded-md border border-border p-2"><span className="text-muted-foreground">Combustível</span><p className="font-bold">{available.has("fuel_level") ? "DISPONÍVEL" : "N/D"}</p></div>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-background/40 p-2 text-[10px] text-muted-foreground"><Zap className="mt-0.5 size-3.5 shrink-0"/>Qualquer item sem canal homologado fica explicitamente como N/D. A interface não estima, deriva nem simula valores industriais.</p>
          </section>
        </div>
      </div>
    </article>
  );
}
