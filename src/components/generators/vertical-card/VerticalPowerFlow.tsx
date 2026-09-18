import { cn } from "@/lib/utils";

function TowerIcon() {
  return (
    <g className="vref-flow-icon">
      <path d="M0-21 0 18M-8 18 0-21 8 18M-13-8H13M-16 3H16M-19 13H19" />
      <path d="m-12-8 12 10 12-10M-14 3 0 13 14 3" />
    </g>
  );
}

function BreakerSymbol({
  x,
  closed,
  known,
  label,
}: {
  x: number;
  closed: boolean;
  known: boolean;
  label: string;
}) {
  const bladeX = known && closed ? x + 36 : x + 48;
  const bladeY = known && closed ? 76 : 64;
  return (
    <g
      className={cn(
        "vref-breaker",
        !known && "is-unknown",
        known && closed ? "is-closed" : "is-open",
      )}
    >
      <circle cx={x} cy="76" r="4" />
      <circle cx={x + 36} cy="76" r="4" />
      <line x1={x + 4} y1="75" x2={bladeX} y2={bladeY} />
      <g transform={"translate(" + (x + 18) + " 112)"}>
        <rect x="-29" y="-18" width="58" height="36" rx="5" />
        <text x="0" y="-4" textAnchor="middle" className="vref-breaker-name">
          {label}
        </text>
        <rect
          x="-22"
          y="2"
          width="20"
          height="13"
          rx="2"
          className={known && closed ? "state on" : "state off"}
        />
        <text x="-12" y="12" textAnchor="middle" className="vref-breaker-io">
          I
        </text>
        <text x="12" y="12" textAnchor="middle" className="vref-breaker-state">
          {!known ? "N/D" : closed ? "ON" : "OFF"}
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
  loadKw,
  rpm,
}: {
  mainsPresent: boolean;
  mainsKnown: boolean;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  running: boolean;
  loadKw: number | null;
  rpm: number | null;
}) {
  const mainsToBus = mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = running && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;

  return (
    <section className="vref-section vref-flow">
      <h4>POWER FLOW</h4>
      <svg viewBox="0 0 620 155" aria-label="Power flow">
        <text x="24" y="25" className="vref-flow-label">
          MAINS
        </text>
        <circle
          cx="14"
          cy="21"
          r="5"
          className={cn("vref-status-dot", mainsPresent ? "is-live" : "is-dead")}
        />
        <text x="24" y="41" className={cn("vref-flow-sub", mainsPresent ? "is-live" : "is-dead")}>
          {!mainsKnown ? "N/D" : mainsPresent ? "Available" : "Not Available"}
        </text>

        <text x="505" y="25" className="vref-flow-label">
          GENERATOR
        </text>
        <circle
          cx="494"
          cy="21"
          r="5"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />
        <text x="505" y="41" className="vref-flow-sub">
          {(loadKw == null ? "N/D" : Math.round(loadKw) + " kW") +
            " / " +
            (rpm == null ? "N/D" : Math.round(rpm).toLocaleString("pt-BR") + " RPM")}
        </text>

        <g transform="translate(45 76)">
          <circle r="29" className={cn("vref-device", mainsPresent ? "is-live" : "is-dead")} />
          <TowerIcon />
          {!mainsPresent && mainsKnown && (
            <g transform="translate(21 21)">
              <circle r="10" className="vref-source-x-bg" />
              <path d="M-4-4 4 4M4-4-4 4" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M74 76 H280" className="vref-wire" />
        <path d="M340 76 H546" className="vref-wire" />
        <path d="M310 76 V42" className="vref-wire" />
        <path d="M74 76 H280" className={cn("vref-wire-live", mainsToBus && "is-live")} />
        <path d="M340 76 H546" className={cn("vref-wire-live", genToBus && "is-live")} />
        <path d="M310 76 V42" className={cn("vref-wire-live", busLive && "is-live")} />
        <circle cx="310" cy="76" r="5" className={cn("vref-junction", busLive && "is-live")} />

        <BreakerSymbol x={135} closed={mcb} known={mcbKnown} label="MCB" />
        <BreakerSymbol x={431} closed={gcb} known={gcbKnown} label="GCB" />

        <g transform="translate(310 22)">
          <rect x="-51" y="-20" width="102" height="40" rx="6" className="vref-load-card" />
          <g transform="translate(-27 0)" className="vref-flow-icon">
            <path d="M-11 11h22M-8 11V1l5 2V-8l6 2v17M3 1l6 2v8" />
            <path d="M-5 6v0M0-2v0M0 5v0M6 7v0" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <text x="10" y="-3" className="vref-load-title">
            LOAD
          </text>
          <text x="10" y="13" className={cn("vref-load-value", busLive && "is-live")}>
            {loadKw == null ? "N/D" : Math.round(loadKw) + " kW"}
          </text>
        </g>

        <g transform="translate(575 76)">
          <circle
            r="29"
            className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
          />
          <text x="0" y="8" textAnchor="middle" className="vref-generator-letter">
            G
          </text>
        </g>
      </svg>
    </section>
  );
}
