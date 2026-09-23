import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IconGenerator, IconLoad, IconMains, IconStart, IconStop } from "../scada-icons";

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
  commandable,
  busy,
  onToggle,
}: {
  x: number;
  y: number;
  label: string;
  closed: boolean;
  known: boolean;
  commandable: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const stateText = !known ? "—" : closed ? "I" : "O";

  const interactive = known && commandable && !busy;
  const activate = () => {
    if (interactive) onToggle();
  };

  return (
    <g
      className={cn("vref-breaker-badge", stateClass, interactive && "is-commandable")}
      transform={`translate(${x} ${y})`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={!interactive}
      aria-label={`${label} ${known ? (closed ? "fechado" : "aberto") : "estado desconhecido"}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <text x="0" y="-12" textAnchor="middle" className="label">
        {label}
      </text>
      <rect x="-17" y="-8" width="34" height="24" rx="4" />
      <text x="0" y="8" textAnchor="middle" className="state">
        {busy ? "…" : stateText}
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
  generatorPowerKw,
  generatorKnown,
  generatorPresent,
  modeLabel,
  mcb,
  mcbKnown,
  gcb,
  gcbKnown,
  canStart,
  canStop,
  canMcbOpen,
  canMcbClose,
  canGcbOpen,
  canGcbClose,
  busy,
  onCommand,
}: {
  mainsPresent: boolean;
  mainsKnown: boolean;
  mainsFrequency: number | null;
  generatorFrequency: number | null;
  generatorPowerKw: number | null;
  generatorKnown: boolean;
  generatorPresent: boolean;
  modeLabel: string;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  canStart: boolean;
  canStop: boolean;
  canMcbOpen: boolean;
  canMcbClose: boolean;
  canGcbOpen: boolean;
  canGcbClose: boolean;
  busy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void;
}) {
  const mainsToBus = mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = generatorKnown && generatorPresent && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;
  const busLoadKw = genToBus && !mainsToBus ? generatorPowerKw : null;

  return (
    <section className="vref-section vref-flow vref-flow-controller">
      <div className="vref-flow-controller-heading">
        <h4>FLUXO DE POTÊNCIA</h4>
        <span>MODO: {modeLabel}</span>
      </div>

      <div className="vref-flow-controller-body">
        <svg viewBox="0 0 235 250" aria-label="Fluxo de potência vertical">
          <g transform="translate(112 31)">
            <circle
              r="22"
              className={cn(
                "vref-device",
                !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
              )}
            />
            <g transform="translate(-18 -18)" className="vref-flow-icon">
              <IconMains size={36} />
            </g>
          </g>
          <text x="139" y="35" className="vref-flow-reading">
            {formatHz(mainsFrequency)}
          </text>

          <path d="M112 53 V73" className="vref-wire" />
          <path
            d="M112 53 V73"
            className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
          />

          <BreakerBadge
            x={50}
            y={84}
            label="MCB"
            closed={mcb}
            known={mcbKnown}
            commandable={mcb ? canMcbOpen : canMcbClose}
            busy={busy === "mcb_open" || busy === "mcb_close"}
            onToggle={() => onCommand(mcb ? "mcb_open" : "mcb_close")}
          />
          <VerticalContact x={112} y1={73} y2={94} closed={mcb} known={mcbKnown} />

          <path d="M112 94 V126" className="vref-wire" />
          <path d="M112 94 V126" className={cn("vref-wire-live", mainsToBus && "is-live")} />
          <circle cx="112" cy="126" r="4.5" className={cn("vref-junction", busLive && "is-live")} />

          <path d="M112 126 H148" className="vref-wire" />
          <path d="M112 126 H148" className={cn("vref-wire-live", busLive && "is-live")} />
          <g transform="translate(181 126)">
            <rect x="-33" y="-21" width="66" height="42" rx="5" className="vref-load-card" />
            <g transform="translate(-27 -13)" className="vref-flow-icon">
              <IconLoad size={22} />
            </g>
            <text x="13" y="-3" textAnchor="middle" className="vref-load-title">
              CARGA
            </text>
            <text x="13" y="11" textAnchor="middle" className="vref-load-value">
              {formatLoad(busLoadKw)}
            </text>
          </g>

          <path d="M112 126 V155" className="vref-wire" />
          <path d="M112 126 V155" className={cn("vref-wire-live", genToBus && "is-live")} />

          <BreakerBadge
            x={50}
            y={166}
            label="GCB"
            closed={gcb}
            known={gcbKnown}
            commandable={gcb ? canGcbOpen : canGcbClose}
            busy={busy === "gcb_open" || busy === "gcb_close"}
            onToggle={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
          />
          <VerticalContact x={112} y1={155} y2={176} closed={gcb} known={gcbKnown} />

          <path d="M112 176 V205" className="vref-wire" />
          <path d="M112 176 V205" className={cn("vref-wire-live", generatorPresent && "is-live")} />

          <text x="14" y="217" className="vref-flow-frequency">
            {formatHz(generatorFrequency)}
          </text>

          <g transform="translate(112 220)">
            <circle
              r="23"
              className={cn(
                "vref-device",
                "generator",
                !generatorKnown ? "is-unknown" : generatorPresent ? "is-live" : "is-idle",
              )}
            />
            <g transform="translate(-17 -17)" className="vref-flow-icon">
              <IconGenerator size={34} />
            </g>
          </g>
        </svg>

        <div className="vref-flow-command-stack">
          <button
            type="button"
            className="start"
            disabled={!canStart || busy !== null}
            onClick={() => onCommand("start")}
          >
            <IconStart size={10} />
            {busy === "start" ? "..." : "START"}
          </button>
          <button
            type="button"
            className="stop"
            disabled={!canStop || busy !== null}
            onClick={() => onCommand("stop")}
          >
            <IconStop size={10} />
            {busy === "stop" ? "..." : "STOP"}
          </button>
        </div>
      </div>
    </section>
  );
}
