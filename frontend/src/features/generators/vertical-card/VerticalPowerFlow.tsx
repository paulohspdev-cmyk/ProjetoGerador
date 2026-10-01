import { memo } from "react";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Torre centrada no (0,0). */
function TowerIcon() {
  return (
    <g className="vref-flow-icon" transform="translate(0 1.2) scale(0.44)">
      <path d="M0-19 0 16M-7 16 0-19 7 16M-12-7H12M-14 3H14M-17 12H17" />
      <path d="m-11-7 11 9 11-9M-13 3 0 12 13 3" />
    </g>
  );
}

/** Contato horizontal (MCB / GCB). */
function HorizontalContact({
  x1,
  x2,
  y,
  closed,
  known,
  hinge = "left",
}: {
  x1: number;
  x2: number;
  y: number;
  closed: boolean;
  known: boolean;
  hinge?: "left" | "right";
}) {
  const stateClass = !known ? "is-unknown" : closed ? "is-closed" : "is-open";
  const open =
    hinge === "right"
      ? { x1: x1 + 8, y1: y - 10, x2: x2 - 3, y2: y }
      : { x1: x1 + 3, y1: y, x2: x2 - 8, y2: y - 10 };

  return (
    <g className={cn("vref-breaker", stateClass)}>
      <circle cx={x1} cy={y} r="3" />
      <circle cx={x2} cy={y} r="3" />
      <line
        x1={closed ? x1 + 3 : open.x1}
        y1={closed ? y : open.y1}
        x2={closed ? x2 - 3 : open.x2}
        y2={closed ? y : open.y2}
      />
    </g>
  );
}

