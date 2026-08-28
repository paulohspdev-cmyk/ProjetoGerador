import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useGenerators } from "./GeneratorsProvider";
import { RpmGauge } from "./RpmGauge";
import {
  IconBattery,
  IconBolt,
  IconClock,
  IconFuelPump,
  IconHouse,
  IconOilCan,
  IconRunHours,
  IconThermometer,
} from "./scada-icons";
import "./comap-panel.css";

export function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "N/D";
}

function displayName(tag: string) {
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
}

function hasMetric(gen: Generator, key: string) {
  return (gen.availableMetrics ?? []).includes(key);
}

function read(gen: Generator, key: string, value: number | null | undefined, unit = "", digits = 1) {
  if (!hasMetric(gen, key) || value == null || !Number.isFinite(Number(value))) return "N/D";
  return `${fmt(Number(value), digits)}${unit ? ` ${unit}` : ""}`;
}

function meterColor(kind: string, pct: number) {
  if (kind === "fuel") {
    if (pct > 40) return "linear-gradient(90deg,#1da5f2,#0d73af)";
    if (pct > 15) return "linear-gradient(90deg,#f39c12,#d68910)";
    return "linear-gradient(90deg,#e74c3c,#c0392b)";
  }
  if (kind === "temp") {
    if (pct < 50) return "linear-gradient(90deg,#3498db,#2980b9)";
    if (pct < 71) return "linear-gradient(90deg,#2ecc71,#27ae60)";
    return "linear-gradient(90deg,#e74c3c,#c0392b)";
  }
  if (kind === "oil") {
    if (pct < 30) return "linear-gradient(90deg,#e74c3c,#c0392b)";
    if (pct < 50) return "linear-gradient(90deg,#f39c12,#d68910)";
    return "linear-gradient(90deg,#2ecc71,#27ae60)";
  }
  if (kind === "maint") {
    if (pct < 10) return "linear-gradient(90deg,#e74c3c,#c0392b)";
    if (pct < 30) return "linear-gradient(90deg,#f39c12,#d68910)";
    return "linear-gradient(90deg,#2ecc71,#27ae60)";
  }
  return "linear-gradient(90deg,#2ecc71,#27ae60)";
}

function IoBtn({
  label,
  active,
  known,
  tone,
  ariaLabel,
}: {
  label: "I" | "O";
  active: boolean;
  known: boolean;
  tone: "close" | "open";
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={known ? "Estado recebido; comando não homologado" : "Estado não homologado"}
      aria-label={ariaLabel}
      aria-pressed={known && active}
      className={cn(
        "flow-breaker-btn cursor-not-allowed",
        known ? "opacity-80" : "opacity-35",
        known && active && tone === "close" && "active-on",
        known && active && tone === "open" && "active-off",
      )}
    >
      {known ? label : "—"}
    </button>
  );
}

function EngineRow({
  icon,
  label,
  value,
  known,
  pct,
  kind = "ok",
  bar = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  known: boolean;
  pct?: number | undefined;
  kind?: string;
  bar?: boolean;
}) {
  const fill = known && pct != null ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className={cn("comap-engine", kind === "maint" && "maint", !known && "opacity-55")}>
      {icon}
      <span className="engine-label">{label}</span>
      {bar ? (
        <span className="comap-meter">
          {known && pct != null ? <i style={{ width: `${fill}%`, background: meterColor(kind, fill) }} /> : null}
        </span>
      ) : (
        <span />
      )}
      <span className="engine-value">{known ? value : "N/D"}</span>
    </div>
  );
}

