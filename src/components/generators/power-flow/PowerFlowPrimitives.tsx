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
        <span className={cn("comap-meter", !known && "is-unknown", known && pct == null && "is-unscaled")}>
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
    <div className="controller-mode-wrap" aria-label={`Modos ${vendor === "comap" ? "ComAp" : "DSE"}`}>
      <div className="controller-mode-bar">
        {buttons.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled
            title={`${item.title ?? item.label} — comando de modo ainda não homologado`}
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
}: {
  value: number | null;
  nominal: number | null;
}) {
  const hasScale = value != null && nominal != null && nominal > 0;
  const pct = hasScale
    ? Math.min(1, Math.max(0, value / nominal))
    : 0;
  const angle = -130 + pct * 260;
  const rad = (angle * Math.PI) / 180;
  const cx = 120;
  const cy = 126;
  const needle = 73;
  const nx = cx + Math.cos(rad) * needle;
  const ny = cy + Math.sin(rad) * needle;

  return (
    <div className="kw-gauge-wrap">
      <svg
        viewBox="0 0 240 165"
        className="kw-gauge-svg"
        role="img"
        aria-label={value == null ? "Potência indisponível" : `Potência ${fmt(value, 0)} kW`}
      >
        <path d="M35 126 A85 85 0 0 1 205 126" pathLength="100" className="kw-gauge-base" />
        <path
          d="M35 126 A85 85 0 0 1 205 126"
          pathLength="100"
          className="kw-gauge-zone kw-gauge-green"
          strokeDasharray="76 24"
        />
        <path
          d="M35 126 A85 85 0 0 1 205 126"
          pathLength="100"
          className="kw-gauge-zone kw-gauge-amber"
          strokeDasharray="24 76"
          strokeDashoffset="-76"
        />
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          className={cn("kw-gauge-needle", !hasScale && "is-unknown")}
        />
        <circle cx={cx} cy={cy} r="7" className="kw-gauge-hub" />
        <text x="30" y="151" className="kw-gauge-scale">
          0
        </text>
        <text x="210" y="151" textAnchor="end" className="kw-gauge-scale">
          {nominal != null && nominal > 0 ? fmt(nominal, 0) : "N/D"}
        </text>
        <text x="120" y="111" textAnchor="middle" className="kw-gauge-unit">
          kW
        </text>
      </svg>
      <div className="kw-gauge-value">{value == null ? "N/D" : fmt(value, 0)}</div>
      <div className="kw-gauge-caption">
        {nominal != null && nominal > 0
          ? `Nominal ${fmt(nominal, 0)} kW`
          : "Escala nominal não homologada"}
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
        title={`${label}: ${stateLabel}. Comando de contato ainda não homologado.`}
        aria-label={`${label} ${stateLabel}`}
        className="breaker-single-button"
      >
        I/O
      </button>
      <small>{stateLabel}</small>
    </div>
  );
}
