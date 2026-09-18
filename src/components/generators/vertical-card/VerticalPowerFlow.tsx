import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-25 0 20M-9 20 0-25 9 20M-15-9H15M-18 4H18M-21 15H21" />
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
  const stateText = !known ? "—" : closed ? "ON" : "OFF";
  const stateGlyph = !known ? "—" : closed ? "I" : "O";
  const blade =
    direction === "ltr"
      ? {
          x1: x + 4,
          y1: 93,
          x2: closed ? x + 44 : x + 35,
          y2: closed ? 93 : 70,
        }
      : {
          x1: x + 44,
          y1: 93,
          x2: closed ? x + 4 : x + 13,
          y2: closed ? 93 : 70,
        };

  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x} cy="93" r="5" />
      <circle cx={x + 48} cy="93" r="5" />
      <line x1={blade.x1} y1={blade.y1} x2={blade.x2} y2={blade.y2} />
      <g className="vref-breaker-panel" transform={`translate(${x + 24} 139)`}>
        <text x="0" y="-21" textAnchor="middle" className="label">
          {label}
        </text>
        <rect x="-42" y="-16" width="84" height="34" rx="5" className="panel" />
        <rect x="-37" y="-12" width="31" height="26" rx="4" className="state-box" />
        <text x="-21.5" y="7" textAnchor="middle" className="state-glyph">
          {stateGlyph}
        </text>
        <text x="17" y="7" textAnchor="middle" className="state-text">
          {stateText}
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
    <section className="vref-section vref-flow">
      <h4>POWER FLOW</h4>
      <svg viewBox="0 0 680 185" aria-label="Power flow">
        <circle
          cx="25"
          cy="20"
          r="6"
          className={cn(
            "vref-status-dot",
            !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
          )}
        />
        <text x="40" y="25" className="vref-flow-label">
          MAINS
        </text>
        <circle
          cx="528"
          cy="20"
          r="6"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />
        <text x="543" y="25" className="vref-flow-label">
          GENERATOR
        </text>

        <g transform="translate(70 93)">
          <circle
            r="39"
            className={cn(
              "vref-device",
              !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
            )}
          />
          <TowerIcon />
          {mainsKnown && !mainsPresent && (
            <g transform="translate(31 29)">
              <circle r="12" className="vref-source-x-bg" />
              <path d="M-5-5 5 5M5-5-5 5" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M109 93 H168" className="vref-wire" />
        <path d="M216 93 H340" className="vref-wire" />
        <path d="M340 93 H464" className="vref-wire" />
        <path d="M512 93 H588" className="vref-wire" />
        <path d="M340 93 V48" className="vref-wire" />

        <path
          d="M109 93 H168"
          className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
        />
        <path d="M216 93 H340" className={cn("vref-wire-live", mainsToBus && "is-live")} />
        <path d="M340 93 H464" className={cn("vref-wire-live", genToBus && "is-live")} />
        <path d="M512 93 H588" className={cn("vref-wire-live", running && "is-live")} />
        <path d="M340 93 V48" className={cn("vref-wire-live", busLive && "is-live")} />
        <circle cx="340" cy="93" r="6" className={cn("vref-junction", busLive && "is-live")} />

        <BreakerContact x={168} closed={mcb} known={mcbKnown} label="MCB" direction="ltr" />
        <BreakerContact x={464} closed={gcb} known={gcbKnown} label="GCB" direction="rtl" />

        <g transform="translate(340 29)">
          <rect x="-55" y="-20" width="110" height="40" rx="7" className="vref-load-card" />
          <g transform="translate(-24 0)" className="vref-flow-icon">
            <path d="M-12 12h24M-9 12V1l6 2V-9l7 2v19M4 1l7 2v9" />
            <path d="M-5 6v0M0-2v0M0 5v0M7 7v0" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <text x="17" y="5" className="vref-load-title">
            LOAD
          </text>
        </g>

        <g transform="translate(630 93)">
          <circle
            r="39"
            className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
          />
          <text x="0" y="12" textAnchor="middle" className="vref-generator-letter">
            G
          </text>
        </g>
      </svg>
    </section>
  );
}
