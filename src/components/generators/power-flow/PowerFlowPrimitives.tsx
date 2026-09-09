import type { ReactNode } from "react";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

import { fmt } from "../generator-metrics";
import "../kw-gauge-reference.css";

type MeterTone = "good" | "warning" | "critical" | "neutral";

export function EngineRow({
  icon,
  label,
  value,
  pct = null,
  bar = false,
  known = true,
  tone = "neutral",
  lastKnown = false,
  unknownLabel = "N/D",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct?: number | null;
  bar?: boolean;
  known?: boolean;
  tone?: MeterTone;
  lastKnown?: boolean;
  unknownLabel?: string;
}) {
  const showBar = bar || pct != null;
  const hasScale = known && pct != null;
  const fill = hasScale ? Math.min(100, Math.max(0, pct)) : 0;

  return (
    <div className={cn("comap-engine", !known && "is-unknown", lastKnown && "is-last-known")}>
      {icon}
      <span className="engine-label">{label}</span>
      {showBar ? (
        <span
          className={cn(
            "comap-meter",
            `is-${tone}`,
            !known && "is-unknown",
            known && pct == null && "is-unscaled",
          )}
        >
          <i style={{ width: `${fill}%` }} />
        </span>
      ) : (
        <span />
      )}
      <span className="engine-value">
        {known ? value : unknownLabel}
        {known && lastKnown && <small>ÚLT.</small>}
      </span>
    </div>
  );
}

function controllerVendor(gen: Generator): "comap" | "dse" | "generic" {
  const text = `${gen.controllerType ?? ""} ${gen.controller}`.toLowerCase();
  if (text.includes("dse") || text.includes("deep sea")) return "dse";
  if (text.includes("comap") || text.includes("inteli")) return "comap";
  return "generic";
}

