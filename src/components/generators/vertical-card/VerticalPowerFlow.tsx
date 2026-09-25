import type { ReactNode } from "react";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IconStart, IconStop } from "../scada-icons";

type BreakerSourceSide = "top" | "bottom";

function VerticalContact({
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
  const line = closed
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
      <circle cx={x} cy={y1} r="3.6" />
      <circle cx={x} cy={y2} r="3.6" />
      <line {...line} />
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
  const stateText = !known ? "N/D" : closed ? "FECH." : "ABER.";
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
      <text x="0" y="-11" textAnchor="middle" className="label">
        {label}
      </text>
      <rect x="-22" y="-7" width="44" height="22" rx="4" />
      <text x="0" y="7" textAnchor="middle" className="state">
        {busy ? "…" : stateText}
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

function SourceNode({
  x,
  y,
  title,
  value,
  state,
}: {
  x: number;
  y: number;
  title: string;
  value: string;
  state: "live" | "dead" | "unknown";
}) {
  return (
    <g className={cn("vref-source-node", `is-${state}`)} transform={`translate(${x} ${y})`}>
      <rect x="-35" y="-16" width="70" height="32" rx="6" />
      <text x="0" y="-2" textAnchor="middle" className="title">
        {title}
      </text>
      <text x="0" y="11" textAnchor="middle" className="value">
        {value}
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
      <rect x="-33" y="-18" width="66" height="36" rx="5" />
      <text x="0" y="-3" textAnchor="middle" className="title">
        {title}
      </text>
      <text x="0" y="10" textAnchor="middle" className="value">
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
}: {
  x: number;
  y: number;
  known: boolean;
  present: boolean;
}) {
  return (
    <g
      className={cn("vref-generator-node", !known ? "is-unknown" : present ? "is-live" : "is-idle")}
      transform={`translate(${x} ${y})`}
    >
      <circle r="21" />
      <text x="0" y="7" textAnchor="middle">
        G
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
      <div className="vref-flow-controller-heading">
        <h4>FLUXO DE POTÊNCIA</h4>
      </div>

      <div className="vref-flow-controller-body">
        <svg
          viewBox="0 0 235 244"
          aria-label={
            hasMainsSource
              ? "Fluxo de potência vertical com rede"
              : "Fluxo de potência vertical sem rede"
          }
        >
          {hasMainsSource ? (
            <>
              <SourceNode
                x={112}
                y={22}
                title="REDE"
                value={formatHz(mainsFrequency)}
                state={mainsState}
              />

              <path d="M112 38 V58" className="vref-wire" />
              <path
                d="M112 38 V58"
                className={cn("vref-wire-live", mainsKnown && mainsPresent && "is-live")}
              />

              <BreakerBadge
                x={45}
                y={70}
                label="MCB"
                closed={mcb}
                known={mcbKnown}
                commandable={mcb ? canMcbOpen : canMcbClose}
                busy={busy === "mcb_open" || busy === "mcb_close"}
                onToggle={() => onCommand(mcb ? "mcb_open" : "mcb_close")}
              />
              <VerticalContact
                x={112}
                y1={58}
                y2={80}
                closed={mcb}
                known={mcbKnown}
                sourceSide="top"
              />

              <path d="M112 80 V108" className="vref-wire" />
              <path d="M112 80 V108" className={cn("vref-wire-live", mainsToBus && "is-live")} />
              <text x="112" y="101" textAnchor="middle" className="vref-bus-label">
                BARRAMENTO
              </text>
              <path d="M82 108 H150" className="vref-bus" />
              <path d="M82 108 H150" className={cn("vref-bus-live", busLive && "is-live")} />
              <circle
                cx="112"
                cy="108"
                r="4"
                className={cn("vref-junction", busLive && "is-live")}
              />

              <path d="M150 108 H160" className="vref-wire" />
              <path d="M150 108 H160" className={cn("vref-wire-live", busLive && "is-live")} />
              <LoadNode
                x={194}
                y={108}
                title={powerBlockLabel}
                power={powerBlockKw}
                live={busLive}
              />

              <path d="M112 108 V138" className="vref-wire" />
              <path d="M112 108 V138" className={cn("vref-wire-live", genToBus && "is-live")} />
              <BreakerBadge
                x={45}
                y={151}
                label="GCB"
                closed={gcb}
                known={gcbKnown}
                commandable={gcb ? canGcbOpen : canGcbClose}
                busy={busy === "gcb_open" || busy === "gcb_close"}
                onToggle={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
              />
              <VerticalContact
                x={112}
                y1={138}
                y2={160}
                closed={gcb}
                known={gcbKnown}
                sourceSide="bottom"
              />
              <path d="M112 160 V196" className="vref-wire" />
              <path
                d="M112 160 V196"
                className={cn("vref-wire-live", generatorPresent && "is-live")}
              />

              <text x="16" y="205" className="vref-flow-frequency">
                {formatHz(generatorFrequency)}
              </text>
              <GeneratorNode x={112} y={211} known={generatorKnown} present={generatorPresent} />
              <text x="112" y="240" textAnchor="middle" className="vref-generator-label">
                GERADOR
              </text>
            </>
          ) : (
            <>
              <text x="112" y="48" textAnchor="middle" className="vref-bus-label">
                BARRAMENTO
              </text>
              <path d="M82 56 H150" className="vref-bus" />
              <path d="M82 56 H150" className={cn("vref-bus-live", genToBus && "is-live")} />
              <circle
                cx="112"
                cy="56"
                r="4"
                className={cn("vref-junction", genToBus && "is-live")}
              />
              <path d="M150 56 H160" className="vref-wire" />
              <path d="M150 56 H160" className={cn("vref-wire-live", genToBus && "is-live")} />
              <LoadNode
                x={194}
                y={56}
                title={powerBlockLabel}
                power={powerBlockKw}
                live={genToBus}
              />

              <path d="M112 56 V102" className="vref-wire" />
              <path d="M112 56 V102" className={cn("vref-wire-live", genToBus && "is-live")} />
              <BreakerBadge
                x={45}
                y={115}
                label="GCB"
                closed={gcb}
                known={gcbKnown}
                commandable={gcb ? canGcbOpen : canGcbClose}
                busy={busy === "gcb_open" || busy === "gcb_close"}
                onToggle={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
              />
              <VerticalContact
                x={112}
                y1={102}
                y2={124}
                closed={gcb}
                known={gcbKnown}
                sourceSide="bottom"
              />
              <path d="M112 124 V184" className="vref-wire" />
              <path
                d="M112 124 V184"
                className={cn("vref-wire-live", generatorPresent && "is-live")}
              />
              <text x="16" y="193" className="vref-flow-frequency">
                {formatHz(generatorFrequency)}
              </text>
              <GeneratorNode x={112} y={200} known={generatorKnown} present={generatorPresent} />
              <text x="112" y="229" textAnchor="middle" className="vref-generator-label">
                GERADOR
              </text>
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
