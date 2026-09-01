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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct?: number | null;
  bar?: boolean;
  known?: boolean;
  tone?: MeterTone;
}) {
  const showBar = bar || pct != null;
  const hasScale = known && pct != null;
  const fill = hasScale ? Math.min(100, Math.max(0, pct)) : 0;

  return (
    <div className={cn("comap-engine", !known && "opacity-65")}>
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
      <span className="engine-value">{known ? value : "N/D"}</span>
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

  const buttons =
    vendor === "comap"
      ? [
          { label: "OFF", active: gen.mode === "OFF" || gen.mode === "STOP" },
          { label: "MAN", active: gen.mode === "MANUAL" },
          { label: "AUTO", active: gen.mode === "AUTO" },
          { label: "TEST", active: gen.mode === "TESTE" },
        ]
      : [
          {
            label: "STOP",
            active: gen.mode === "OFF" || gen.mode === "STOP",
            title: "STOP / RESET",
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

function niceGaugeMaximum(nominal: number | null) {
  if (nominal == null || !Number.isFinite(nominal) || nominal <= 0) return 500;

  const roughStep = nominal / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return niceStep * magnitude * 5;
}

export function PowerGaugeKw({
  value,
  nominal,
  rpm,
  battery,
  powerFactor = null,
}: {
  value: number | null;
  nominal: number | null;
  rpm: number | null;
  battery: number | null;
  powerFactor?: number | null;
}) {
  const hasValue = value != null && Number.isFinite(value);
  const displayMax = niceGaugeMaximum(nominal);
  const gaugeValue = hasValue ? Math.max(0, value) : 0;
  const pct = Math.min(1, gaugeValue / displayMax);
  const nominalPct =
    nominal != null && Number.isFinite(nominal) && nominal > 0
      ? Math.min(1, nominal / displayMax)
      : 0.88;
  const greenEnd = Math.min(0.76, Math.max(0.62, nominalPct - 0.13));
  const amberEnd = Math.min(0.92, Math.max(greenEnd + 0.08, nominalPct));

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

  const labels = Array.from({ length: 6 }, (_, index) => {
    const fraction = index / 5;
    const angle = 180 + fraction * 180;
    const rad = (angle * Math.PI) / 180;
    const radius = 132;

    return {
      index,
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius + 3,
      text: fmt(displayMax * fraction, 0),
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
      <div className="generator-power-meta" aria-label="Dados auxiliares do instrumento">
        <span>
          <b>RPM:</b>
          <strong>{rpm == null ? "N/D" : fmt(rpm, 0)}</strong>
        </span>
        <span>
          <b>PF:</b>
          <strong>{powerFactor == null ? "N/D" : fmt(powerFactor, 2)}</strong>
        </span>
      </div>

      <svg
        viewBox="0 0 300 205"
        className="generator-power-gauge"
        role="img"
        aria-label={value == null ? "Potência indisponível" : `Potência ${fmt(value, 0)} kW`}
      >
        <path d={arcPath} pathLength="100" className="generator-gauge-base" />
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

        {labels.map((label) => (
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
          className={cn("generator-gauge-needle", !hasValue && "is-unknown")}
        />
        <circle cx={cx} cy={cy} r="7.5" className="generator-gauge-hub" />
        <circle cx={cx} cy={cy} r="2.6" className="generator-gauge-hub-center" />
      </svg>

      <div className="generator-power-readout">
        <strong>{value == null ? "N/D" : fmt(value, 0)}</strong>
        <span>kW</span>
      </div>

      <div className={cn("generator-battery-badge", battery == null && "is-unknown")}>
        <svg className="generator-battery-icon" viewBox="0 0 24 16" aria-hidden="true">
          <rect x="1" y="3" width="20" height="12" rx="1.5" />
          <path d="M21 7h2v4h-2M5 7v4M3 9h4M15 7v4" />
        </svg>
        <span>BAT</span>
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