export function ControllerModeBar({ gen, known }: { gen: Generator; known: boolean }) {
  const vendor = controllerVendor(gen);
  if (vendor === "generic") {
    return (
      <div className="controller-mode-generic">
        <span>MODE</span>
        <b>{known ? gen.mode : "N/D"}</b>
      </div>
    );
  }

  const buttons = [
    {
      label: "OFF",
      active: gen.mode === "OFF" || gen.mode === "STOP",
      title: vendor === "dse" ? "OFF / STOP-RESET" : "OFF",
    },
    { label: "MAN", active: gen.mode === "MANUAL" },
    { label: "AUTO", active: gen.mode === "AUTO" },
    { label: "TEST", active: gen.mode === "TESTE" },
  ];

  return (
    <div
      className="controller-mode-wrap"
      aria-label={`Modos ${vendor === "comap" ? "ComAp" : "DSE"}`}
    >
      <div className="controller-mode-bar">
        {buttons.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled
            title={`${item.title ?? item.label} — função indisponível`}
            aria-pressed={known && item.active}
            className={cn("controller-mode-btn", known && item.active && "is-active")}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function controllerGaugeMaximum(nominal: number | null) {
  return nominal != null && Number.isFinite(nominal) && nominal > 0 ? nominal : null;
}

function gaugeLabelValues(maximum: number) {
  // Cinco referências grandes e uniformes preservam a escala nominal real da controladora
  // sem amontoar valores próximos ao final do arco (ex.: 400 e 440 kW).
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maximum * fraction));
}

export function PowerGaugeKw({
  value,
  nominal,
  battery,
}: {
  value: number | null;
  nominal: number | null;
  battery: number | null;
  powerFactor?: number | null;
}) {
  const hasValue = value != null && Number.isFinite(value);
  const displayMax = controllerGaugeMaximum(nominal);
  const gaugeValue = hasValue ? Math.max(0, value) : 0;
  const pct = displayMax == null ? 0 : Math.min(1, gaugeValue / displayMax);
  const greenEnd = 0.76;
  const amberEnd = 0.92;

  const cx = 150;
  const cy = 143;
  const arcRadius = 105;
  const needleLength = 94;
  const needleAngle = 180 + pct * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleTipX = cx + Math.cos(needleRad) * needleLength;
  const needleTipY = cy + Math.sin(needleRad) * needleLength;
  const needleBackX = cx - Math.cos(needleRad) * 11;
  const needleBackY = cy - Math.sin(needleRad) * 11;
  const needleHalfWidth = 3.8;
  const needlePerpX = -Math.sin(needleRad) * needleHalfWidth;
  const needlePerpY = Math.cos(needleRad) * needleHalfWidth;
  const needlePoints = [
    `${needleTipX},${needleTipY}`,
    `${needleBackX + needlePerpX},${needleBackY + needlePerpY}`,
    `${needleBackX - needlePerpX},${needleBackY - needlePerpY}`,
  ].join(" ");

  const ticks = Array.from({ length: 51 }, (_, index) => {
    const angle = 180 + index * (180 / 50);
    const rad = (angle * Math.PI) / 180;
    const major = index % 10 === 0;
    const medium = !major && index % 5 === 0;
    const outer = 121;
    const inner = major ? 111 : medium ? 115 : 118;

    return {
      index,
      major,
      medium,
      x1: cx + Math.cos(rad) * inner,
      y1: cy + Math.sin(rad) * inner,
      x2: cx + Math.cos(rad) * outer,
      y2: cy + Math.sin(rad) * outer,
    };
  });

  const labels =
    displayMax == null
      ? [
          { index: 0, fraction: 0, text: "0" },
          { index: 1, fraction: 1, text: "N/D" },
        ]
      : gaugeLabelValues(displayMax).map((labelValue, index) => ({
          index,
          fraction: labelValue / displayMax,
          text: fmt(labelValue, 0),
        }));

  const positionedLabels = labels.map((label) => {
    const angle = 180 + label.fraction * 180;
    const rad = (angle * Math.PI) / 180;
    const radius = 128;
    return {
      ...label,
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius + 3,
    };
  });

  const arcPath = `M${cx - arcRadius} ${cy} A${arcRadius} ${arcRadius} 0 0 1 ${
    cx + arcRadius
  } ${cy}`;
  const greenPct = greenEnd * 100;
  const amberPct = (amberEnd - greenEnd) * 100;
  const redPct = Math.max(0, 100 - amberEnd * 100);

  return (
    <div className="generator-power-instrument">
      <svg
        viewBox="0 0 300 205"
        className="generator-power-gauge"
        role="img"
        aria-label={value == null ? "Potência indisponível" : `Potência ${fmt(value, 0)} kW`}
      >
        <path d={arcPath} pathLength="100" className="generator-gauge-base" />
        {displayMax != null && (
          <>
            <path
              d={arcPath}
              pathLength="100"
              className="generator-gauge-zone generator-gauge-green"
              strokeDasharray={`${greenPct} ${100 - greenPct}`}
            />
            <path
              d={arcPath}
              pathLength="100"
              className="generator-gauge-zone generator-gauge-amber"
              strokeDasharray={`${amberPct} ${100 - amberPct}`}
              strokeDashoffset={-greenPct}
            />
            <path
              d={arcPath}
              pathLength="100"
              className="generator-gauge-zone generator-gauge-red"
              strokeDasharray={`${redPct} ${100 - redPct}`}
              strokeDashoffset={-(greenPct + amberPct)}
            />
          </>
        )}

        {ticks.map((tick) => (
          <line
            key={tick.index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            className={cn(
              "generator-gauge-tick",
              tick.major && "is-major",
              tick.medium && "is-medium",
            )}
          />
        ))}

        {positionedLabels.map((label) => (
          <text
            key={label.index}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            className="generator-gauge-scale"
          >
            {label.text}
          </text>
        ))}

        <polygon
          points={needlePoints}
          className={cn(
            "generator-gauge-needle",
            (!hasValue || displayMax == null) && "is-unknown",
          )}
        />
        <circle cx={cx} cy={cy} r="7.5" className="generator-gauge-hub" />
        <circle cx={cx} cy={cy} r="2.6" className="generator-gauge-hub-center" />
      </svg>

      <div className="generator-power-readout">
        <strong>{value == null ? "N/D" : fmt(value, 0)}</strong>
      </div>

      <div
        className={cn("generator-battery-badge", battery == null && "is-unknown")}
        aria-label="Tensão da bateria"
      >
        <svg className="generator-battery-icon" viewBox="0 0 24 16" aria-hidden="true">
          <rect x="1" y="3" width="20" height="12" rx="1.5" />
          <path d="M21 7h2v4h-2M5 7v4M3 9h4M15 7v4" />
        </svg>
        <b>{battery == null ? "N/D" : `${fmt(battery)} V`}</b>
      </div>
    </div>
  );
}

export function BreakerControl({
  label,
  known,
  closed,
}: {
  label: "MCB" | "GCB";
  known: boolean;
  closed: boolean;
}) {
  const state = !known ? "unknown" : closed ? "closed" : "open";
  const stateLabel = !known ? "N/D" : closed ? "FECHADO" : "ABERTO";

  return (
    <div className={cn("breaker-single-control", `is-${state}`)}>
      <span className="breaker-single-label">{label}</span>
      <span className="breaker-state-track" aria-hidden>
        <i />
      </span>
      <button
        type="button"
        disabled
        title={`${label}: ${stateLabel}. Comando de contato indisponível.`}
        aria-label={`${label} ${stateLabel}`}
        className="breaker-single-button"
      >
        I/O
      </button>
      <small>{stateLabel}</small>
    </div>
  );
}
