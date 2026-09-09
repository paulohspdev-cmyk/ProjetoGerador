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
      title={disabled ? "Função indisponível" : undefined}
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

function FlowWire({ d, live, reverse = false }: { d: string; live: boolean; reverse?: boolean }) {
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
  showMainsSource = true,
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
  showMainsSource?: boolean;
}) {
  const mainsPre = showMainsSource && mainsKnown && mainsOk;
  const mainsPost = mainsPre && mcbKnown && mcb;
  const genPre = runningKnown && running && genHzKnown && genHz > MIN_FLOW_FREQUENCY_HZ;
  const genPost = genPre && gcbKnown && gcb;
  const loadLive = loadKnown && Math.abs(loadKw) > MIN_FLOW_LOAD_KW && (mainsPost || genPost);

  // Com rede, preservamos o eixo da torre. Sem rede, o eixo do gerador usa o
  // centro real do viewBox para que todos os cards generator-only fiquem simétricos.
  const busX = showMainsSource ? 80 : 115;
  const loadX = showMainsSource ? 178 : 184;
  const loadHalfWidth = 24;
  const loadJoinX = loadX - loadHalfWidth;

  return (
    <svg
      viewBox={showMainsSource ? "0 0 230 400" : "0 150 230 250"}
      className={cn("flow-diagram", !showMainsSource && "is-generator-only")}
      preserveAspectRatio="xMidYMid meet"
      aria-label={showMainsSource ? "Fluxo de energia com rede" : "Fluxo de energia do gerador"}
    >
      {showMainsSource && (
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
      )}

      <g transform={`translate(${loadX} 200)`}>
        <rect x="-24" y="-19" width="48" height="38" rx="5" className="flow-load-card" />
        <g transform="scale(0.9)" className="flow-device-icon">
          <path d="M-16 10 h32" strokeWidth="1.6" />
          <path
            d="M-12 10 V-2 l 7 2 V-12 l 8 2 V10 M 3 -1 l 7 2 V10"
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M-8.5 3 v0 M-8.5 7 v0 M -1 -4 v0 M -1 2 v0 M -1 8 v0 M 6.5 4 v0 M 6.5 8 v0"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g transform={`translate(${busX} 360)`}>
        <circle
          r="29"
          className={cn(
            "flow-device-circle",
            "flow-generator-circle",
            runningKnown && (running ? "generator-running" : "generator-stopped"),
          )}
        />
        <text
          x="0"
          y="1"
          textAnchor="middle"
          dominantBaseline="middle"
          className="flow-generator-letter"
        >
          G
        </text>
        <text
          x="-38"
          y="4"
          fontSize="13"
          fontWeight="bold"
          fill="var(--foreground)"
          textAnchor="end"
        >
          {genHzKnown ? `${fmt(genHz)} Hz` : "N/D"}
        </text>
      </g>

      {showMainsSource && (
        <>
          <path d={`M${busX} 68 V110`} className="flow-bus-base" />
          <path d={`M${busX} 140 V200`} className="flow-bus-base" />
          <FlowWire d={`M${busX} 68 V110`} live={mainsPre} />
          <FlowWire d={`M${busX} 140 V200`} live={mainsPost} />
          <circle
            cx={busX}
            cy="110"
            r="4"
            className={cn("flow-switch-node", !mcbKnown && "is-unknown")}
          />
          <circle
            cx={busX}
            cy="140"
            r="4"
            className={cn("flow-switch-node", !mcbKnown && "is-unknown")}
          />
          <line
            x1={busX}
            y1="110"
            x2={mcbKnown && mcb ? busX : busX + 20}
            y2={mcbKnown && mcb ? 140 : 130}
            className={cn("flow-switch-blade", !mcbKnown && "is-unknown")}
          />
        </>
      )}
      <path d={`M${busX} 200 V260`} className="flow-bus-base" />
      <path d={`M${busX} 290 V326`} className="flow-bus-base" />
      <path d={`M${busX} 200 H${loadJoinX}`} className="flow-bus-base" />

      <FlowWire d={`M${busX} 200 V260`} live={genPost} reverse />
      <FlowWire d={`M${busX} 290 V326`} live={genPre} reverse />
      <FlowWire d={`M${busX} 200 H${loadJoinX}`} live={loadLive} />

      <circle
        cx={busX}
        cy="260"
        r="4"
        className={cn("flow-switch-node", !gcbKnown && "is-unknown")}
      />
      <circle
        cx={busX}
        cy="290"
        r="4"
        className={cn("flow-switch-node", !gcbKnown && "is-unknown")}
      />
      <line
        x1={busX}
        y1="290"
        x2={gcbKnown && gcb ? busX : busX + 20}
        y2={gcbKnown && gcb ? 260 : 270}
        className={cn("flow-switch-blade", !gcbKnown && "is-unknown")}
      />

      <circle cx={busX} cy="200" r="5" className="flow-junction" />
    </svg>
  );
}
