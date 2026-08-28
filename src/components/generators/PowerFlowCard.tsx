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

function metricNumber(gen: Generator, key: string, value: number | null | undefined) {
  return hasMetric(gen, key) && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function metricText(gen: Generator, key: string, value: number | null | undefined, unit: string, digits = 1) {
  const n = metricNumber(gen, key, value);
  return n == null ? "N/D" : `${fmt(n, digits)} ${unit}`;
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
  if (pct < 70 || pct > 95) return "linear-gradient(90deg,#e74c3c,#c0392b)";
  return "linear-gradient(90deg,#2ecc71,#27ae60)";
}

export function IoBtn({
  label,
  active,
  tone,
  ariaLabel,
  disabled = true,
}: {
  label: "I" | "O";
  active: boolean;
  tone: "close" | "open";
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Comando não homologado" : undefined}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "flow-breaker-btn",
        active && tone === "close" && "active-on",
        active && tone === "open" && "active-off",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {label}
    </button>
  );
}

export function EngineRow({
  icon,
  label,
  value,
  pct,
  bar = true,
  kind = "ok",
  known = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct: number;
  bar?: boolean;
  kind?: string;
  known?: boolean;
}) {
  const fill = known ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className={cn("comap-engine", kind === "maint" && "maint", !known && "opacity-65")}>
      {icon}
      <span className="engine-label">{label}</span>
      {bar ? (
        <span className="comap-meter">
          <i style={{ width: `${fill}%`, background: known ? meterColor(kind, fill) : "transparent" }} />
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
      <circle r="2.2" fill="#43ef00" opacity="0.9">
        <animateMotion dur="0.65s" begin="0.32s" repeatCount="indefinite" path={d} keyPoints={reverse ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
      </circle>
    </g>
  );
}

export function PowerFlowSld({
  mcb,
  gcb,
  running,
  mainsOk,
  gridHz,
  genHz,
  loadKw,
  mcbKnown = true,
  gcbKnown = true,
  runningKnown = true,
  mainsKnown = true,
  gridHzKnown = true,
  genHzKnown = true,
  loadKnown = true,
}: {
  mcb: boolean;
  gcb: boolean;
  running: boolean;
  mainsOk: boolean;
  gridHz: number;
  genHz: number;
  loadKw: number;
  mcbKnown?: boolean;
  gcbKnown?: boolean;
  runningKnown?: boolean;
  mainsKnown?: boolean;
  gridHzKnown?: boolean;
  genHzKnown?: boolean;
  loadKnown?: boolean;
}) {
  const mainsPre = mainsKnown && mainsOk;
  const mainsPost = mainsPre && mcbKnown && mcb;

  // Geração conhecida antes do GCB: RPM em marcha + frequência real disponível.
  const genPre = runningKnown && running && genHzKnown && genHz > 1;
  // O fluxo só atravessa o GCB quando seu estado real estiver disponível e fechado.
  const genPost = genPre && gcbKnown && gcb;
  // A carga só recebe animação quando existe potência real medida.
  const loadLive = loadKnown && Math.abs(loadKw) > 0.1 && (mainsPost || genPost);

  return (
    <svg viewBox="0 0 230 400" className="flow-diagram" preserveAspectRatio="xMidYMid meet" aria-label="Fluxo de energia">
      <g transform="translate(80 40)">
        <circle r="28" className={cn("flow-device-circle", mainsPre && "source-active")} />
        <g className="flow-device-icon tower-icon">
          <path d="M0-20 0 18M-8 18 0-20 8 18M-12-8H12M-15 2H15M-18 12H18" />
          <path d="m-11-8 11 10 11-10M-14 2 0 12 14 2" />
        </g>
        <text x="35" y="5" fontSize="15" fontWeight="bold" fill="#eef4f8" textAnchor="start">
          {gridHzKnown ? `${fmt(gridHz)} Hz` : "N/D"}
        </text>
      </g>

      <g transform="translate(178 200)">
        <rect x="-46" y="-32" width="90" height="64" rx="6" className="flow-load-card" />
        <g transform="translate(-22 0)" className="flow-device-icon">
          <path d="M-16 10 h32" strokeWidth="1.6" />
          <path d="M-12 10 V-2 l 7 2 V-12 l 8 2 V10 M 3 -1 l 7 2 V10" strokeWidth="1.6" fill="none" />
          <path d="M-8.5 3 v0 M-8.5 7 v0 M -1 -4 v0 M -1 2 v0 M -1 8 v0 M 6.5 4 v0 M 6.5 8 v0" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <text x="16" y="-7" textAnchor="middle" className="flow-load-card-title">LOAD</text>
        <text x="16" y="14" textAnchor="middle" className="flow-load-card-value">{loadKnown ? `${fmt(loadKw, 0)} kW` : "N/D"}</text>
      </g>

      <g transform="translate(80 360)">
        <circle r="28" className={cn("flow-device-circle", "flow-generator-circle", runningKnown && running && "source-active")} />
        <text x="0" y="11" textAnchor="middle" className="flow-generator-letter">G</text>
        <text x="-35" y="5" fontSize="15" fontWeight="bold" fill="#eef4f8" textAnchor="end">{genHzKnown ? `${fmt(genHz)} Hz` : "N/D"}</text>
      </g>

      <path d="M80 68 V110" className="flow-bus-base" />
      <path d="M80 140 V200" className="flow-bus-base" />
      <path d="M80 200 V260" className="flow-bus-base" />
      <path d="M80 290 V332" className="flow-bus-base" />
      <path d="M80 200 H142" className="flow-bus-base" />
      <path d="M80 150 H42 M80 250 H42" className="flow-bus-base" />

      <FlowWire d="M80 68 V110" live={mainsPre} />
      <FlowWire d="M80 140 V200" live={mainsPost} />
      <FlowWire d="M80 200 V260" live={genPost} reverse />
      <FlowWire d="M80 290 V332" live={genPre} reverse />
      <FlowWire d="M80 200 H142" live={loadLive} />
      <FlowWire d="M80 150 H42" live={mainsPost} />
      <FlowWire d="M80 250 H42" live={genPost} />

      {mcbKnown && <>
        <circle cx="80" cy="110" r="4" className="flow-switch-node" />
        <circle cx="80" cy="140" r="4" className="flow-switch-node" />
        <line x1="80" y1="110" x2={mcb ? "80" : "100"} y2={mcb ? "140" : "130"} className="flow-switch-blade" />
      </>}
      {gcbKnown && <>
        <circle cx="80" cy="260" r="4" className="flow-switch-node" />
        <circle cx="80" cy="290" r="4" className="flow-switch-node" />
        <line x1="80" y1="290" x2={gcb ? "80" : "100"} y2={gcb ? "260" : "270"} className="flow-switch-blade" />
      </>}
      <circle cx="80" cy="200" r="5" className="flow-junction" />
      <circle cx="80" cy="150" r="5" className="flow-junction" />
      <circle cx="80" cy="250" r="5" className="flow-junction" />
    </svg>
  );
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const temp = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const batt = metricNumber(gen, "battery_voltage", gen.battery);
  const alt = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const load = metricNumber(gen, "power_kw", gen.load);

  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const alarmCountKnown = hasMetric(gen, "alarm_count");
  const runningKnown = rpm != null;
  const running = runningKnown && rpm > 300;

  const mainsKeys = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"];
  const genKeys = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"];
  const mainsKnown = mainsKeys.some((key) => hasMetric(gen, key));
  const genVoltageKnown = genKeys.some((key) => hasMetric(gen, key));
  const mainsOk = mainsKnown && Math.max(
    metricNumber(gen, "mains_voltage_l1", gen.mains.l1) ?? 0,
    metricNumber(gen, "mains_voltage_l2", gen.mains.l2) ?? 0,
    metricNumber(gen, "mains_voltage_l3", gen.mains.l3) ?? 0,
    metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12) ?? 0,
  ) > 50;

  const ig200Homologated =
    gen.controller.trim().toLowerCase() === "inteligen 200" && Number(gen.rapidDeviceNum) > 0;
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

  const tableRows = [
    ["L1-N Voltage", "mains_voltage_l1", gen.mains.l1, "voltage_l1", gen.gen.l1],
    ["L2-N Voltage", "mains_voltage_l2", gen.mains.l2, "voltage_l2", gen.gen.l2],
    ["L3-N Voltage", "mains_voltage_l3", gen.mains.l3, "voltage_l3", gen.gen.l3],
    ["L1-L2 Voltage", "mains_voltage_l1_l2", gen.mains.l12, "voltage_l1_l2", gen.gen.l12],
  ] as const;

  return (
    <article className="comap-panel">
      <header className="comap-header">
        <span className={cn("comap-logo", gen.status === "online" || gen.status === "alerta" ? "online" : "offline")}>G</span>
        <h3 className="comap-name">{displayName(gen.tag)}</h3>
        <span className="comap-alarm" title={alarmCountKnown ? "Contagem de alarmes" : "Canal de alarmes não homologado"}>
          <svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 8.5v5.8m0 2.7h.01" /></svg>
          <span className="comap-alarm-count">{alarmCountKnown ? gen.alarms : gen.status === "alerta" ? "!" : "—"}</span>
        </span>
        <Link to="/p/geradores/$id" params={{ id: gen.id }} aria-label="Abrir detalhes do gerador" className="grid size-5 place-items-center">
          <IconHouse size={14} />
        </Link>
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-5" />
      </header>

      <section className="comap-block comap-flow">
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="comap-title">Power Flow</h2>
          <span className="comap-mode">MODE: {modeKnown ? gen.mode : "N/D"}</span>
        </div>

        <div className="comap-sld">
          <div className="comap-sld-stage">
            <button type="button" disabled title="Paralelismo não homologado" className="comap-prll cursor-not-allowed opacity-60" style={{ position: "absolute", left: 0, top: "1%", zIndex: 20 }}>
              PRLL<br />N/D
            </button>

            <div className="absolute left-[2%] top-[26%] z-[2] flex flex-col items-center gap-1">
              <span className="flow-breaker-name">MCB</span>
              <div className="flex flex-col gap-1">
                <IoBtn label="I" tone="close" active={mcbKnown && gen.mcb} ariaLabel={mcbKnown ? "MCB fechado" : "Estado MCB indisponível"} />
                <IoBtn label="O" tone="open" active={mcbKnown && !gen.mcb} ariaLabel={mcbKnown ? "MCB aberto" : "Estado MCB indisponível"} />
              </div>
            </div>

            <div className="absolute left-[2%] top-[52%] z-[2] flex flex-col items-center gap-1">
              <span className="flow-breaker-name">GCB</span>
              <div className="flex flex-col items-center gap-1">
                <IoBtn label="I" tone="close" active={gcbKnown && gen.gcb} ariaLabel={gcbKnown ? "GCB fechado" : "Estado GCB indisponível"} />
                <IoBtn label="O" tone="open" active={gcbKnown && !gen.gcb} ariaLabel={gcbKnown ? "GCB aberto" : "Estado GCB indisponível"} />
              </div>
            </div>

            <PowerFlowSld
              mcb={gen.mcb}
              gcb={gen.gcb}
              running={running}
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
        {commandMessage && <p className="px-2 pb-1 text-[10px] text-muted-foreground">{commandMessage}</p>}
      </section>

      <section className="comap-block shrink-0 px-2 py-1.5">
        <h2 className="comap-title mb-1">Engine Status</h2>
        <EngineRow icon={<IconOilCan />} label="Oil Pressure" value={oil == null ? "N/D" : `${fmt(oil)} bar`} pct={(oil ?? 0) * 20} kind="oil" known={oil != null} />
        <EngineRow icon={<IconThermometer />} label="Coolant Temp." value={temp == null ? "N/D" : `${fmt(temp, 0)} °C`} pct={((temp ?? 0) / 120) * 100} kind="temp" known={temp != null} />
        <EngineRow icon={<IconFuelPump />} label="Fuel Level" value={fuel == null ? "N/D" : `${fmt(fuel, 0)} %`} pct={fuel ?? 0} kind="fuel" known={fuel != null} />
        <EngineRow icon={<IconBattery />} label="Battery Voltage" value={batt == null ? "N/D" : `${fmt(batt)} V`} pct={((batt ?? 0) / 16) * 100} known={batt != null} />
        <EngineRow icon={<IconBolt />} label="Alternator Volt." value={alt == null ? "N/D" : `${fmt(alt)} V`} pct={((alt ?? 0) / 460) * 100} known={alt != null} />
        <EngineRow icon={<IconClock />} label="Maintenance" value={maintenance == null ? "N/D" : `${fmt(maintenance, 0)} h`} pct={((maintenance ?? 0) / 250) * 100} kind="maint" known={maintenance != null} />
        <EngineRow icon={<IconRunHours />} label="Run Hours" value={runHours == null ? "N/D" : `${fmt(runHours)} h`} pct={0} bar={false} known={runHours != null} />
      </section>

      <section className="comap-block comap-rpm-block shrink-0 px-1 pt-1">
        <h2 className="comap-title px-1">RPM</h2>
        <div className="comap-rpm-wrap relative">
          <RpmGauge value={rpm ?? 0} />
          {rpm == null && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="rounded bg-background/80 px-2 py-1 text-xs font-bold text-muted-foreground">N/D</span></div>}
        </div>
      </section>

      <section className="comap-block mb-1.5 shrink-0 px-2 py-1.5">
        <h2 className="comap-title">Mains / Generator</h2>
        <div className="comap-table-head"><span /><span>Mains</span><span>Generator</span></div>
        {tableRows.map(([label, mainsKey, mainsValue, genKey, genValue]) => (
          <div key={label} className="comap-table-row">
            <span className="label">{label}</span>
            <span className="mains">{metricText(gen, mainsKey, mainsValue, "V", 0)}</span>
            <span className="gen">{metricText(gen, genKey, genValue, "V", 0)}</span>
          </div>
        ))}
        {!mainsKnown && !genVoltageKnown && <p className="py-1 text-[9px] text-muted-foreground">Canais de tensão não homologados neste pack.</p>}
      </section>
    </article>
  );
}
