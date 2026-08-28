import { useEffect, useRef, useState, type ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import type { Generator } from "@/data/generators";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import "./comap-panel.css";

export function fmt(n: number, digits = 1) {
  return n.toFixed(digits).replace(".", ",");
}

function displayName(tag: string) {
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
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
  onClick,
  ariaLabel,
}: {
  label: "I" | "O";
  active: boolean;
  tone: "close" | "open";
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "flow-breaker-btn",
        active && tone === "close" && "active-on",
        active && tone === "open" && "active-off",
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct: number;
  bar?: boolean;
  kind?: string;
}) {
  const fill = Math.min(100, Math.max(0, pct));
  return (
    <div className={cn("comap-engine", kind === "maint" && "maint")}>
      {icon}
      <span className="engine-label">{label}</span>
      {bar ? (
        <span className="comap-meter">
          <i style={{ width: `${fill}%`, background: meterColor(kind, fill) }} />
        </span>
      ) : (
        <span />
      )}
      <span className="engine-value">{value}</span>
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
        <animateMotion
          dur="0.65s"
          repeatCount="indefinite"
          path={d}
          keyPoints={reverse ? "1;0" : "0;1"}
          keyTimes="0;1"
          calcMode="linear"
        />
      </circle>
      <circle r="2.2" fill="#43ef00" opacity="0.9">
        <animateMotion
          dur="0.65s"
          begin="0.32s"
          repeatCount="indefinite"
          path={d}
          keyPoints={reverse ? "1;0" : "0;1"}
          keyTimes="0;1"
          calcMode="linear"
        />
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
}: {
  mcb: boolean;
  gcb: boolean;
  running: boolean;
  mainsOk: boolean;
  gridHz: number;
  genHz: number;
  loadKw: number;
}) {
  const mainsPre = mainsOk;
  const mainsPost = mainsOk && mcb;
  const genPre = running && gcb;
  const genPost = running && gcb;
  const loadLive = (mainsOk && mcb) || (running && gcb);

  return (
    <svg viewBox="0 0 230 400" className="flow-diagram" preserveAspectRatio="xMidYMid meet" aria-label="Fluxo de energia">
      <g transform="translate(80 40)">
        <circle r="28" className={cn("flow-device-circle", mainsOk && "source-active")} />
        <g className="flow-device-icon tower-icon">
          <path d="M0-20 0 18M-8 18 0-20 8 18M-12-8H12M-15 2H15M-18 12H18" />
          <path d="m-11-8 11 10 11-10M-14 2 0 12 14 2" />
        </g>
        <text x="35" y="5" fontSize="15" fontWeight="bold" fill="#eef4f8" textAnchor="start">
          {fmt(gridHz)} Hz
        </text>
      </g>

      <g transform="translate(178 200)">
        <rect x="-46" y="-32" width="90" height="64" rx="6" className="flow-load-card" />
        <g transform="translate(-22 0)" className="flow-device-icon">
          <path d="M-16 10 h32" strokeWidth="1.6" />
          <path d="M-12 10 V-2 l 7 2 V-12 l 8 2 V10 M 3 -1 l 7 2 V10" strokeWidth="1.6" fill="none" />
          <path
            d="M-8.5 3 v0 M-8.5 7 v0 M -1 -4 v0 M -1 2 v0 M -1 8 v0 M 6.5 4 v0 M 6.5 8 v0"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
        <text x="16" y="-7" textAnchor="middle" className="flow-load-card-title">
          LOAD
        </text>
        <text x="16" y="14" textAnchor="middle" className="flow-load-card-value">
          {fmt(loadKw, 0)} kW
        </text>
      </g>

      <g transform="translate(80 360)">
        <circle r="28" className={cn("flow-device-circle", "flow-generator-circle", running && "source-active")} />
        <text x="0" y="11" textAnchor="middle" className="flow-generator-letter">
          G
        </text>
        <text x="-35" y="5" fontSize="15" fontWeight="bold" fill="#eef4f8" textAnchor="end">
          {fmt(genHz)} Hz
        </text>
      </g>

      <path d="M80 68 V110" className="flow-bus-base" />
      <path d="M80 140 V200" className="flow-bus-base" />
      <path d="M80 200 V260" className="flow-bus-base" />
      <path d="M80 290 V332" className="flow-bus-base" />
      <path d="M80 200 H142" className="flow-bus-base" />
      <path d="M80 150 H42 M80 250 H42" className="flow-bus-base" />

      <FlowWire d="M80 68 V110" live={mainsPre} />
      <FlowWire d="M80 140 V200" live={mainsPost} />
      <FlowWire d="M80 200 V260" live={genPre} reverse />
      <FlowWire d="M80 290 V332" live={genPost} reverse />
      <FlowWire d="M80 200 H142" live={loadLive} />
      <FlowWire d="M80 150 H42" live={mainsPost} />
      <FlowWire d="M80 250 H42" live={genPost} />

      <circle cx="80" cy="110" r="4" className="flow-switch-node" />
      <circle cx="80" cy="140" r="4" className="flow-switch-node" />
      <line x1="80" y1="110" x2={mcb ? "80" : "100"} y2={mcb ? "140" : "130"} className="flow-switch-blade" />
      <circle cx="80" cy="260" r="4" className="flow-switch-node" />
      <circle cx="80" cy="290" r="4" className="flow-switch-node" />
      <line x1="80" y1="290" x2={gcb ? "80" : "100"} y2={gcb ? "260" : "270"} className="flow-switch-blade" />
      <circle cx="80" cy="200" r="5" className="flow-junction" />
      <circle cx="80" cy="150" r="5" className="flow-junction" />
      <circle cx="80" cy="250" r="5" className="flow-junction" />
    </svg>
  );
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const operate = can("operate");
  const confirmCmd = useCommandGuard();
  const [mcb, setMcb] = useState(gen.mcb);
  const [gcb, setGcb] = useState(gen.gcb);
  const [running, setRunning] = useState(gen.status === "online");
  const [parallel, setParallel] = useState(false);
  const seq = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (seq.current) window.clearTimeout(seq.current);
    };
  }, []);

  const start = () => {
    setRunning(true);
    if (seq.current) window.clearTimeout(seq.current);
    seq.current = window.setTimeout(() => setGcb(true), 420);
  };

  const stop = () => {
    setGcb(false);
    if (seq.current) window.clearTimeout(seq.current);
    seq.current = window.setTimeout(() => {
      setRunning(false);
      setMcb(true);
    }, 380);
  };

  const closeMcb = () => {
    if (!parallel && gcb) return;
    setMcb(true);
  };
  const closeGcb = () => {
    if (!parallel && mcb) return;
    setGcb(true);
  };

  const mainsOk = mcb;
  const gridHz = mainsOk ? 60 : 0;
  const genHz = running ? (gen.frequency ?? 0) : 0;
  const loadKw = mcb || gcb ? (running && gcb ? gen.load : mcb ? Math.max(80, Math.round(gen.load * 0.45)) : 0) : 0;
  const rpm = running ? gen.rpm : 0;
  const oil = running ? gen.oilPressure : 0;
  const temp = running ? gen.coolantTemp : 0;
  const fuel = gen.status === "nao_configurado" ? 0 : gen.fuelLevel;
  const batt = gen.status === "nao_configurado" ? 0 : (gen.battery ?? 0);
  const alt = running ? gen.alternatorVoltage : 0;
  const mains = mcb ? { l1: 220, l2: 219, l3: 221, l12: 380 } : { l1: 0, l2: 0, l3: 0, l12: 0 };
  const genV = running ? gen.gen : { l1: 0, l2: 0, l3: 0, l12: 0 };

  return (
    <article className="comap-panel">
      <header className="comap-header">
        <span className={cn("comap-logo", running ? "online" : "offline")}>G</span>
        <h3 className="comap-name">{displayName(gen.tag)}</h3>
        <span className="comap-alarm">
          <svg viewBox="0 0 24 24">
            <path d="M12 3 2.8 20h18.4L12 3Z" />
            <path d="M12 8.5v5.8m0 2.7h.01" />
          </svg>
          <span className="comap-alarm-count">{gen.alarms}</span>
        </span>
        <Link
          to="/p/geradores/$id"
          params={{ id: gen.id }}
          aria-label="Abrir detalhes do gerador"
          className="grid size-5 place-items-center"
        >
          <IconHouse size={14} />
        </Link>
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-5" />
      </header>

      <section className="comap-block comap-flow">
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="comap-title">Power Flow</h2>
          <span className="comap-mode">MODE: {running ? gen.mode : "OFF"}</span>
        </div>

        <div className="comap-sld">
          <div className="comap-sld-stage">
          <button
            type="button"
            className={cn("comap-prll", parallel && "parallel-on")}
            style={{ position: "absolute", left: 0, top: "1%", zIndex: 20 }}
            onClick={() => operate && setParallel((v) => !v)}
          >
            PRLL
            <br />
            {parallel ? "ON" : "OFF"}
          </button>

          <div className="absolute left-[2%] top-[26%] z-[2] flex flex-col items-center gap-1">
            <span className="flow-breaker-name">MCB</span>
            <div className="flex flex-col gap-1">
              <IoBtn label="I" tone="close" active={mcb} ariaLabel="Fechar MCB" onClick={() => operate && closeMcb()} />
              <IoBtn label="O" tone="open" active={!mcb} ariaLabel="Abrir MCB" onClick={() => operate && setMcb(false)} />
            </div>
          </div>

          <div className="absolute left-[2%] top-[52%] z-[2] flex flex-col items-center gap-1">
            <span className="flow-breaker-name">GCB</span>
            <div className="flex flex-col items-center gap-1">
              <IoBtn label="I" tone="close" active={gcb} ariaLabel="Fechar GCB" onClick={() => operate && closeGcb()} />
              <IoBtn label="O" tone="open" active={!gcb} ariaLabel="Abrir GCB" onClick={() => operate && setGcb(false)} />
            </div>
          </div>

          <PowerFlowSld mcb={mcb} gcb={gcb} running={running} mainsOk={mainsOk} gridHz={gridHz} genHz={genHz} loadKw={loadKw} />

          <div className="absolute bottom-[3%] right-[1%] z-10 flex flex-col gap-2">
            <button type="button" className="comap-start" disabled={!operate} onClick={() => operate && confirmCmd("START") && start()} aria-label="Partir gerador">
              START
            </button>
            <button type="button" className="comap-stop" disabled={!operate} onClick={() => operate && confirmCmd("STOP") && stop()} aria-label="Parar gerador">
              STOP
            </button>
          </div>
          </div>
        </div>
      </section>

      <section className="comap-block shrink-0 px-2 py-1.5">
        <h2 className="comap-title mb-1">Engine Status</h2>
        <EngineRow icon={<IconOilCan />} label="Oil Pressure" value={`${fmt(oil)} bar`} pct={oil * 20} kind="oil" />
        <EngineRow icon={<IconThermometer />} label="Coolant Temp." value={`${fmt(temp, 0)} °C`} pct={(temp / 120) * 100} kind="temp" />
        <EngineRow icon={<IconFuelPump />} label="Fuel Level" value={`${fmt(fuel, 0)} %`} pct={fuel} kind="fuel" />
        <EngineRow icon={<IconBattery />} label="Battery Voltage" value={`${fmt(batt)} V`} pct={(batt / 16) * 100} />
        <EngineRow icon={<IconBolt />} label="Alternator Volt." value={`${fmt(alt)} V`} pct={(alt / 16) * 100} />
        <EngineRow
          icon={<IconClock />}
          label="Maintenance"
          value={`${fmt(gen.maintenance, 0)} h`}
          pct={(gen.maintenance / 250) * 100}
          kind="maint"
        />
        <EngineRow icon={<IconRunHours />} label="Run Hours" value={`${fmt(gen.runHours)} h`} pct={0} bar={false} />
      </section>

      <section className="comap-block comap-rpm-block shrink-0 px-1 pt-1">
        <h2 className="comap-title px-1">RPM</h2>
        <div className="comap-rpm-wrap">
          <RpmGauge value={rpm} />
        </div>
      </section>

      <section className="comap-block mb-1.5 shrink-0 px-2 py-1.5">
        <h2 className="comap-title">Mains / Generator</h2>
        <div className="comap-table-head">
          <span />
          <span>Mains</span>
          <span>Generator</span>
        </div>
        {(
          [
            ["L1-N Voltage", mains.l1, genV.l1],
            ["L2-N Voltage", mains.l2, genV.l2],
            ["L3-N Voltage", mains.l3, genV.l3],
            ["L1-L2 Voltage", mains.l12, genV.l12],
          ] as const
        ).map(([label, a, b]) => (
          <div key={label} className="comap-table-row">
            <span className="label">{label}</span>
            <span className="mains">{fmt(a, 0)} V</span>
            <span className="gen">{fmt(b, 0)} V</span>
          </div>
        ))}
      </section>
    </article>
  );
}
