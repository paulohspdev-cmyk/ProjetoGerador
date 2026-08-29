import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useGenerators } from "./GeneratorsProvider";
import { StatusPill } from "./StatusPill";

function hasMetric(gen: Generator, key: string) {
  return (gen.availableMetrics ?? []).includes(key);
}

function metricNumber(gen: Generator, key: string, value: number | null | undefined) {
  return hasMetric(gen, key) && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function fmt(value: number | null, unit = "", digits = 1) {
  if (value == null) return "N/D";
  const text = value.toFixed(digits).replace(".", ",");
  return unit ? `${text} ${unit}` : text;
}

function manufacturerOf(gen: Generator) {
  const source = `${gen.controllerType ?? ""} ${gen.controller}`.toLowerCase();
  if (source.includes("dse") || source.includes("deep sea")) return "DSE";
  if (source.includes("comap") || source.includes("inteligen") || source.includes("intelilite") || source.includes("intelisys")) return "COMAP";
  return "CONTROLADOR";
}

function ModeStrip({ gen, known }: { gen: Generator; known: boolean }) {
  const manufacturer = manufacturerOf(gen);
  const modes = manufacturer === "DSE" ? ["STOP", "MAN", "AUTO", "TEST"] : ["OFF", "MAN", "AUTO", "TEST"];
  const current = gen.mode === "MANUAL" ? "MAN" : gen.mode === "TESTE" ? "TEST" : gen.mode;

  return (
    <div className="grid grid-cols-4 gap-1" aria-label={`Modos ${manufacturer}`}>
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          disabled
          title="Comando de modo não homologado"
          className={cn(
            "h-7 rounded border border-border bg-background/45 text-[9px] font-extrabold tracking-wide text-muted-foreground",
            known && current === mode && "border-online/70 bg-online/15 text-online",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

function KwGauge({ gen, kw }: { gen: Generator; kw: number | null }) {
  const nominal = gen.nominalPowerKw != null && gen.nominalPowerKw > 0 ? gen.nominalPowerKw : null;
  const pct = kw != null && nominal != null ? Math.max(0, Math.min(1, kw / nominal)) : null;
  const angle = pct == null ? null : -135 + pct * 270;
  const rad = angle == null ? 0 : (angle * Math.PI) / 180;
  const x = 90 + Math.cos(rad) * 49;
  const y = 83 + Math.sin(rad) * 49;

  return (
    <div className="rounded-md border border-border/80 bg-background/35 px-2 pb-2 pt-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wide">Potência</span>
        <span className="text-[8px] uppercase text-muted-foreground">kW</span>
      </div>
      <svg viewBox="0 0 180 108" className="mx-auto h-[112px] w-full max-w-[190px]" role="img" aria-label="Potência ativa do gerador">
        <path d="M24 88 A66 66 0 0 1 156 88" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" className="text-secondary" />
        <path d="M24 88 A66 66 0 0 1 137 41" fill="none" stroke="#21d30d" strokeWidth="14" strokeLinecap="round" />
        <path d="M137 41 A66 66 0 0 1 156 88" fill="none" stroke="#ffc126" strokeWidth="14" strokeLinecap="round" />
        {angle != null && (
          <>
            <line x1="90" y1="83" x2={x} y2={y} stroke="#f3f7fa" strokeWidth="3" strokeLinecap="round" />
            <circle cx="90" cy="83" r="5" fill="#f3f7fa" />
          </>
        )}
        <text x="90" y="78" textAnchor="middle" fill="#f4f8fb" fontSize="17" fontWeight="800">{kw == null ? "N/D" : kw.toFixed(0)}</text>
        <text x="90" y="98" textAnchor="middle" fill="#8496a5" fontSize="8">{nominal == null ? "ESCALA N/D" : `0 — ${nominal.toFixed(0)} kW`}</text>
      </svg>
    </div>
  );
}

function Breaker({ label, known, closed }: { label: string; known: boolean; closed: boolean }) {
  return (
    <div className="flex w-[70px] flex-col items-center gap-1">
      <span className="text-[8px] font-extrabold text-muted-foreground">{label}</span>
      <div className={cn("h-1 w-full rounded-full bg-secondary", known && closed && "bg-online", known && !closed && "bg-muted-foreground/45")} />
      <button
        type="button"
        disabled
        title="Comando de contato não homologado"
        className={cn(
          "h-7 w-11 rounded border text-[9px] font-black",
          known && closed ? "border-online/70 bg-online/15 text-online" : "border-border bg-background/60 text-muted-foreground",
        )}
      >
        I/O
      </button>
      <span className="text-[7px] font-bold text-muted-foreground">{known ? (closed ? "FECHADO" : "ABERTO") : "N/D"}</span>
    </div>
  );
}

function MiniPowerFlow({ gen, rpm, frequency, kw }: { gen: Generator; rpm: number | null; frequency: number | null; kw: number | null }) {
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const mainsKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"].some((key) => hasMetric(gen, key));
  const mainsVoltage = Math.max(gen.mains.l1 || 0, gen.mains.l2 || 0, gen.mains.l3 || 0, gen.mains.l12 || 0);
  const mainsLive = mainsKnown && mainsVoltage > 50;
  const running = rpm != null && rpm > 300 && frequency != null && frequency > 1;
  const busLive = (mainsLive && mcbKnown && gen.mcb) || (running && gcbKnown && gen.gcb);
  const loadKnown = kw != null;

  return (
    <div className="relative min-h-[220px] rounded-md border border-border/80 bg-background/35 p-2">
      <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
        <div className={cn("mx-auto grid size-9 place-items-center rounded-full border-2 border-muted-foreground/50 text-[14px]", mainsLive && "border-online text-online")}>⚡</div>
        <span className="mt-1 block text-[8px] font-bold text-muted-foreground">REDE {mainsKnown ? "" : "N/D"}</span>
      </div>

      <div className={cn("absolute left-1/2 top-[58px] h-[49px] w-[2px] -translate-x-1/2 bg-muted-foreground/35", mainsLive && "bg-online/70")} />
      <div className="absolute left-2 top-[66px]"><Breaker label="MCB" known={mcbKnown} closed={gen.mcb} /></div>

      <div className={cn("absolute left-1/2 top-[107px] h-[2px] w-[74px] bg-muted-foreground/35", busLive && "bg-online/70")} />
      <div className={cn("absolute left-1/2 top-[107px] h-[64px] w-[2px] -translate-x-1/2 bg-muted-foreground/35", busLive && "bg-online/70")} />
      <div className={cn("absolute left-1/2 top-[104px] size-2 -translate-x-1/2 rounded-full bg-muted-foreground", busLive && "bg-online shadow-[0_0_8px_rgba(33,211,13,.7)]")} />

      <div className="absolute right-2 top-[88px] flex h-[42px] w-[76px] flex-col items-center justify-center rounded border border-border bg-card/70">
        <span className="text-[8px] font-extrabold">LOAD</span>
        <span className={cn("num text-[10px] font-black", loadKnown && "text-online")}>{fmt(kw, "kW", 0)}</span>
      </div>

      <div className="absolute left-2 top-[139px]"><Breaker label="GCB" known={gcbKnown} closed={gen.gcb} /></div>
      <div className={cn("absolute left-1/2 top-[171px] h-[20px] w-[2px] -translate-x-1/2 bg-muted-foreground/35", running && "bg-online/70")} />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
        <div className={cn("grid size-10 place-items-center rounded-full border-2 border-muted-foreground/55 text-lg font-black", running && "border-online text-online")}>G</div>
        <span className="mt-1 block text-[8px] font-bold text-muted-foreground">{fmt(frequency, "Hz", 1)}</span>
      </div>
    </div>
  );
}

function QuickMetric({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={cn("rounded border border-border/70 bg-background/35 px-2 py-1.5", first && "border-primary/35")}>
      <span className="block text-[8px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="num mt-0.5 block truncate text-[11px]">{value}</strong>
    </div>
  );
}

export function GeneratorOverviewCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const kw = metricNumber(gen, "power_kw", gen.load);
  const voltage = metricNumber(gen, "voltage_l1_l2", gen.gen.l12) ?? metricNumber(gen, "voltage_l1", gen.gen.l1);
  const modeKnown = hasMetric(gen, "controller_mode_raw");

  const ig200Homologated = gen.controller.trim().toLowerCase() === "inteligen 200" && Number(gen.rapidDeviceNum) > 0;
  const canOperate = can("operate") && ig200Homologated && gen.status !== "nao_configurado";

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    if (!canOperate || busy || !confirmCmd(label)) return;
    setBusy(action);
    setMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setMessage(result.reason || `${label} aceito.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Falha no comando ${label}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex min-h-12 items-center gap-2 border-b border-border/70 px-3 py-2">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-black", gen.status === "online" || gen.status === "alerta" ? "border-online text-online" : "border-muted-foreground/50 text-muted-foreground")}>G</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[12px] font-extrabold">{gen.name || gen.tag}</h3>
          <p className="truncate text-[9px] text-muted-foreground">{gen.tag} · {gen.controller}</p>
        </div>
        <StatusPill status={gen.status} />
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-6" />
      </header>

      <div className="space-y-2 p-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[145px_minmax(0,1fr)]">
          <div className="space-y-2">
            <KwGauge gen={gen} kw={kw} />
            <ModeStrip gen={gen} known={modeKnown} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_54px] gap-2">
            <MiniPowerFlow gen={gen} rpm={rpm} frequency={frequency} kw={kw} />
            <div className="flex flex-col justify-end gap-2 pb-2">
              <button type="button" disabled={!canOperate || busy !== null} onClick={() => void runCommand("start")} className="h-10 rounded bg-[#20bc00] text-[9px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === "start" ? "..." : "START"}</button>
              <button type="button" disabled={!canOperate || busy !== null} onClick={() => void runCommand("stop")} className="h-10 rounded bg-[#d71818] text-[9px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === "stop" ? "..." : "STOP"}</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <QuickMetric first label="RPM" value={fmt(rpm, "rpm", 0)} />
          <QuickMetric label="Frequência" value={fmt(frequency, "Hz", 1)} />
          <QuickMetric label="Tensão" value={fmt(voltage, "V", 0)} />
          <QuickMetric label="Potência" value={fmt(kw, "kW", 0)} />
        </div>

        {message && <p className="rounded border border-border/70 bg-background/40 px-2 py-1 text-[9px] text-muted-foreground">{message}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <div className="min-w-0 text-[9px] text-muted-foreground">
            <span>{manufacturerOf(gen)}</span>
            <span className="mx-1">·</span>
            <span>Modo {modeKnown ? gen.mode : "N/D"}</span>
          </div>
          <Link to="/p/geradores/$id" params={{ id: gen.id }} className="flex h-7 shrink-0 items-center gap-1 rounded border border-border bg-background/55 px-2 text-[9px] font-bold hover:bg-secondary">
            Detalhes <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}
