import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, History, Radio, ShieldCheck } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/data/controller-images";
import { displayGenName, type Generator } from "@/data/generators";
import { rcApi, type EventItemApi, type RapidTrend } from "@/lib/api";
import { cn } from "@/lib/utils";
import { IoBtn, PowerFlowSld, fmt } from "./PowerFlowCard";
import { StatusPill } from "./StatusPill";
import {
  IconBattery,
  IconClock,
  IconFuelPump,
  IconOilCan,
  IconRunHours,
  IconThermometer,
} from "./scada-icons";
import "./comap-panel.css";
import "./generator-detail.css";

function hasMetric(gen: Generator, key: string) {
  return (gen.availableMetrics ?? []).includes(key);
}

function metricNumber(gen: Generator, key: string, value: number | null | undefined) {
  return hasMetric(gen, key) && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function metricText(value: number | null, unit = "", digits = 1) {
  if (value == null) return "N/D";
  const text = fmt(value, digits);
  return unit ? `${text} ${unit}` : text;
}

function toneFor(value: number | null, warn: (n: number) => boolean, bad: (n: number) => boolean): "ok" | "warn" | "bad" | undefined {
  if (value == null) return undefined;
  if (bad(value)) return "bad";
  if (warn(value)) return "warn";
  return "ok";
}

function KpiTile({
  label,
  value,
  sub,
  tone = "cyan",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "green" | "cyan" | "gold" | "blue" | "red";
}) {
  return (
    <div className={cn("gen-kpi", tone)}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="gen-cell">
      <p>{label}</p>
      <strong className="num">{value}</strong>
    </div>
  );
}

function BoolFlag({ label, value, goodWhenTrue = false }: { label: string; value: boolean | null; goodWhenTrue?: boolean }) {
  if (value == null) {
    return (
      <div className="gen-flag">
        <span>{label}</span>
        <b className="num text-muted-foreground">N/D</b>
      </div>
    );
  }
  const ok = goodWhenTrue ? value : !value;
  return (
    <div className="gen-flag">
      <span>{label}</span>
      <b className={cn("num", ok ? "text-online" : "text-offline")}>{value ? "true" : "false"}</b>
    </div>
  );
}

function FlowChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={cn("flow-chip", tone)}>
      <span className="flow-chip-icon">{icon}</span>
      <div className="min-w-0">
        <p>{label}</p>
        <strong className="num">{value}</strong>
      </div>
    </div>
  );
}

function Readout({ label, value, unit, tone }: { label: string; value: number | null; unit: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={cn("gen-read", tone ?? "ok", value == null && "opacity-60")}>
      <p>{label}</p>
      <strong className="num">
        {value == null ? "N/D" : fmt(value, unit === "Hz" ? 2 : unit === "V" || unit === "RPM" ? 0 : 1)}
        {value != null && <span>{unit}</span>}
      </strong>
    </div>
  );
}