/** MCB / GCB — caixa quadrada */
function FlowButton({
  x,
  y,
  label,
  tone,
  disabled,
  busy,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  tone: "start" | "stop" | "closed" | "open" | "unknown";
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const interactive = !disabled && !busy;
  return (
    <g
      className={cn("vref-flow-svg-btn", `is-${tone}`, interactive && "is-commandable")}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={!interactive}
      aria-label={label}
      onClick={() => interactive && onClick()}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <rect x="-14" y="-14" width="28" height="28" rx="2" />
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle">
        {busy ? "…" : label}
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

function formatKw(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${Math.round(value).toLocaleString("pt-BR")} kW`;
}

/** Fluxo lento dentro do fio (sem bolinhas). */
const FlowEnergy = memo(function FlowEnergy({ d, active }: { d: string; active: boolean }) {
  if (!active) return null;
  return <path d={d} pathLength={100} className="vref-energy-stroke is-on" aria-hidden />;
});

export function VerticalPowerFlow({
  hasMainsSource,
  mainsPresent,
  mainsKnown,
  mainsFrequency,
  generatorFrequency,
  generatorPowerKw,
  mainsPowerKw: _mainsPowerKw,
  generatorKnown,
  generatorPresent,
  modeLabel,
  mcb,
  mcbKnown,
  gcb,
  gcbKnown,
  canMcbOpen,
  canMcbClose,
  canGcbOpen,
  canGcbClose,
  busy,
  onCommand,
}: {
  hasMainsSource: boolean;
  mainsPresent: boolean;
  mainsKnown: boolean;
  mainsFrequency: number | null;
  generatorFrequency: number | null;
  generatorPowerKw: number | null;
  mainsPowerKw: number | null;
  generatorKnown: boolean;
  generatorPresent: boolean;
  modeLabel: string;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  canMcbOpen: boolean;
  canMcbClose: boolean;
  canGcbOpen: boolean;
  canGcbClose: boolean;
  busy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void;
}) {
  const mainsToBus = hasMainsSource && mainsKnown && mainsPresent && mcbKnown && mcb;
  const genToBus = generatorKnown && generatorPresent && gcbKnown && gcb;
  const busLive = mainsToBus || genToBus;
  const mainsSideLive = Boolean(hasMainsSource && mainsKnown && mainsPresent);
  const genSideLive = Boolean(generatorKnown && generatorPresent);
  const isolatedGeneratorLoad = genToBus && !mainsToBus;
  const powerBlockLabel =
    !hasMainsSource || isolatedGeneratorLoad || generatorPowerKw == null ? "CARGA" : "POT. GER.";
  const powerBlockKw = generatorPowerKw;
  const sourceLabel = genToBus ? "GERADOR" : mainsToBus ? "REDE" : "—";

  const mcbBusy = busy === "mcb_open" || busy === "mcb_close";
  const gcbBusy = busy === "gcb_open" || busy === "gcb_close";
  const canToggleMcb = Boolean(
    hasMainsSource && mcbKnown && (mcb ? canMcbOpen : canMcbClose) && !busy,
  );
  const canToggleGcb = Boolean(gcbKnown && (gcb ? canGcbOpen : canGcbClose) && !busy);

  const mcbTone = !mcbKnown ? "unknown" : mcb ? "closed" : "open";
  const gcbTone = !gcbKnown ? "unknown" : gcb ? "closed" : "open";
  const mcbLabel = `MCB ${!mcbKnown ? "—" : mcb ? "I" : "O"}`;
  const gcbLabel = `GCB ${!gcbKnown ? "—" : gcb ? "I" : "O"}`;

  const y = 58;

  return (
    <section className="vref-section vref-flow vref-flow-controller">
      <div className="vref-flow-controller-heading">
        <h4>POWER FLOW</h4>
        <span>
          {modeLabel} · {sourceLabel}
        </span>
      </div>

      <div className="vref-flow-controller-body is-horizontal">
        <svg
          viewBox="0 0 236 120"
          preserveAspectRatio="xMidYMid meet"
          aria-label={
            hasMainsSource ? "Power flow horizontal com rede" : "Power flow horizontal sem rede"
          }
        >
          {/* Rede: omitida quando a instalação foi homologada como somente gerador. */}
          {hasMainsSource ? (
            <>
              <g transform={`translate(26 ${y})`}>
                <circle
                  r="20"
                  className={cn(
                    "vref-device",
                    !mainsKnown ? "is-unknown" : mainsPresent ? "is-live" : "is-dead",
                  )}
                />
                <TowerIcon />
              </g>
              <text x="26" y={y - 26} textAnchor="middle" className="vref-flow-reading">
                {formatHz(mainsFrequency)}
              </text>

              <path d={`M46 ${y} H56`} className="vref-wire" />
              <path
                d={`M46 ${y} H56`}
                className={cn("vref-wire-live", mainsSideLive && "is-live")}
              />

              <HorizontalContact x1={56} x2={76} y={y} closed={mcb} known={mcbKnown} />
              <FlowButton
                x={66}
                y={y + 36}
                label={mcbLabel}
                tone={mcbTone}
                disabled={!canToggleMcb}
                busy={mcbBusy}
                onClick={() => onCommand(mcb ? "mcb_open" : "mcb_close")}
              />

              <path d={`M76 ${y} H112`} className="vref-wire" />
              <path d={`M76 ${y} H112`} className={cn("vref-wire-live", mainsToBus && "is-live")} />
            </>
          ) : null}

          {/* Barramento + LOAD */}
          <circle cx="112" cy={y} r="5" className={cn("vref-junction", busLive && "is-live")} />
          <path d={`M112 ${y} V20`} className="vref-wire" />
          <path d={`M112 ${y} V20`} className={cn("vref-wire-live", busLive && "is-live")} />
          <g transform="translate(112 8)" className={cn(busLive && "vref-load-live")}>
            <rect x="-30" y="-12" width="60" height="24" rx="2" className="vref-load-card" />
            <g transform="translate(-11 0) scale(0.82)" className="vref-flow-icon">
              <path d="M-8 8h16M-6 8V1l4 2V-5l5 2v11M3 1l5 2v5" />
            </g>
            <text x="11" y="1" textAnchor="middle" className="vref-load-title">
              {powerBlockLabel}
            </text>
            <text x="11" y="10" textAnchor="middle" className="vref-load-power">
              {formatKw(powerBlockKw)}
            </text>
          </g>

          <path d={`M112 ${y} H148`} className="vref-wire" />
          <path d={`M112 ${y} H148`} className={cn("vref-wire-live", genToBus && "is-live")} />

          <HorizontalContact x1={148} x2={168} y={y} closed={gcb} known={gcbKnown} hinge="right" />
          <FlowButton
            x={158}
            y={y + 36}
            label={gcbLabel}
            tone={gcbTone}
            disabled={!canToggleGcb}
            busy={gcbBusy}
            onClick={() => onCommand(gcb ? "gcb_open" : "gcb_close")}
          />

          <path d={`M168 ${y} H188`} className="vref-wire" />
          <path d={`M168 ${y} H188`} className={cn("vref-wire-live", genSideLive && "is-live")} />

          {/* Gerador */}
          <g transform={`translate(208 ${y})`}>
            <circle
              r="20"
              className={cn(
                "vref-device",
                "generator",
                !generatorKnown ? "is-unknown" : generatorPresent ? "is-live" : "is-idle",
              )}
            />
            <text
              x="-0.6"
              y="1.2"
              textAnchor="middle"
              dominantBaseline="middle"
              className="vref-generator-letter"
            >
              G
            </text>
          </g>
          <text x="208" y={y - 26} textAnchor="middle" className="vref-flow-frequency">
            {formatHz(generatorFrequency)}
          </text>

          {/* Energia: traço lento dentro do fio */}
          {hasMainsSource ? (
            <>
              <FlowEnergy d="M46 58 H112 V20" active={mainsToBus} />
              <FlowEnergy d="M46 58 H56" active={mainsSideLive && !mainsToBus} />
            </>
          ) : null}
          <FlowEnergy d="M188 58 H112 V20" active={genToBus} />
          <FlowEnergy d="M188 58 H168" active={genSideLive && !genToBus} />
        </svg>

      </div>
    </section>
  );
}