function FlowWire({ d, live, reverse = false }: { d: string; live: boolean; reverse?: boolean }) {
  if (!live) return null;
  return (
    <g>
      <path d={d} className="flow-bus-glow" />
      <path d={d} className={cn("flow-bus-dash", reverse && "is-reverse")} />
      <circle r="3.2" fill="#f8fff9">
        <animateMotion dur="0.65s" repeatCount="indefinite" path={d} keyPoints={reverse ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
      </circle>
    </g>
  );
}

function PowerFlowSld({
  mcb,
  gcb,
  mcbKnown,
  gcbKnown,
  running,
  runningKnown,
  mainsKnown,
  generatorFrequency,
  frequencyKnown,
  loadText,
  powerKnown,
}: {
  mcb: boolean;
  gcb: boolean;
  mcbKnown: boolean;
  gcbKnown: boolean;
  running: boolean;
  runningKnown: boolean;
  mainsKnown: boolean;
  generatorFrequency: number | null | undefined;
  frequencyKnown: boolean;
  loadText: string;
  powerKnown: boolean;
}) {
  const mainsPost = mainsKnown && mcbKnown && mcb;
  const genPost = runningKnown && running && gcbKnown && gcb;
  const loadLive = mainsPost || genPost;

  return (
    <svg viewBox="0 0 230 400" className="flow-diagram" preserveAspectRatio="xMidYMid meet" aria-label="Fluxo de energia">
      <g transform="translate(80 40)">
        <circle r="28" className={cn("flow-device-circle", mainsKnown && "source-active")} />
        <g className="flow-device-icon tower-icon">
          <path d="M0-20 0 18M-8 18 0-20 8 18M-12-8H12M-15 2H15M-18 12H18" />
          <path d="m-11-8 11 10 11-10M-14 2 0 12 14 2" />
        </g>
        <text x="35" y="5" fontSize="13" fontWeight="bold" fill="#eef4f8" textAnchor="start">N/D Hz</text>
      </g>

      <g transform="translate(178 200)">
        <rect x="-46" y="-32" width="90" height="64" rx="6" className="flow-load-card" />
        <g transform="translate(-22 0)" className="flow-device-icon">
          <path d="M-16 10 h32" strokeWidth="1.6" />
          <path d="M-12 10 V-2 l 7 2 V-12 l 8 2 V10 M 3 -1 l 7 2 V10" strokeWidth="1.6" fill="none" />
        </g>
        <text x="16" y="-7" textAnchor="middle" className="flow-load-card-title">LOAD</text>
        <text x="16" y="14" textAnchor="middle" className={cn("flow-load-card-value", !powerKnown && "opacity-55")}>{loadText}</text>
      </g>

      <g transform="translate(80 360)">
        <circle r="28" className={cn("flow-device-circle", "flow-generator-circle", runningKnown && running && "source-active")} />
        <text x="0" y="11" textAnchor="middle" className="flow-generator-letter">G</text>
        <text x="-35" y="5" fontSize="13" fontWeight="bold" fill="#eef4f8" textAnchor="end">
          {frequencyKnown && generatorFrequency != null ? `${fmt(generatorFrequency, 2)} Hz` : "N/D Hz"}
        </text>
      </g>

      <path d="M80 68 V110" className="flow-bus-base" />
      <path d="M80 140 V200" className="flow-bus-base" />
      <path d="M80 200 V260" className="flow-bus-base" />
      <path d="M80 290 V332" className="flow-bus-base" />
      <path d="M80 200 H142" className="flow-bus-base" />
      <path d="M80 150 H42 M80 250 H42" className="flow-bus-base" />

      <FlowWire d="M80 68 V110" live={mainsKnown} />
      <FlowWire d="M80 140 V200" live={mainsPost} />
      <FlowWire d="M80 200 V260" live={genPost} reverse />
      <FlowWire d="M80 290 V332" live={genPost} reverse />
      <FlowWire d="M80 200 H142" live={loadLive} />
      <FlowWire d="M80 150 H42" live={mainsPost} />
      <FlowWire d="M80 250 H42" live={genPost} />

      <circle cx="80" cy="110" r="4" className="flow-switch-node" />
      <circle cx="80" cy="140" r="4" className="flow-switch-node" />
      {mcbKnown ? <line x1="80" y1="110" x2={mcb ? "80" : "100"} y2={mcb ? "140" : "130"} className="flow-switch-blade" /> : null}
      <circle cx="80" cy="260" r="4" className="flow-switch-node" />
      <circle cx="80" cy="290" r="4" className="flow-switch-node" />
      {gcbKnown ? <line x1="80" y1="290" x2={gcb ? "80" : "100"} y2={gcb ? "260" : "270"} className="flow-switch-blade" /> : null}
      <circle cx="80" cy="200" r="5" className={cn("flow-junction", !loadLive && "opacity-35")} />
    </svg>
  );
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const rpmKnown = hasMetric(gen, "rpm");
  const frequencyKnown = hasMetric(gen, "frequency") && gen.frequency != null;
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const powerKnown = hasMetric(gen, "power_kw");
  const batteryKnown = hasMetric(gen, "battery_voltage") && gen.battery != null;
  const oilKnown = hasMetric(gen, "oil_pressure");
  const tempKnown = hasMetric(gen, "coolant_temperature");
  const fuelKnown = hasMetric(gen, "fuel_level");
  const alternatorKnown = hasMetric(gen, "alternator_voltage");
  const maintenanceKnown = hasMetric(gen, "maintenance_hours");
  const runHoursKnown = hasMetric(gen, "run_hours");
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const alarmCountKnown = hasMetric(gen, "alarm_count");
  const mainsKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"].some((key) => hasMetric(gen, key));
  const runningKnown = rpmKnown;
  const running = rpmKnown ? gen.rpm > 300 : false;

  const ig200Homologated = gen.controller.trim().toLowerCase() === "inteligen 200" && gen.rapidDeviceNum === 200;
  const canOperate = can("operate") && ig200Homologated && gen.status !== "nao_configurado";

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    if (!canOperate || commandBusy || !confirmCmd(label)) return;
    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setCommandMessage(result.reason || `${label} aceito pelo caminho homologado.`);
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : `Falha no comando ${label}.`);
    } finally {
      setCommandBusy(null);
    }
  };

  const loadText = powerKnown ? read(gen, "power_kw", gen.load, "kW", 0) : "N/D";

  return (
    <article className="comap-panel">
      <header className="comap-header">
        <span className={cn("comap-logo", gen.status === "online" || gen.status === "alerta" ? "online" : "offline")}>G</span>
        <h3 className="comap-name">{displayName(gen.tag)}</h3>
        <span className="comap-alarm" title={alarmCountKnown ? "Contagem de alarmes do Controller Pack" : "Contagem de alarmes não homologada"}>
          <svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 8.5v5.8m0 2.7h.01" /></svg>
          <span className="comap-alarm-count">{alarmCountKnown ? gen.alarms : gen.status === "alerta" ? "!" : "—"}</span>
        </span>
        <Link to="/p/geradores/$id" params={{ id: gen.id }} aria-label="Abrir detalhes do gerador" className="grid size-5 place-items-center">
          <IconHouse size={14} />
        </Link>
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-5" />
      </header>

      <section className="comap-block comap-flow">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="comap-title">Power Flow</h2>
          <span className={cn("comap-mode", !modeKnown && "text-muted-foreground")}>MODE: {modeKnown ? gen.mode : "N/D"}</span>
        </div>

        <div className="comap-sld">
          <div className="comap-sld-stage">
            <button type="button" disabled title="Paralelismo não homologado" className="comap-prll cursor-not-allowed opacity-45" style={{ position: "absolute", left: 0, top: "1%", zIndex: 20 }}>
              PRLL<br />—
            </button>

            <div className="absolute left-[2%] top-[26%] z-[2] flex flex-col items-center gap-1">
              <span className="flow-breaker-name">MCB</span>
              <div className="flex flex-col gap-1">
                <IoBtn label="I" tone="close" active={gen.mcb} known={mcbKnown} ariaLabel="Estado fechado MCB" />
                <IoBtn label="O" tone="open" active={!gen.mcb} known={mcbKnown} ariaLabel="Estado aberto MCB" />
              </div>
            </div>

            <div className="absolute left-[2%] top-[52%] z-[2] flex flex-col items-center gap-1">
              <span className="flow-breaker-name">GCB</span>
              <div className="flex flex-col gap-1">
                <IoBtn label="I" tone="close" active={gen.gcb} known={gcbKnown} ariaLabel="Estado fechado GCB" />
                <IoBtn label="O" tone="open" active={!gen.gcb} known={gcbKnown} ariaLabel="Estado aberto GCB" />
              </div>
            </div>

            <PowerFlowSld
              mcb={gen.mcb}
              gcb={gen.gcb}
              mcbKnown={mcbKnown}
              gcbKnown={gcbKnown}
              running={running}
              runningKnown={runningKnown}
              mainsKnown={mainsKnown}
              generatorFrequency={gen.frequency}
              frequencyKnown={frequencyKnown}
              loadText={loadText}
              powerKnown={powerKnown}
            />

            <div className="absolute bottom-[3%] right-[1%] z-10 flex flex-col gap-2">
              <button type="button" className="comap-start" disabled={!canOperate || commandBusy !== null} onClick={() => void runCommand("start")} aria-label="Partir gerador">
                {commandBusy === "start" ? "..." : "START"}
              </button>
              <button type="button" className="comap-stop" disabled={!canOperate || commandBusy !== null} onClick={() => void runCommand("stop")} aria-label="Parar gerador">
                {commandBusy === "stop" ? "..." : "STOP"}
              </button>
            </div>
          </div>
        </div>
        {(!mcbKnown || !gcbKnown) && <p className="px-2 pb-1 text-[9px] leading-snug text-muted-foreground">Fluxo energizado só aparece com estados MCB/GCB homologados.</p>}
        {commandMessage && <p className="px-2 pb-1 text-[9px] text-muted-foreground">{commandMessage}</p>}
      </section>

      <section className="comap-block shrink-0 px-2 py-1.5">
        <h2 className="comap-title mb-1">Engine Status</h2>
        <EngineRow icon={<IconOilCan />} label="Oil Pressure" value={read(gen, "oil_pressure", gen.oilPressure, "bar", 1)} known={oilKnown} pct={oilKnown ? (gen.oilPressure / 10) * 100 : undefined} kind="oil" />
        <EngineRow icon={<IconThermometer />} label="Coolant Temp." value={read(gen, "coolant_temperature", gen.coolantTemp, "°C", 0)} known={tempKnown} pct={tempKnown ? (gen.coolantTemp / 120) * 100 : undefined} kind="temp" />
        <EngineRow icon={<IconFuelPump />} label="Fuel Level" value={read(gen, "fuel_level", gen.fuelLevel, "%", 0)} known={fuelKnown} pct={fuelKnown ? gen.fuelLevel : undefined} kind="fuel" />
        <EngineRow icon={<IconBattery />} label="Battery Voltage" value={read(gen, "battery_voltage", gen.battery, "V", 1)} known={batteryKnown} pct={batteryKnown ? ((gen.battery ?? 0) / 16) * 100 : undefined} />
        <EngineRow icon={<IconBolt />} label="Alternator Volt." value={read(gen, "alternator_voltage", gen.alternatorVoltage, "V", 0)} known={alternatorKnown} pct={alternatorKnown ? (gen.alternatorVoltage / 460) * 100 : undefined} />
        <EngineRow icon={<IconClock />} label="Maintenance" value={read(gen, "maintenance_hours", gen.maintenance, "h", 0)} known={maintenanceKnown} pct={maintenanceKnown ? (gen.maintenance / 250) * 100 : undefined} kind="maint" />
        <EngineRow icon={<IconRunHours />} label="Run Hours" value={read(gen, "run_hours", gen.runHours, "h", 1)} known={runHoursKnown} bar={false} />
      </section>

      <section className="comap-block comap-rpm-block shrink-0 px-1 pt-1">
        <h2 className="comap-title px-1">RPM</h2>
        <div className="comap-rpm-wrap">
          {rpmKnown ? <RpmGauge value={gen.rpm} /> : <div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">N/D</div>}
        </div>
      </section>

      <section className="comap-block mb-1.5 shrink-0 px-2 py-1.5">
        <h2 className="comap-title">Mains / Generator</h2>
        <div className="comap-table-head"><span /><span>Mains</span><span>Generator</span></div>
        {([
          ["L1-N Voltage", "mains_voltage_l1", gen.mains.l1, "voltage_l1", gen.gen.l1],
          ["L2-N Voltage", "mains_voltage_l2", gen.mains.l2, "voltage_l2", gen.gen.l2],
          ["L3-N Voltage", "mains_voltage_l3", gen.mains.l3, "voltage_l3", gen.gen.l3],
          ["L1-L2 Voltage", "mains_voltage_l1_l2", gen.mains.l12, "voltage_l1_l2", gen.gen.l12],
        ] as const).map(([label, mainsKey, mainsValue, genKey, genValue]) => (
          <div key={label} className="comap-table-row">
            <span className="label">{label}</span>
            <span className="mains">{read(gen, mainsKey, mainsValue, "V", 0)}</span>
            <span className="gen">{read(gen, genKey, genValue, "V", 0)}</span>
          </div>
        ))}
      </section>
    </article>
  );
}
