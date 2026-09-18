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
  const busY = 105;
  const bladeX = known && closed ? x + 36 : x + 49;
  const bladeY = known && closed ? busY : busY - 16;
  const stateClass = !known ? "unknown" : closed ? "on" : "off";

  return (
    <g
      className={cn(
        "vref-breaker",
        !known && "is-unknown",
        known && closed && "is-closed",
        known && !closed && "is-open",
      )}
    >
      <circle cx={x} cy={busY} r="4" />
      <circle cx={x + 36} cy={busY} r="4" />
      <line x1={x + 4} y1={busY - 1} x2={bladeX} y2={bladeY} />
      <g transform={"translate(" + (x + 18) + " 153)"}>
        <rect x="-31" y="-20" width="62" height="40" rx="5" />
        <text x="0" y="-5" textAnchor="middle" className="vref-breaker-name">
          {label}
        </text>
        <rect x="-24" y="2" width="22" height="14" rx="2" className={"state " + stateClass} />
        <text x="-13" y="13" textAnchor="middle" className="vref-breaker-io">
          I
        </text>
        <text x="13" y="13" textAnchor="middle" className="vref-breaker-state">
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
  const mainsState = !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead";

  return (
    <section className="vref-section vref-flow">
      <h4>POWER FLOW</h4>
      <svg viewBox="0 0 620 190" aria-label="Power flow" preserveAspectRatio="xMidYMid meet">
        <text x="25" y="24" className="vref-flow-label">
          MAINS
        </text>
        <circle cx="14" cy="20" r="5" className={cn("vref-status-dot", mainsState)} />
        <text x="25" y="42" className={cn("vref-flow-sub", mainsState)}>
          {!mainsKnown ? "N/D" : mainsPresent ? "Available" : "Not Available"}
        </text>

        <text x="500" y="24" className="vref-flow-label">
          GENERATOR
        </text>
        <circle
          cx="488"
          cy="20"
          r="5"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />
        <text x="500" y="42" className="vref-flow-sub">
          {(loadKw == null ? "N/D" : Math.round(loadKw) + " kW") +
            " / " +
            (rpm == null ? "N/D" : Math.round(rpm).toLocaleString("pt-BR") + " RPM")}
        </text>

        <g transform="translate(48 105)">
          <circle r="30" className={cn("vref-device", mainsState)} />
          <TowerIcon />
          {mainsKnown && !mainsPresent && (
            <g transform="translate(22 22)">
              <circle r="10" className="vref-source-x-bg" />
              <path d="M-4-4 4 4M4-4-4 4" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M78 105 H135" className={cn("vref-source-wire", mainsState)} />
        <path d="M171 105 H310" className={cn("vref-wire", mainsToBus && "is-live")} />
        <path d="M310 105 H431" className={cn("vref-wire", genToBus && "is-live")} />
        <path d="M467 105 H546" className={cn("vref-wire", running && "is-live")} />
        <path d="M310 105 V50" className={cn("vref-wire", busLive && "is-live")} />
        <circle cx="310" cy="105" r="5" className={cn("vref-junction", busLive && "is-live")} />

        <BreakerSymbol x={135} closed={mcb} known={mcbKnown} label="MCB" />
        <BreakerSymbol x={431} closed={gcb} known={gcbKnown} label="GCB" />

        <g transform="translate(310 28)">
          <rect x="-52" y="-22" width="104" height="44" rx="6" className="vref-load-card" />
          <g transform="translate(-28 0)" className="vref-flow-icon">
            <path d="M-11 11h22M-8 11V1l5 2V-8l6 2v17M3 1l6 2v8" />
            <path d="M-5 6v0M0-2v0M0 5v0M6 7v0" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <text x="10" y="-3" className="vref-load-title">
            LOAD
          </text>
          <text x="10" y="14" className={cn("vref-load-value", busLive && "is-live")}>
            {loadKw == null ? "N/D" : Math.round(loadKw) + " kW"}
          </text>
        </g>

        <g transform="translate(576 105)">
          <circle
            r="30"
            className={cn("vref-device", "generator", running ? "is-live" : "is-idle")}
          />
          <text x="0" y="9" textAnchor="middle" className="vref-generator-letter">
            G
          </text>
        </g>
      </svg>
    </section>
  );
}
