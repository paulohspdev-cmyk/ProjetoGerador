import type { ReactNode } from "react";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IconStart, IconStop } from "../scada-icons";

type BreakerSourceSide = "top" | "bottom";

function SwitchSymbol({
  x,
  y1,
  y2,
  closed,
  known,
  sourceSide,
}: {
  x: number;
  y1: number;
  y2: number;
  closed: boolean;
  known: boolean;
  sourceSide: BreakerSourceSide;
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const arm = closed
    ? { x1: x, y1: y1 + 4, x2: x, y2: y2 - 4 }
    : sourceSide === "top"
      ? { x1: x, y1: y1 + 4, x2: x + 13, y2: y2 - 7 }
      : { x1: x, y1: y2 - 4, x2: x + 13, y2: y1 + 7 };

  return (
    <g
      className={cn("vref-breaker", stateClass)}
      data-breaker-state={stateClass.replace("is-", "")}
      data-source-side={sourceSide}
    >
      <circle cx={x} cy={y1} r="3.3" />
      <circle cx={x} cy={y2} r="3.3" />
      <line {...arm} />
    </g>
  );
}

function BreakerPanel({
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
  const symbol = !known ? "I/O" : closed ? "I" : "O";
  const stateText = !known ? "N/D" : closed ? "FECHADO" : "ABERTO";
  const interactive = known && commandable && !busy;
  const activate = () => {
    if (interactive) onToggle();
  };

  return (
    <g
      className={cn(
        "vref-breaker-panel",
        "vref-breaker-badge",
        stateClass,
        interactive && "is-commandable",
      )}
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
      <text x="0" y="-17" textAnchor="middle" className="label">
        {label}
      </text>
      <rect x="-22" y="-11" width="44" height="30" rx="3" />
      <text x="0" y="8" textAnchor="middle" className="symbol">
        {busy ? "…" : symbol}
      </text>
      <text x="0" y="31" textAnchor="middle" className="state">
        {stateText}
      </text>
    </g>
  );
}

function formatHz(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Hz`;
}

function formatLoad(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${Math.round(value).toLocaleString("pt-BR")} kW`;
}

function UtilityNode({
  x,
  y,
  frequency,
  state,
}: {
  x: number;
  y: number;
  frequency: number | null;
  state: "live" | "dead" | "unknown";
}) {
  return (
    <g className={cn("vref-utility-node", `is-${state}`)} transform={`translate(${x} ${y})`}>
      <circle r="19" />
      <g className="vref-pylon-icon">
        <path d="M0 -12 L-7 11 M0 -12 L7 11 M-5 -5 H5 M-8 1 H8 M-11 7 H11 M-4 11 H4" />
        <path d="M-11 7 L-15 11 M11 7 L15 11" />
      </g>
      <text x="25" y="4" className="frequency">
        {formatHz(frequency)}
      </text>
    </g>
  );
}

function LoadNode({
  x,
  y,
  title,
  power,
  live,
}: {
  x: number;
  y: number;
  title: string;
  power: number | null;
  live: boolean;
}) {
  return (
    <g className={cn("vref-load-node", live && "is-live")} transform={`translate(${x} ${y})`}>
      <rect x="-31" y="-19" width="62" height="38" rx="4" />
      <g className="vref-load-icon" transform="translate(-19 -1)">
        <path d="M-7 8 V-3 L-2 0 V-7 L4 -3 V8 Z" />
        <path d="M-9 8 H8" />
      </g>
      <text x="9" y="-2" textAnchor="middle" className="title">
        {title}
      </text>
      <text x="9" y="11" textAnchor="middle" className="value">
        {formatLoad(power)}
      </text>
    </g>
  );
}

function GeneratorNode({
  x,
  y,
  known,
  present,
  frequency,
}: {
  x: number;
  y: number;
  known: boolean;
  present: boolean;
  frequency: number | null;
}) {
  return (
    <g
      className={cn("vref-generator-node", !known ? "is-unknown" : present ? "is-live" : "is-idle")}
      transform={`translate(${x} ${y})`}
    >
      <circle r="20" />
      <text x="0" y="7" textAnchor="middle" className="letter">
        G
      </text>
      <text x="-28" y="4" textAnchor="end" className="frequency">
        {formatHz(frequency)}
      </text>
    </g>
  );
}

export function VerticalPowerFlow({
  hasMainsSource,
  mainsPresent,
  mainsKnown,
  mainsFrequency,
  generatorFrequency,
  generatorPowerKw,
  generatorKnown,
  generatorPresent,
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
  controls,
}: {
  hasMainsSource: boolean;
  mainsPresent: boolean;
  mainsKnown: boolean;
  mainsFrequency: number | null;
  generatorFrequency: number | null;
  generatorPowerKw: number | null;
  generatorKnown: boolean;
  generatorPresent: boolean;
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
  controls: ReactNode;
}) {
  const mainsToBus = hasMainsSource && mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = generatorKnown && generatorPresent && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;
  const isolatedGeneratorLoad = genToBus && !mainsToBus;
  const powerBlockLabel =
    !hasMainsSource || isolatedGeneratorLoad || generatorPowerKw == null ? "CARGA" : "POT. GER.";
  const powerBlockKw = generatorPowerKw;
  const mainsState = !mainsKnown ? "unknown" : mainsPresent ? "live" : "dead";

  return (
    <section className="vref-section vref-flow vref-flow-controller">
      <div className="vref-flow-controller-body">
        <svg
          viewBox="0 0 240 244"
          aria-label={hasMainsSource ? "Diagrama unifilar com rede" : "Diagrama unifilar sem rede"}
        >
          {hasMainsSource ? (
            <>
              <UtilityNode x={124} y={24} frequency={mainsFrequency} state={mainsState} />
              <path d="M124 43 V64" className="vref-wire" />
              <path
                d="M124 43 V64"
                className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
              />

              <BreakerPanel
                x={45}
                y={76}
                label="MCB"
                closed={mcb}
                known={mcbKnown}
                commandable={mcb ? canMcbOpen : canMcbClose}
                busy={busy === "mcb_open" || busy === "mcb_close"}
                onToggle={() => onCommand(mcb ? "mcb_open" : "mcb_close")}
              />
              <SwitchSymbol
                x={124}
                y1={64}
                y2={86}
                closed={mcb}
                known={mcbKnown}
                sourceSide="top"
              />

              <path d="M124 86 V116" className="vref-wire" />
              <path d="M124 86 V116" className={cn("vref-wire-live", mainsToBus && "is-live")} />
              <circle
                cx="124"
                cy="116"
                r="4"
                className={cn("vref-junction", busLive && "is-live")}
              />
              <path d="M124 116 H166" className="vref-wire" />
              <path d="M124 116 H166" className={cn("vref-wire-live", busLive && "is-live")} />
              <LoadNode
                x={198}
                y={116}
                title={powerBlockLabel}
                power={powerBlockKw}
                live={busLive}
              />

              <path d="M124 116 V145" className="vref-wire" />
              <path d="M124 116 V145" className={cn("vref-wire-live", genToBus && "is-live")} />
              <BreakerPanel
                x={45}
                y={157}
                label="GCB"
                closed={gcb}
                known={gcbKnown}
                commandable={gcb ? canGcbOpen : canGcbClose}
                busy={busy === "gcb_open" || busy === "gcb_close"}
                onToggle={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
              />
              <SwitchSymbol
                x={124}
                y1={145}
                y2={167}
                closed={gcb}
                known={gcbKnown}
                sourceSide="bottom"
              />
              <path d="M124 167 V202" className="vref-wire" />
              <path
                d="M124 167 V202"
                className={cn("vref-wire-live", generatorPresent && "is-live")}
              />
              <GeneratorNode
                x={124}
                y={220}
                known={generatorKnown}
                present={generatorPresent}
                frequency={generatorFrequency}
              />
            </>
          ) : (
            <>
              <circle
                cx="124"
                cy="58"
                r="4"
                className={cn("vref-junction", genToBus && "is-live")}
              />
              <path d="M124 58 H166" className="vref-wire" />
              <path d="M124 58 H166" className={cn("vref-wire-live", genToBus && "is-live")} />
              <LoadNode
                x={198}
                y={58}
                title={powerBlockLabel}
                power={powerBlockKw}
                live={genToBus}
              />
              <path d="M124 58 V109" className="vref-wire" />
              <path d="M124 58 V109" className={cn("vref-wire-live", genToBus && "is-live")} />
              <BreakerPanel
                x={45}
                y={121}
                label="GCB"
                closed={gcb}
                known={gcbKnown}
                commandable={gcb ? canGcbOpen : canGcbClose}
                busy={busy === "gcb_open" || busy === "gcb_close"}
                onToggle={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
              />
              <SwitchSymbol
                x={124}
                y1={109}
                y2={131}
                closed={gcb}
                known={gcbKnown}
                sourceSide="bottom"
              />
              <path d="M124 131 V199" className="vref-wire" />
              <path
                d="M124 131 V199"
                className={cn("vref-wire-live", generatorPresent && "is-live")}
              />
              <GeneratorNode
                x={124}
                y={218}
                known={generatorKnown}
                present={generatorPresent}
                frequency={generatorFrequency}
              />
            </>
          )}
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

      <div className="vref-flow-mode-controls">{controls}</div>
    </section>
  );
}