function TrendCard({ trend, loading, error }: { trend: RapidTrend | null; loading: boolean; error: string }) {
  const rows = trend?.points.map((point) => ({
    t: new Date(point.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    v: point.value,
  })) ?? [];

  return (
    <section className="gen-card gen-chart-card">
      <header className="gen-card-head">
        <h2>Histórico Rapid 24h</h2>
        <span className="num text-[10px] text-muted-foreground">{trend?.metric ?? "N/D"}</span>
      </header>
      <div className="gen-chart-body">
        {loading && <div className="grid h-full place-items-center text-[10px] text-muted-foreground">Consultando Rapid SCADA…</div>}
        {!loading && error && <div className="grid h-full place-items-center px-3 text-center text-[10px] text-muted-foreground">{error}</div>}
        {!loading && !error && !rows.length && <div className="grid h-full place-items-center text-[10px] text-muted-foreground">Sem pontos no período</div>}
        {!loading && !error && rows.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} width={40} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} />
              <Line type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function statusText(gen: Generator, running: boolean | null) {
  if (gen.status === "nao_configurado") return "Não configurado";
  if (gen.status === "offline") return "Offline";
  if (gen.status === "alerta") return "Alerta";
  if (running === true) return "Running";
  if (running === false) return "Off - Ready";
  return "Online";
}

export function GeneratorDetailScreen({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [eventError, setEventError] = useState("");
  const [trend, setTrend] = useState<RapidTrend | null>(null);
  const [trendError, setTrendError] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);

  const available = useMemo(() => new Set(gen.availableMetrics ?? []), [gen.availableMetrics]);
  const preferredTrend = useMemo(() => {
    const order = ["frequency", "rpm", "voltage_l1_l2", "voltage_l1", "voltage_l2", "voltage_l3", "power_kw"];
    return order.find((key) => available.has(key)) ?? [...available][0] ?? "";
  }, [available]);

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
    if (!preferredTrend) {
      setTrend(null);
      setTrendError("");
      return;
    }
    let active = true;
    setTrendLoading(true);
    void rcApi.generators.trend(gen.id, preferredTrend, 24, 1)
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
  }, [gen.id, preferredTrend]);

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
      setMessage(result.reason || `${action.toUpperCase()} aceito pelo caminho homologado.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar comando homologado.");
    } finally {
      setCommandBusy(null);
    }
  };

  const configured = gen.status !== "nao_configurado";
  const operate = can("operate") && configured;
  const comm = gen.telemetrySource === "rapid_scada" && gen.status !== "offline";

  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genL12 = metricNumber(gen, "voltage_l1_l2", gen.gen.l12);
  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const load = metricNumber(gen, "power_kw", gen.load);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const temp = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const batt = metricNumber(gen, "battery_voltage", gen.battery);
  const alt = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const alarms = metricNumber(gen, "alarm_count", gen.alarms);

  const runningKnown = rpm != null;
  const running = runningKnown ? rpm > 300 : null;
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const mcb = mcbKnown && gen.mcb;
  const gcb = gcbKnown && gen.gcb;
  const mainsKnown = [mainsL1, mainsL2, mainsL3, mainsL12].some((v) => v != null);
  const mainsOk = mainsKnown && Math.max(mainsL1 ?? 0, mainsL2 ?? 0, mainsL3 ?? 0, mainsL12 ?? 0) > 50;
  const modeLabel = modeKnown ? gen.mode : "N/D";
  const ready = statusText(gen, running);
  const name = displayGenName(gen.tag);

  const genVoltageTone = toneFor(genL12, (n) => n > 0 && (n < 350 || n > 440), (n) => n > 0 && (n < 320 || n > 470));
  const rpmTone = toneFor(rpm, (n) => n > 1900, (n) => n > 2200);
  const frequencyTone = toneFor(frequency, (n) => n > 0 && (n < 58 || n > 62), (n) => n > 0 && (n < 55 || n > 65));

  return (
    <article className="gen-detail">
      {message && (
        <div className="gen-toast" role="alert">
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className="gen-top">
        <section className="gen-ident">
          <div className="gen-ident-photo">
            <img
              src={controllerImageSrc(gen.controller)}
              alt={gen.controller}
              onError={(e) => { e.currentTarget.src = CONTROLLER_IMAGE_FALLBACK; }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1>{name}</h1>
              <span className={cn("gen-true", !comm && "opacity-60")}><i />{comm ? "true" : "false"}</span>
            </div>
            <p>{gen.controller} · {ready} · {modeLabel} · {gen.site || "Sem site"}</p>
            <p className="gen-ident-meta">{gen.ip || "Endpoint N/D"} · {gen.tag} · Rapid Device {gen.rapidDeviceNum ?? "N/D"}</p>
          </div>
        </section>

        <div className="gen-kpis">
          <KpiTile label="Status" value={ready} sub={comm ? "Rapid SCADA conectado" : "Sem telemetria atual"} tone={comm ? "green" : "red"} />
          <KpiTile label="RPM" value={metricText(rpm, "rpm", 0)} sub="Registro 1000" tone="cyan" />
          <KpiTile label="Gerador kW" value={metricText(load, "kW", 0)} sub={load == null ? "Canal não homologado" : "Rapid SCADA"} tone="gold" />
          <KpiTile label="Gerador Hz" value={metricText(frequency, "Hz", 2)} sub={frequency == null ? "Canal não homologado" : "Rapid SCADA"} tone="cyan" />
          <KpiTile label="Tensão L1-L2" value={metricText(genL12, "V", 0)} sub={genL12 == null ? "Canal não homologado" : "Rapid SCADA"} tone="blue" />
          <KpiTile label="Rapid Device" value={gen.rapidDeviceNum == null ? "N/D" : String(gen.rapidDeviceNum)} sub={`Fonte ${gen.telemetrySource || "none"}`} tone="gold" />
        </div>

        <div className="gen-cmds">
          <button type="button" disabled={!operate || commandBusy !== null} className={cn(running === false && "active off")} onClick={() => void command("stop")}>{commandBusy === "stop" ? "..." : "OFF"}</button>
          <button type="button" disabled={!operate || commandBusy !== null} className={cn(running === true && "active")} onClick={() => void command("start")}>{commandBusy === "start" ? "..." : "ON"}</button>
          <button type="button" disabled title="AUTO ainda não homologado">AUTO</button>
          <button type="button" disabled title="TEST ainda não homologado">TEST</button>
        </div>
      </div>

      <section className="comap-panel gen-flow">
        <header className="comap-header">
          <span className={cn("comap-logo", running === true ? "online" : "offline")}>G</span>
          <h3 className="comap-name">Power Flow</h3>
          <span className="comap-mode">MODE: {modeLabel}</span>
        </header>
        <div className="comap-sld min-h-0 flex-1 px-1 pb-1">
          <div className="comap-sld-stage">
            <button type="button" disabled title="Paralelismo não homologado" className="comap-prll cursor-not-allowed opacity-60" style={{ position: "absolute", left: 0, top: "1%", zIndex: 20 }}>PRLL<br />N/D</button>
            <div className="absolute left-[1%] top-[24%] z-[2] flex flex-col items-center gap-0.5">
              <span className="flow-breaker-name">MCB</span>
              <div className="flex flex-col gap-0.5">
                <IoBtn label="I" tone="close" active={mcbKnown && mcb} ariaLabel={mcbKnown ? "MCB fechado" : "Estado MCB indisponível"} />
                <IoBtn label="O" tone="open" active={mcbKnown && !mcb} ariaLabel={mcbKnown ? "MCB aberto" : "Estado MCB indisponível"} />
              </div>
            </div>
            <div className="absolute left-[1%] top-[50%] z-[2] flex flex-col items-center gap-0.5">
              <span className="flow-breaker-name">GCB</span>
              <div className="flex flex-col gap-0.5">
                <IoBtn label="I" tone="close" active={gcbKnown && gcb} ariaLabel={gcbKnown ? "GCB fechado" : "Estado GCB indisponível"} />
                <IoBtn label="O" tone="open" active={gcbKnown && !gcb} ariaLabel={gcbKnown ? "GCB aberto" : "Estado GCB indisponível"} />
              </div>
            </div>
            <PowerFlowSld
              mcb={mcb}
              gcb={gcb}
              running={running === true}
              mainsOk={mainsOk}
              gridHz={0}
              genHz={frequency ?? 0}
              loadKw={load ?? 0}
              mcbKnown={mcbKnown}
              gcbKnown={gcbKnown}
              runningKnown={runningKnown}
              mainsKnown={mainsKnown}
              gridHzKnown={false}
              genHzKnown={frequency != null}
              loadKnown={load != null}
            />
            <div className="absolute bottom-[2%] right-[1%] z-10 flex flex-col gap-1">
              <button type="button" className="comap-start" disabled={!operate || commandBusy !== null} onClick={() => void command("start")}>{commandBusy === "start" ? "..." : "START"}</button>
              <button type="button" className="comap-stop" disabled={!operate || commandBusy !== null} onClick={() => void command("stop")}>{commandBusy === "stop" ? "..." : "STOP"}</button>
            </div>
          </div>
        </div>
        <div className="comap-mg">
          <div className="comap-table-head"><span>Mains / Gen</span><span>Rede</span><span>Gerador</span></div>
          {[
            ["L1-N", metricText(mainsL1, "V", 0), metricText(genL1, "V", 0)],
            ["L2-N", metricText(mainsL2, "V", 0), metricText(genL2, "V", 0)],
            ["L3-N", metricText(mainsL3, "V", 0), metricText(genL3, "V", 0)],
            ["L1-L2", metricText(mainsL12, "V", 0), metricText(genL12, "V", 0)],
            ["Hz", "N/D", metricText(frequency, "Hz", 2)],
            ["kW", "N/D", metricText(load, "kW", 0)],
          ].map(([label, mainsValue, genValue]) => (
            <div key={label} className="comap-table-row"><span className="label">{label}</span><span className="mains">{mainsValue}</span><span className="gen">{genValue}</span></div>
          ))}
        </div>
      </section>

      <aside className="flow-icons">
        <FlowChip icon={<IconFuelPump size={34} />} label="Combustível" value={metricText(fuel, "%", 0)} tone={toneFor(fuel, (n) => n < 40, (n) => n < 15)} />
        <FlowChip icon={<IconThermometer size={34} />} label="Temperatura" value={metricText(temp, "°C", 0)} tone={toneFor(temp, (n) => n > 85, (n) => n > 98)} />
        <FlowChip icon={<IconOilCan size={34} />} label="Óleo" value={metricText(oil, "bar", 1)} tone={toneFor(oil, (n) => n > 0 && n < 3, (n) => n > 0 && n < 2)} />
        <FlowChip icon={<IconBattery size={34} />} label="Bateria" value={metricText(batt, "V", 1)} tone={toneFor(batt, (n) => n < 12.2, (n) => n < 11.5)} />
        <FlowChip icon={<IconClock size={34} />} label="Manutenção" value={metricText(maintenance, "h", 0)} />
        <FlowChip icon={<IconRunHours size={34} />} label="Horímetro" value={metricText(runHours, "h", 1)} />
      </aside>

      <div className="gen-mid">
        <section className="gen-card">
          <header className="gen-card-head"><h2>Alarmes / Estado</h2><span className="gen-badge">{alarms == null ? "—" : fmt(alarms, 0)}</span></header>
          <div className="gen-alarm-compact">
            <b className={alarms != null && alarms > 0 ? "text-offline" : "text-online"}><AlertTriangle className="size-4" /></b>
            <p className={cn("text-[11px] font-bold", alarms != null && alarms > 0 ? "text-offline" : "text-online")}>{alarms == null ? "Canal de alarmes não homologado" : alarms > 0 ? `${fmt(alarms, 0)} alarme(s) reportado(s)` : "Sem alarmes reportados"}</p>
          </div>
          <div className="gen-flags">
            <BoolFlag label="Comunicação Rapid" value={comm} goodWhenTrue />
            <BoolFlag label="Motor em marcha" value={running} goodWhenTrue />
            <BoolFlag label="MCB fechado" value={mcbKnown ? gen.mcb : null} goodWhenTrue />
            <BoolFlag label="GCB fechado" value={gcbKnown ? gen.gcb : null} goodWhenTrue />
            <BoolFlag label="Modo conhecido" value={modeKnown ? true : null} goodWhenTrue />
            <BoolFlag label="Falha comunicação" value={gen.status === "offline"} />
          </div>
        </section>

        <section className="gen-card min-h-0">
          <header className="gen-card-head"><h2>Rede elétrica</h2><span className="num text-[12px] font-bold text-muted-foreground">Hz N/D</span></header>
          <div className="gen-metrics gen-metrics-3">
            <MetricCell label="L1-N" value={metricText(mainsL1, "V", 0)} />
            <MetricCell label="L2-N" value={metricText(mainsL2, "V", 0)} />
            <MetricCell label="L3-N" value={metricText(mainsL3, "V", 0)} />
            <MetricCell label="L1-L2" value={metricText(mainsL12, "V", 0)} />
            <MetricCell label="MCB" value={mcbKnown ? (gen.mcb ? "FECHADO" : "ABERTO") : "N/D"} />
            <MetricCell label="Fonte" value={mainsKnown ? "Rapid SCADA" : "N/D"} />
          </div>
          <div className="gen-phase">
            <span>L1-N <b>{metricText(mainsL1, "V", 0)}</b></span>
            <span>L1-L2 <b>{metricText(mainsL12, "V", 0)}</b></span>
            <span>L2-N <b>{metricText(mainsL2, "V", 0)}</b></span>
            <span>L3-N <b>{metricText(mainsL3, "V", 0)}</b></span>
          </div>
        </section>

        <section className="gen-card gen-motor">
          <header className="gen-card-head"><h2>Motor / ECU</h2><StatusPill status={gen.status} /></header>
          <div className="gen-metrics gen-metrics-4">
            <MetricCell label="RPM" value={metricText(rpm, "rpm", 0)} />
            <MetricCell label="Óleo" value={metricText(oil, "bar", 1)} />
            <MetricCell label="Temp. água" value={metricText(temp, "°C", 0)} />
            <MetricCell label="Combustível" value={metricText(fuel, "%", 0)} />
            <MetricCell label="Bateria" value={metricText(batt, "V", 1)} />
            <MetricCell label="Alternador" value={metricText(alt, "V", 1)} />
            <MetricCell label="Horímetro" value={metricText(runHours, "h", 1)} />
            <MetricCell label="Manutenção" value={metricText(maintenance, "h", 0)} />
            <MetricCell label="Modo" value={modeLabel} />
            <MetricCell label="Fonte" value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"} />
            <MetricCell label="Device" value={gen.rapidDeviceNum == null ? "N/D" : String(gen.rapidDeviceNum)} />
            <MetricCell label="Estado" value={ready} />
          </div>
        </section>
      </div>

      <div className="gen-data">
        <section className="gen-card gen-elec">
          <header className="gen-card-head"><h2>Elétrica do gerador</h2><span className="num text-[11px] font-bold">{metricText(frequency, "Hz", 2)}</span></header>
          <div className="gen-metrics gen-metrics-3">
            <MetricCell label="L1-N" value={metricText(genL1, "V", 0)} />
            <MetricCell label="L2-N" value={metricText(genL2, "V", 0)} />
            <MetricCell label="L3-N" value={metricText(genL3, "V", 0)} />
            <MetricCell label="L1-L2" value={metricText(genL12, "V", 0)} />
            <MetricCell label="Frequência" value={metricText(frequency, "Hz", 2)} />
            <MetricCell label="Potência" value={metricText(load, "kW", 0)} />
            <MetricCell label="GCB" value={gcbKnown ? (gen.gcb ? "FECHADO" : "ABERTO") : "N/D"} />
            <MetricCell label="RPM" value={metricText(rpm, "rpm", 0)} />
            <MetricCell label="Fonte" value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"} />
          </div>
        </section>

        <div className="gen-dials" aria-label="Instrumentos reais">
          <Readout label="RPM" value={rpm} unit="RPM" tone={rpmTone} />
          <Readout label="Frequência" value={frequency} unit="Hz" tone={frequencyTone} />
          <Readout label="Tensão L1-L2" value={genL12} unit="V" tone={genVoltageTone} />
          <Readout label="Tensão L1-N" value={genL1} unit="V" />
          <Readout label="Tensão L2-N" value={genL2} unit="V" />
          <Readout label="Tensão L3-N" value={genL3} unit="V" />
          <Readout label="Potência" value={load} unit="kW" />
          <Readout label="Bateria" value={batt} unit="V" />
          <Readout label="Horímetro" value={runHours} unit="h" />
        </div>

        <section className="maint-bar">
          <header><h3>Horas para manutenção</h3><strong className="num">{metricText(maintenance, "h", 0)}</strong></header>
          <div className="maint-track"><i className="ok" style={{ width: maintenance == null ? "0%" : "100%" }} /></div>
          <p>{maintenance == null ? "Canal não homologado neste Controller Pack" : "Valor real recebido do Rapid SCADA"}</p>
        </section>
      </div>

      <div className="gen-bottom">
        <TrendCard trend={trend} loading={trendLoading} error={trendError} />

        <section className="gen-card min-h-0 overflow-hidden">
          <header className="gen-card-head"><h2>Eventos reais</h2><span className="num text-[10px] text-muted-foreground">{events.length}</span></header>
          <div className="gen-resumo">
            {eventError && <div><span>Erro</span><b>{eventError}</b></div>}
            {!eventError && !events.length && <div><span>Eventos</span><b>Nenhum registrado</b></div>}
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="gen-log"><span>{new Date(event.created_at * 1000).toLocaleTimeString("pt-BR")}</span><b>{event.message}</b></div>
            ))}
          </div>
        </section>

        <section className="gen-card min-h-0 overflow-hidden">
          <header className="gen-card-head"><h2>Sinais Rapid</h2><span className="num text-[10px] text-muted-foreground">{available.size}</span></header>
          <div className="gen-resumo">
            <div><span>Comunicação</span><b>{comm ? "CONECTADO" : "N/D"}</b></div>
            <div><span>RPM</span><b>{rpm != null ? "DISPONÍVEL" : "N/D"}</b></div>
            <div><span>Frequência</span><b>{frequency != null ? "DISPONÍVEL" : "N/D"}</b></div>
            <div><span>Tensão GEN</span><b>{genL1 != null || genL12 != null ? "DISPONÍVEL" : "N/D"}</b></div>
            <div><span>Tensão rede</span><b>{mainsKnown ? "DISPONÍVEL" : "N/D"}</b></div>
            <div><span>MCB / GCB</span><b>{mcbKnown || gcbKnown ? "DISPONÍVEL" : "N/D"}</b></div>
          </div>
        </section>

        <section className="gen-card min-h-0 overflow-hidden">
          <header className="gen-card-head"><h2>Resumo</h2><ShieldCheck className="size-3.5 text-online" /></header>
          <div className="gen-resumo">
            <div><span>Endpoint</span><b className="num">{gen.ip || "N/D"}</b></div>
            <div><span>Controladora</span><b>{gen.controller}</b></div>
            <div><span>Rapid Device</span><b className="num">{gen.rapidDeviceNum ?? "N/D"}</b></div>
            <div><span>Telemetria</span><b>{gen.telemetrySource || "none"}</b></div>
            <div><span>MCB / GCB</span><b>{mcbKnown ? (gen.mcb ? "I" : "O") : "N/D"} / {gcbKnown ? (gen.gcb ? "I" : "O") : "N/D"}</b></div>
            <div><span>Último erro</span><b>{gen.lastError || "—"}</b></div>
            <div className="gen-log"><span><Radio className="inline size-3" /></span><b>Sem valores estimados ou simulados</b></div>
            <div className="gen-log"><span><Activity className="inline size-3" /></span><b>START/STOP via backend homologado</b></div>
            <div className="gen-log"><span><History className="inline size-3" /></span><b>Histórico do Rapid SCADA</b></div>
          </div>
        </section>
      </div>
    </article>
  );
}
