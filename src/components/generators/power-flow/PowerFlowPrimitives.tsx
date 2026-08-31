import type { ReactNode } from "react";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

import { fmt } from "../generator-metrics";

export function EngineRow({
  icon,
  label,
  value,
  pct = null,
  bar = false,
  known = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct?: number | null;
  bar?: boolean;
  known?: boolean;
}) {
  const hasScale = known && bar && pct != null;
  const fill = hasScale ? Math.min(100, Math.max(0, pct)) : 0;

  return (
    <div className={cn("comap-engine", !known && "opacity-65")}>
      {icon}
      <span className="engine-label">{label}</span>
      {bar ? (
        <span
          className={cn(
            "comap-meter",
            !known && "is-unknown",
            known && pct == null && "is-unscaled",
          )}
        >
          <i
            style={{
              width: `${fill}%`,
              background: hasScale ? "var(--primary)" : "transparent",
            }}
          />
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
  const hasScale = value != null && nominal != null && nominal > 0;
  const pct = hasScale ? Math.min(1, Math.max(0, value / nominal)) : 0;
  const cx = 120;
  const cy = 123;
  const needleLength = 68;
  const needleAngle = 180 + pct * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const nx = cx + Math.cos(needleRad) * needleLength;
  const ny = cy + Math.sin(needleRad) * needleLength;
  const ticks = Array.from({ length: 11 }, (_, index) => {
    const angle = 180 + index * 18;
    const rad = (angle * Math.PI) / 180;
    const outer = 101;
    const inner = index % 5 === 0 ? 91 : 95;
    return {
      index,
      x1: cx + Math.cos(rad) * inner,
      y1: cy + Math.sin(rad) * inner,
      x2: cx + Math.cos(rad) * outer,
      y2: cy + Math.sin(rad) * outer,
    };
  });
  const labels = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const angle = 180 + fraction * 180;
    const rad = (angle * Math.PI) / 180;
    const radius = 111;
    return {
      fraction,
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius + 3,
      text:
        nominal != null && nominal > 0
          ? fmt(nominal * fraction, 0)
          : fraction === 0
            ? "0"
            : fraction === 1
              ? "N/D"
              : "",
    };
  });

  return (
    <div className="kw-instrument">
      <div className="kw-instrument-meta" aria-label="Dados auxiliares do instrumento">
        <span>
          <b>RPM:</b> {rpm == null ? "N/D" : fmt(rpm, 0)}
        </span>
        <span>
          <b>PF:</b> {powerFactor == null ? "N/D" : fmt(powerFactor, 2)}
        </span>
      </div>

      <svg
        viewBox="0 0 240 165"
        className="kw-gauge-svg"
        role="img"
        aria-label={value == null ? "Potência indisponível" : `Potência ${fmt(value, 0)} kW`}
      >
        <path d="M34 123 A86 86 0 0 1 206 123" pathLength="100" className="kw-gauge-base" />
        <path
          d="M34 123 A86 86 0 0 1 206 123"
          pathLength="100"
          className="kw-gauge-zone kw-gauge-green"
          strokeDasharray="72 28"
        />
        <path
          d="M34 123 A86 86 0 0 1 206 123"
          pathLength="100"
          className="kw-gauge-zone kw-gauge-amber"
          strokeDasharray="14 86"
          strokeDashoffset="-72"
        />
        <path
          d="M34 123 A86 86 0 0 1 206 123"
          pathLength="100"
          className="kw-gauge-zone kw-gauge-red"
          strokeDasharray="14 86"
          strokeDashoffset="-86"
        />

        {ticks.map((tick) => (
          <line
            key={tick.index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            className={cn("kw-gauge-tick", tick.index % 5 === 0 && "is-major")}
          />
        ))}

        {labels.map((label) =>
          label.text ? (
            <text
              key={label.fraction}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              className="kw-gauge-scale"
            >
              {label.text}
            </text>
          ) : null,
        )}

        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          className={cn("kw-gauge-needle", !hasScale && "is-unknown")}
        />
        <circle cx={cx} cy={cy} r="8" className="kw-gauge-hub" />
      </svg>

      <div className="kw-gauge-readout">
        <strong>{value == null ? "N/D" : fmt(value, 0)}</strong>
        <span>kW</span>
      </div>

      <div className={cn("kw-battery-badge", battery == null && "is-unknown")}>
        <span>BAT</span>
        <b>{battery == null ? "N/D" : `${fmt(battery)} V`}</b>
      </div>

      <div className="kw-gauge-caption">
        {nominal != null && nominal > 0
          ? `ESCALA ${fmt(nominal, 0)} kW`
          : "ESCALA NOMINAL N/D"}
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
