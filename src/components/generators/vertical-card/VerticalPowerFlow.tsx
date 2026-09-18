import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-22 0 18M-8 18 0-22 8 18M-13-8H13M-16 3H16M-19 14H19" />
      <path d="m-12-8 12 10 12-10M-14 3 0 14 14 3" />
    </g>
  );
}

function BreakerState({
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
  const state = !known ? "—" : closed ? "ON" : "OFF";

  return (
    <g className={cn("vref-breaker-state", stateClass)} transform={`translate(${x} ${y})`}>
      <rect x="-31" y="-15" width="62" height="30" rx="5" />
      <text x="0" y="-2" textAnchor="middle" className="name">
        {label}
      </text>
      <text x="0" y="10" textAnchor="middle" className="state">
        {state}
      </text>
    </g>
  );
}

function HorizontalContact({
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
  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x1} cy={y} r="4" />
      <circle cx={x2} cy={y} r="4" />
      <line x1={x1 + 4} y1={y} x2={closed ? x2 - 4 : x2 - 9} y2={closed ? y : y - 15} />
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
      <circle cx={x} cy={y1} r="4" />
      <circle cx={x} cy={y2} r="4" />
      <line x1={x} y1={y1 + 4} x2={closed ? x : x + 15} y2={closed ? y2 - 4 : y2 - 9} />
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

      <svg viewBox="0 0 300 250" aria-label="Power flow vertical">
        {/* Load at top */}
        <g transform="translate(150 24)">
          <rect x="-48" y="-17" width="96" height="34" rx="6" className="vref-load-card" />
          <g transform="translate(-20 0)" className="vref-flow-icon">
            <path d="M-10 10h20M-7 10V1l5 2V-7l6 2v15M4 1l6 2v7" />
          </g>
          <text x="15" y="5" className="vref-load-title">
            LOAD
          </text>
        </g>

        {/* Vertical bus */}
        <path d="M150 41 V77" className="vref-wire" />
        <path d="M150 41 V77" className={cn("vref-wire-live", busLive && "is-live")} />
        <circle cx="150" cy="77" r="5" className={cn("vref-junction", busLive && "is-live")} />

        {/* Mains branch */}
        <circle
          cx="20"
          cy="83"
          r="5"
          className={cn(
            "vref-status-dot",
            !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
          )}
        />
        <text x="31" y="87" className="vref-flow-label">
          MAINS
        </text>

        <g transform="translate(48 116)">
          <circle
            r="29"
            className={cn(
              "vref-device",
              !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
            )}
          />
          <TowerIcon />
          {mainsKnown && !mainsPresent && (
            <g transform="translate(22 22)">
              <circle r="9" className="vref-source-x-bg" />
              <path d="M-4-4 4 4M4-4-4 4" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M77 116 H100" className="vref-wire" />
        <path d="M126 116 H150 V77" className="vref-wire" />
        <path
          d="M77 116 H100"
          className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
        />
        <path d="M126 116 H150 V77" className={cn("vref-wire-live", mainsToBus && "is-live")} />
        <HorizontalContact x1={100} x2={126} y={116} closed={mcb} known={mcbKnown} />
        <BreakerState x={113} y={153} label="MCB" closed={mcb} known={mcbKnown} />

        {/* Generator path */}
        <path d="M150 77 V136" className="vref-wire" />
        <path d="M150 77 V136" className={cn("vref-wire-live", genToBus && "is-live")} />
        <VerticalContact x={150} y1={136} y2={164} closed={gcb} known={gcbKnown} />
        <path d="M150 164 V199" className="vref-wire" />
        <path d="M150 164 V199" className={cn("vref-wire-live", running && "is-live")} />
        <BreakerState x={212} y={151} label="GCB" closed={gcb} known={gcbKnown} />

        <circle
          cx="205"
          cy="202"
          r="5"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />
        <text x="216" y="206" className="vref-flow-label">
          GENERATOR
        </text>

        <g transform="translate(150 218)">
          <circle
            r="29"
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
