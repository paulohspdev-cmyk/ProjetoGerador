import { cn } from "@/lib/utils";

import { fmt } from "../generator-metrics";

const MIN_FLOW_FREQUENCY_HZ = 1;
const MIN_FLOW_LOAD_KW = 0.1;

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

function FlowWire({
  d,
  live,
  reverse = false,
}: {
  d: string;
  live: boolean;
  reverse?: boolean;
}) {
  if (!live) return null;
  return (
    <g>
      <path d={d} className="flow-bus-glow" />
      <path d={d} className={cn("flow-bus-dash", reverse && "is-reverse")} />
      <circle r="3.2" fill="var(--foreground)">
        <animateMotion
          dur="0.65s"
          repeatCount="indefinite"
          path={d}
          keyPoints={reverse ? "1;0" : "0;1"}
          keyTimes="0;1"
          calcMode="linear"
        />
      </circle>
      <circle r="2.2" fill="var(--online)" opacity="0.9">
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
  const genPre = runningKnown && running && genHzKnown && genHz > MIN_FLOW_FREQUENCY_HZ;
  const genPost = genPre && gcbKnown && gcb;
  const loadLive = loadKnown && Math.abs(loadKw) > MIN_FLOW_LOAD_KW && (mainsPost || genPost);

  return (
    <svg
      viewBox="0 0 230 400"
      className="flow-diagram"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Fluxo de energia"
    >
      <g transform="translate(80 40)">
        <circle r="28" className={cn("flow-device-circle", mainsPre && "source-active")} />
        <g className="flow-device-icon tower-icon">
          <path d="M0-20 0 18M-8 18 0-20 8 18M-12-8H12M-15 2H15M-18 12H18" />
          <path d="m-11-8 11 10 11-10M-14 2 0 12 14 2" />
        </g>
        <text
          x="35"
          y="5"
          fontSize="15"
          fontWeight="bold"
          fill="var(--foreground)"
          textAnchor="start"
        >
          {gridHzKnown ? `${fmt(gridHz)} Hz` : "N/D"}
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
          {loadKnown ? `${fmt(loadKw, 0)} kW` : "N/D"}
        </text>
      </g>

      <g transform="translate(80 360)">
        <circle
          r="34"
          className={cn(
            "flow-device-circle",
            "flow-generator-circle",
            runningKnown && (running ? "generator-running" : "generator-stopped"),
          )}
        />
        <text x="0" y="12" textAnchor="middle" className="flow-generator-letter">
          G
        </text>
        <text
          x="-42"
          y="5"
          fontSize="15"
          fontWeight="bold"
          fill="var(--foreground)"
          textAnchor="end"
        >
          {genHzKnown ? `${fmt(genHz)} Hz` : "N/D"}
        </text>
      </g>

      <path d="M80 68 V110" className="flow-bus-base" />
      <path d="M80 140 V200" className="flow-bus-base" />
      <path d="M80 200 V260" className="flow-bus-base" />
      <path d="M80 290 V326" className="flow-bus-base" />
      <path d="M80 200 H142" className="flow-bus-base" />

      <FlowWire d="M80 68 V110" live={mainsPre} />
      <FlowWire d="M80 140 V200" live={mainsPost} />
      <FlowWire d="M80 200 V260" live={genPost} reverse />
      <FlowWire d="M80 290 V326" live={genPre} reverse />
      <FlowWire d="M80 200 H142" live={loadLive} />

      <circle cx="80" cy="110" r="4" className={cn("flow-switch-node", !mcbKnown && "is-unknown")} />
      <circle cx="80" cy="140" r="4" className={cn("flow-switch-node", !mcbKnown && "is-unknown")} />
      <line
        x1="80"
        y1="110"
        x2={mcbKnown && mcb ? "80" : "100"}
        y2={mcbKnown && mcb ? "140" : "130"}
        className={cn("flow-switch-blade", !mcbKnown && "is-unknown")}
      />

      <circle cx="80" cy="260" r="4" className={cn("flow-switch-node", !gcbKnown && "is-unknown")} />
      <circle cx="80" cy="290" r="4" className={cn("flow-switch-node", !gcbKnown && "is-unknown")} />
      <line
        x1="80"
        y1="290"
        x2={gcbKnown && gcb ? "80" : "100"}
        y2={gcbKnown && gcb ? "260" : "270"}
        className={cn("flow-switch-blade", !gcbKnown && "is-unknown")}
      />

      <circle cx="80" cy="200" r="5" className="flow-junction" />
    </svg>
  );
}
