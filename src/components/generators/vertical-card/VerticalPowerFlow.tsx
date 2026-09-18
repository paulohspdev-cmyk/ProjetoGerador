import { Play, Square } from "lucide-react";

import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-24 0 20M-9 20 0-24 9 20M-15-9H15M-18 4H18M-21 15H21" />
      <path d="m-13-9 13 11 13-11M-15 4 0 15 15 4" />
    </g>
  );
}

function BreakerContact({
  x,
  closed,
  known,
  label,
  direction,
}: {
  x: number;
  closed: boolean;
  known: boolean;
  label: string;
  direction: "ltr" | "rtl";
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const symbol = !known ? "—" : closed ? "●" : "○";
  const blade =
    direction === "ltr"
      ? {
          x1: x + 4,
          y1: 80,
          x2: closed ? x + 34 : x + 29,
          y2: closed ? 80 : 61,
        }
      : {
          x1: x + 34,
          y1: 80,
          x2: closed ? x + 4 : x + 9,
          y2: closed ? 80 : 61,
        };

  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x} cy="80" r="4" />
      <circle cx={x + 38} cy="80" r="4" />
      <line x1={blade.x1} y1={blade.y1} x2={blade.x2} y2={blade.y2} />
      <g className="vref-breaker-button" transform={`translate(${x + 19} 118)`}>
        <rect x="-24" y="-24" width="48" height="48" rx="6" />
        <text x="0" y="-4" textAnchor="middle" className="name">
          {label}
        </text>
        <text x="0" y="14" textAnchor="middle" className="state-symbol">
          {symbol}
        </text>
      </g>
    </g>
  );
}

export function VerticalPowerFlow({
  mainsPresent,
  mainsKnown,
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
    <section className="vref-section vref-flow">
      <div className="vref-flow-heading">
        <h4>POWER FLOW</h4>
      </div>

      <div className="vref-flow-body">
        <svg viewBox="0 0 640 150" aria-label="Power flow">
          <text x="36" y="18" className="vref-flow-label">
            MAINS
          </text>
          <circle
            cx="23"
            cy="14"
            r="5"
            className={cn(
              "vref-status-dot",
              !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
            )}
          />

          <text x="520" y="18" className="vref-flow-label">
            GENERATOR
          </text>
          <circle
            cx="507"
            cy="14"
            r="5"
            className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
          />

          <g transform="translate(52 80)">
            <circle
              r="34"
              className={cn(
                "vref-device",
                !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
              )}
            />
            <TowerIcon />
          </g>

          <path d="M86 80 H145" className="vref-wire" />
          <path d="M183 80 H320" className="vref-wire" />
          <path d="M320 80 H457" className="vref-wire" />
          <path d="M495 80 H554" className="vref-wire" />
          <path d="M320 80 V42" className="vref-wire" />

          <path
            d="M86 80 H145"
            className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
          />
          <path d="M183 80 H320" className={cn("vref-wire-live", mainsToBus && "is-live")} />
          <path d="M320 80 H457" className={cn("vref-wire-live", genToBus && "is-live")} />
          <path d="M495 80 H554" className={cn("vref-wire-live", running && "is-live")} />
          <path d="M320 80 V42" className={cn("vref-wire-live", busLive && "is-live")} />
          <circle cx="320" cy="80" r="5" className={cn("vref-junction", busLive && "is-live")} />

          <BreakerContact x={145} closed={mcb} known={mcbKnown} label="MCB" direction="ltr" />
          <BreakerContact x={457} closed={gcb} known={gcbKnown} label="GCB" direction="rtl" />

          <g transform="translate(320 23)">
            <rect x="-48" y="-18" width="96" height="36" rx="7" className="vref-load-card" />
            <g transform="translate(-21 0)" className="vref-flow-icon">
              <path d="M-11 11h22M-8 11V1l5 2V-8l6 2v17M3 1l6 2v8" />
              <path d="M-5 6v0M0-2v0M0 5v0M6 7v0" strokeWidth="2.4" strokeLinecap="round" />
            </g>
            <text x="14" y="5" className="vref-load-title">
              LOAD
            </text>
          </g>

          <g transform="translate(588 80)">
            <circle
              r="34"
              className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
            />
            <text x="0" y="10" textAnchor="middle" className="vref-generator-letter">
              G
            </text>
          </g>
        </svg>

        <div className="vref-flow-actions">
          <button
            type="button"
            className="start"
            disabled={!canStart || busy !== null}
            onClick={onStart}
          >
            <Play /> {busy === "start" ? "..." : "START"}
          </button>
          <button
            type="button"
            className="stop"
            disabled={!canStop || busy !== null}
            onClick={onStop}
          >
            <Square /> {busy === "stop" ? "..." : "STOP"}
          </button>
        </div>
      </div>
    </section>
  );
}
