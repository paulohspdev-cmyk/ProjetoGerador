import { Play, Square } from "lucide-react";

import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-19 0 16M-7 16 0-19 7 16M-12-7H12M-14 3H14M-17 12H17" />
      <path d="m-11-7 11 9 11-9M-13 3 0 12 13 3" />
    </g>
  );
}

function VerticalContact({
  x,
  y1,
  y2,
  closed,
  known,
}: {
  x: number;
  y1: number;
  y2: number;
  closed: boolean;
  known: boolean;
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x} cy={y1} r="3.8" />
      <circle cx={x} cy={y2} r="3.8" />
      <line x1={x} y1={y1 + 4} x2={closed ? x : x + 14} y2={closed ? y2 - 4 : y2 - 9} />
    </g>
  );
}

function BreakerBadge({
  x,
  y,
  label,
  closed,
  known,
}: {
  x: number;
  y: number;
  label: string;
  closed: boolean;
  known: boolean;
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const stateText = !known ? "—" : closed ? "I" : "O";

  return (
    <g className={cn("vref-breaker-badge", stateClass)} transform={`translate(${x} ${y})`}>
      <text x="0" y="-12" textAnchor="middle" className="label">
        {label}
      </text>
      <rect x="-17" y="-8" width="34" height="24" rx="4" />
      <text x="0" y="8" textAnchor="middle" className="state">
        {stateText}
      </text>
    </g>
  );
}

function formatHz(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return (
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " Hz"
  );
}

function formatLoad(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return Math.round(value).toLocaleString("pt-BR") + " kW";
}

export function VerticalPowerFlow({
  mainsPresent,
  mainsKnown,
  mainsFrequency,
  generatorFrequency,
  loadKw,
  modeLabel,
  mcb,
  mcbKnown,
  gcb,
  gcbKnown,
  running,
  canStart,
  canStop,
  busy,
  onStart,
  onStop,
}: {
  mainsPresent: boolean;
  mainsKnown: boolean;
  mainsFrequency: number | null;
  generatorFrequency: number | null;
  loadKw: number | null;
  modeLabel: string;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  running: boolean;
  canStart: boolean;
  canStop: boolean;
  busy: "start" | "stop" | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const mainsToBus = mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = running && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;

  return (
    <section className="vref-section vref-flow vref-flow-controller">
      <div className="vref-flow-controller-heading">
        <h4>POWER FLOW</h4>
        <span>MODE: {modeLabel}</span>
      </div>

      <div className="vref-flow-controller-body">
        <svg viewBox="0 0 235 250" aria-label="Power flow vertical">
          <g transform="translate(112 31)">
            <circle
              r="22"
              className={cn(
                "vref-device",
                !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
              )}
            />
            <TowerIcon />
          </g>
          <text x="139" y="35" className="vref-flow-reading">
            {formatHz(mainsFrequency)}
          </text>

          <path d="M112 53 V73" className="vref-wire" />
          <path
            d="M112 53 V73"
            className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
          />

          <BreakerBadge x={50} y={84} label="MCB" closed={mcb} known={mcbKnown} />
          <VerticalContact x={112} y1={73} y2={94} closed={mcb} known={mcbKnown} />

          <path d="M112 94 V126" className="vref-wire" />
          <path d="M112 94 V126" className={cn("vref-wire-live", mainsToBus && "is-live")} />
          <circle cx="112" cy="126" r="4.5" className={cn("vref-junction", busLive && "is-live")} />

          <path d="M112 126 H148" className="vref-wire" />
          <path d="M112 126 H148" className={cn("vref-wire-live", busLive && "is-live")} />
          <g transform="translate(181 126)">
            <rect x="-33" y="-21" width="66" height="42" rx="5" className="vref-load-card" />
            <g transform="translate(-17 -2)" className="vref-flow-icon">
              <path d="M-8 8h16M-6 8V1l4 2V-5l5 2v11M3 1l5 2v5" />
            </g>
            <text x="13" y="-3" textAnchor="middle" className="vref-load-title">
              LOAD
            </text>
            <text x="13" y="11" textAnchor="middle" className="vref-load-value">
              {formatLoad(loadKw)}
            </text>
          </g>

          <path d="M112 126 V155" className="vref-wire" />
          <path d="M112 126 V155" className={cn("vref-wire-live", genToBus && "is-live")} />

          <BreakerBadge x={50} y={166} label="GCB" closed={gcb} known={gcbKnown} />
          <VerticalContact x={112} y1={155} y2={176} closed={gcb} known={gcbKnown} />

          <path d="M112 176 V205" className="vref-wire" />
          <path d="M112 176 V205" className={cn("vref-wire-live", running && "is-live")} />

          <text x="14" y="217" className="vref-flow-frequency">
            {formatHz(generatorFrequency)}
          </text>

          <g transform="translate(112 220)">
            <circle
              r="23"
              className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
            />
            <text x="0" y="9" textAnchor="middle" className="vref-generator-letter">
              G
            </text>
          </g>
        </svg>

        <div className="vref-flow-command-stack">
          <button
            type="button"
            className="start"
            disabled={!canStart || busy !== null}
            onClick={onStart}
          >
            <Play aria-hidden />
            {busy === "start" ? "..." : "START"}
          </button>
          <button
            type="button"
            className="stop"
            disabled={!canStop || busy !== null}
            onClick={onStop}
          >
            <Square aria-hidden />
            {busy === "stop" ? "..." : "STOP"}
          </button>
        </div>
      </div>
    </section>
  );
}
