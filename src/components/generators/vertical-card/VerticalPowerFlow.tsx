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
}: {
  x: number;
  closed: boolean;
  known: boolean;
  label: string;
}) {
  const bladeX = known && closed ? x + 34 : x + 47;
  const bladeY = known && closed ? 73 : 58;

  return (
    <g
      className={cn("vref-breaker", !known ? "is-unknown" : closed ? "is-closed" : "is-open")}
      aria-label={label + " " + (!known ? "N/D" : closed ? "fechado" : "aberto")}
    >
      <title>{label + " — " + (!known ? "N/D" : closed ? "FECHADO" : "ABERTO")}</title>
      <circle cx={x} cy="73" r="4" />
      <circle cx={x + 34} cy="73" r="4" />
      <line x1={x + 4} y1="72" x2={bladeX} y2={bladeY} />
      <text x={x + 17} y="98" textAnchor="middle" className="vref-breaker-name">
        {label}
      </text>
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
      <svg viewBox="0 0 620 125" aria-label="Power flow">
        <text x="34" y="18" className="vref-flow-label">
          MAINS
        </text>
        <circle
          cx="22"
          cy="14"
          r="5"
          className={cn(
            "vref-status-dot",
            !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
          )}
        />

        <text x="515" y="18" className="vref-flow-label">
          GENERATOR
        </text>
        <circle
          cx="503"
          cy="14"
          r="5"
          className={cn("vref-status-dot", running ? "is-live" : "is-idle")}
        />

        <g transform="translate(48 73)">
          <circle
            r="32"
            className={cn(
              "vref-device",
              !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
            )}
          />
          <TowerIcon />
          {!mainsPresent && mainsKnown && (
            <g transform="translate(23 23)">
              <circle r="10" className="vref-source-x-bg" />
              <path d="M-4-4 4 4M4-4-4 4" className="vref-source-x" />
            </g>
          )}
        </g>

        <path d="M80 73 H278" className="vref-wire" />
        <path d="M342 73 H540" className="vref-wire" />
        <path d="M310 73 V38" className="vref-wire" />
        <path d="M80 73 H278" className={cn("vref-wire-live", mainsToBus && "is-live")} />
        <path d="M342 73 H540" className={cn("vref-wire-live", genToBus && "is-live")} />
        <path d="M310 73 V38" className={cn("vref-wire-live", busLive && "is-live")} />
        <circle cx="310" cy="73" r="5" className={cn("vref-junction", busLive && "is-live")} />

        <BreakerContact x={138} closed={mcb} known={mcbKnown} label="MCB" />
        <BreakerContact x={448} closed={gcb} known={gcbKnown} label="GCB" />

        <g transform="translate(310 22)">
          <rect x="-47" y="-18" width="94" height="36" rx="6" className="vref-load-card" />
          <g transform="translate(-20 0)" className="vref-flow-icon">
            <path d="M-11 11h22M-8 11V1l5 2V-8l6 2v17M3 1l6 2v8" />
            <path d="M-5 6v0M0-2v0M0 5v0M6 7v0" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <text x="13" y="5" className="vref-load-title">
            LOAD
          </text>
        </g>

        <g transform="translate(572 73)">
          <circle
            r="32"
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
