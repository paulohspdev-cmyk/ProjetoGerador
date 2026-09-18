import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-25 0 20M-9 20 0-25 9 20M-15-9H15M-18 4H18M-21 15H21" />
      <path d="m-13-9 13 11 13-11M-15 4 0 15 15 4" />
    </g>
  );
}

function BreakerPanel({
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
  const stateText = !known ? "—" : closed ? "ON" : "OFF";
  const stateGlyph = !known ? "—" : closed ? "I" : "O";

  return (
    <g className={cn("vref-breaker-panel", stateClass)} transform={`translate(${x} ${y})`}>
      <text x="0" y="-20" textAnchor="middle" className="label">
        {label}
      </text>
      <rect x="-39" y="-15" width="78" height="32" rx="5" className="panel" />
      <rect x="-34" y="-11" width="29" height="24" rx="4" className="state-box" />
      <text x="-19.5" y="6" textAnchor="middle" className="state-glyph">
        {stateGlyph}
      </text>
      <text x="17" y="6" textAnchor="middle" className="state-text">
        {stateText}
      </text>
    </g>
  );
}

function HorizontalBreaker({
  x1,
  x2,
  y,
  closed,
  known,
}: {
  x1: number;
  x2: number;
  y: number;
  closed: boolean;
  known: boolean;
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const bladeEndX = closed ? x2 - 4 : x2 - 10;
  const bladeEndY = closed ? y : y - 18;

  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x1} cy={y} r="4.5" />
      <circle cx={x2} cy={y} r="4.5" />
      <line x1={x1 + 4} y1={y} x2={bladeEndX} y2={bladeEndY} />
    </g>
  );
}

function VerticalBreaker({
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
  const bladeEndX = closed ? x : x + 18;
  const bladeEndY = closed ? y2 + 4 : y2 + 10;

  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x} cy={y1} r="4.5" />
      <circle cx={x} cy={y2} r="4.5" />
      <line x1={x} y1={y1 - 4} x2={bladeEndX} y2={bladeEndY} />
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
}: {
  mainsPresent: boolean;
  mainsKnown: boolean;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  running: boolean;
}) {
  const mainsToBus = mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = running && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;

  return (
    <section className="vref-section vref-flow vref-flow-vertical">
      <h4>POWER FLOW</h4>

      <svg viewBox="0 0 300 330" aria-label="Power flow vertical">
        {/* LOAD / BUS TOP */}
        <g transform="translate(150 28)">
          <rect x="-50" y="-19" width="100" height="38" rx="7" className="vref-load-card" />
          <g transform="translate(-22 0)" className="vref-flow-icon">
            <path d="M-11 11h22M-8 11V1l5 2V-8l6 2v17M3 1l6 2v8" />
            <path d="M-5 6v0M0-2v0M0 5v0M6 7v0" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <text x="16" y="5" className="vref-load-title">
            LOAD
          </text>
        </g>

        <path d="M150 47 V94" className="vref-wire" />
        <path d="M150 47 V94" className={cn("vref-wire-live", busLive && "is-live")} />
        <circle cx="150" cy="94" r="5.5" className={cn("vref-junction", busLive && "is-live")} />

        {/* MAINS SIDE BRANCH */}
        <circle
          cx="28"
          cy="78"
          r="5"
          className={cn(
            "vref-status-dot",
            !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
          )}
        />
        <text x="39" y="82" className="vref-flow-label">
          MAINS
        </text>

        <g transform="translate(47 125)">
          <circle
            r="31"
            className={cn(
              "vref-device",
              !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
            )}
          />
          <TowerIcon />
          {mainsKnown && !mainsPresent && (
            <g transform="translate(24 24)">
              <circle r="10" className="vref-source-x-bg" />
              <path d="M-4-4 4 4M4-4-4 4" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M78 125 H101" className="vref-wire" />
        <path d="M129 125 H150 V94" className="vref-wire" />
        <path
          d="M78 125 H101"
          className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
        />
        <path d="M129 125 H150 V94" className={cn("vref-wire-live", mainsToBus && "is-live")} />

        <HorizontalBreaker x1={101} x2={129} y={125} closed={mcb} known={mcbKnown} />
        <BreakerPanel x={115} y={168} label="MCB" closed={mcb} known={mcbKnown} />

        {/* GENERATOR VERTICAL FEED */}
        <path d="M150 94 V192" className="vref-wire" />
        <path d="M150 94 V192" className={cn("vref-wire-live", genToBus && "is-live")} />

        <VerticalBreaker x={150} y1={224} y2={192} closed={gcb} known={gcbKnown} />
        <BreakerPanel x={220} y={211} label="GCB" closed={gcb} known={gcbKnown} />

        <path d="M150 224 V258" className="vref-wire" />
        <path d="M150 224 V258" className={cn("vref-wire-live", running && "is-live")} />

        <circle
          cx="216"
          cy="267"
          r="5"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />
        <text x="227" y="271" className="vref-flow-label">
          GENERATOR
        </text>

        <g transform="translate(150 292)">
          <circle
            r="31"
            className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
          />
          <text x="0" y="10" textAnchor="middle" className="vref-generator-letter">
            G
          </text>
        </g>
      </svg>
    </section>
  );
}
