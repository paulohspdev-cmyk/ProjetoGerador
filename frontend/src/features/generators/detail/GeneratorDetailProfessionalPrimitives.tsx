import type { ReactNode } from "react";

import type { MetricLimit } from "@/data/generators";
import { cn } from "@/lib/utils";

export type MetricTone = "ok" | "warn" | "err" | "info";

export function metricTone(value: number | null, limit?: MetricLimit): MetricTone {
  if (value == null) return "info";
  if (
    (limit?.criticalLow != null && value <= limit.criticalLow) ||
    (limit?.criticalHigh != null && value >= limit.criticalHigh)
  )
    return "err";
  if (
    (limit?.warningLow != null && value <= limit.warningLow) ||
    (limit?.warningHigh != null && value >= limit.warningHigh)
  )
    return "warn";
  return "ok";
}

export function toneClass(tone: MetricTone) {
  if (tone === "err") return "text-offline";
  if (tone === "warn") return "text-alert";
  if (tone === "ok") return "text-online";
  return "text-chart-2";
}

export function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "info",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: MetricTone;
}) {
  return (
    <div className="gen-detail-section flex min-w-0 items-center gap-3 rounded-xl p-3.5">
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl border border-white/5 bg-black/15",
          toneClass(tone),
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-muted-foreground">{label}</p>
        <p className="num mt-0.5 truncate text-[22px] font-extrabold tracking-tight">{value}</p>
        {sub && <p className={cn("mt-0.5 truncate text-[10px]", toneClass(tone))}>{sub}</p>}
      </div>
    </div>
  );
}

export function MetricGauge({
  label,
  value,
  unit,
  limit,
  digits = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  limit?: MetricLimit | undefined;
  digits?: number;
}) {
  const tone = metricTone(value, limit);
  const min = limit?.displayMin;
  const max = limit?.displayMax;
  const scaled = value != null && min != null && max != null && max > min;
  const pct = scaled ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  const color =
    tone === "err"
      ? "var(--offline)"
      : tone === "warn"
        ? "var(--alert)"
        : tone === "ok"
          ? "var(--online)"
          : "var(--info)";

  return (
    <div className="rounded-xl border border-border/65 bg-background/25 p-3 text-center">
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <div
        className="mx-auto mt-3 grid size-24 place-items-center rounded-full"
        style={{
          background: scaled
            ? `conic-gradient(from 225deg, ${color} 0 ${pct * 0.75}%, rgba(79,112,132,.18) ${pct * 0.75}% 75%, transparent 75% 100%)`
            : `conic-gradient(from 225deg, rgba(79,112,132,.22) 0 75%, transparent 75% 100%)`,
        }}
      >
        <div className="grid size-[72px] place-items-center rounded-full bg-card">
          <div>
            <b className={cn("num block text-xl", toneClass(tone))}>
              {value == null ? "N/D" : value.toFixed(digits).replace(".", ",")}
            </b>
            {value != null && <span className="text-[9px] text-muted-foreground">{unit}</span>}
          </div>
        </div>
      </div>
      <p className={cn("mt-1 text-[10px] font-semibold", toneClass(tone))}>
        {value == null
          ? "Sem leitura"
          : tone === "err"
            ? "Crítico"
            : tone === "warn"
              ? "Atenção"
              : tone === "ok"
                ? "Normal"
                : "Leitura"}
      </p>
    </div>
  );
}

export function SemiGauge({
  label,
  value,
  unit,
  min,
  max,
  color,
  status,
  digits = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  color: string;
  status: string;
  digits?: number;
}) {
  const span = Math.max(1, max - min);
  const fraction = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / span));
  const radius = 42;
  const length = Math.PI * radius;
  return (
    <div className="min-w-0 text-center">
      <p className="text-[10px] font-semibold leading-tight text-muted-foreground">{label}</p>
      <svg viewBox="0 0 120 78" className="mx-auto h-16 w-full" aria-hidden>
        <path
          d="M16 66 A44 44 0 0 1 104 66"
          fill="none"
          stroke="rgba(120,150,170,.22)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M16 66 A44 44 0 0 1 104 66"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${length * fraction} ${length}`}
        />
        <text x="60" y="58" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="800">
          {value == null ? "—" : value.toFixed(digits).replace(".", ",")}
        </text>
      </svg>
      <div className="num -mt-1 flex justify-between px-0.5 text-[9px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {status ? (
        <p className="text-[11px] font-semibold" style={{ color }}>
          {status}
        </p>
      ) : null}
      {unit ? <p className="text-[9px] text-muted-foreground">{unit}</p> : null}
    </div>
  );
}

/** Relógio semicircular com zonas G/Y/R e agulha (estilo console). */
export function NeedleGauge({
  label,
  unit,
  value,
  max,
  digits = 0,
}: {
  label: string;
  unit: string;
  value: number | null;
  max: number | null;
  digits?: number;
}) {
  const known = value != null && Number.isFinite(value);
  const hasScale = max != null && Number.isFinite(max) && max > 0;
  const safeMax = hasScale ? max : 1;
  const fraction = known && hasScale ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const angle = fraction * 180 - 90;
  const cx = 70;
  const cy = 62;
  const r = 48;
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const valueLabel = known
    ? value.toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
  const maxLabel = hasScale ? Math.round(safeMax).toLocaleString("pt-BR") : "N/D";

  return (
    <div className="gen-needle-gauge min-w-0 text-center">
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground">{label}</p>
      <svg
        viewBox="0 0 140 108"
        className="mx-auto h-[68px] w-full"
        aria-label={`${label} ${valueLabel} ${unit}`}
      >
        <path className="gen-needle-base" pathLength={100} d={arc} />
        {hasScale ? (
          <>
            <path
              className="gen-needle-zone is-green"
              pathLength={100}
              strokeDasharray="70 30"
              d={arc}
            />
            <path
              className="gen-needle-zone is-yellow"
              pathLength={100}
              strokeDasharray="20 80"
              strokeDashoffset={-70}
              d={arc}
            />
            <path
              className="gen-needle-zone is-red"
              pathLength={100}
              strokeDasharray="10 90"
              strokeDashoffset={-90}
              d={arc}
            />
          </>
        ) : null}
        <text x={cx - r} y={cy + 22} textAnchor="middle" className="gen-needle-scale">
          0
        </text>
        <text x={cx + r} y={cy + 22} textAnchor="middle" className="gen-needle-scale">
          {maxLabel}
        </text>
        {known && hasScale ? (
          <g transform={`rotate(${angle} ${cx} ${cy})`}>
            <line
              className="gen-needle-pointer"
              x1={cx}
              y1={cy - 6}
              x2={cx}
              y2={cy - r + 10}
            />
          </g>
        ) : null}
        <circle cx={cx} cy={cy} r="5" className="gen-needle-hub" />
        <text x={cx} y={cy - 14} textAnchor="middle" className="gen-needle-unit">
          {unit}
        </text>
        <text x={cx} y={cy + 36} textAnchor="middle" className="gen-needle-value">
          {valueLabel}
        </text>
      </svg>
    </div>
  );
}

export function HealthRing({ score, label }: { score: number | null; label: string }) {
  const radius = 46;
  const length = 2 * Math.PI * radius;
  const tone =
    score == null
      ? "var(--muted-foreground)"
      : score >= 85
        ? "var(--online)"
        : score >= 60
          ? "var(--alert)"
          : "var(--offline)";
  return (
    <div className="grid justify-items-center">
      <p className="mb-2 text-[11px] text-muted-foreground">Score de saúde</p>
      <svg
        viewBox="0 0 120 120"
        className="size-24"
        aria-label={score == null ? "Score não disponível" : `Score ${score}`}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(120,150,170,.22)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${((score ?? 0) / 100) * length} ${length}`}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="66"
          textAnchor="middle"
          fill="currentColor"
          fontSize={score == null ? 16 : 28}
          fontWeight="800"
        >
          {score == null ? "N/D" : score}
        </text>
      </svg>
      <p className="text-sm font-bold" style={{ color: tone }}>
        {label}
      </p>
    </div>
  );
}

export function FlowNode({
  icon,
  label,
  value,
  sub,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[112px] rounded-xl border bg-background/25 p-3 text-center",
        active ? "border-primary/55 shadow-[0_0_24px_rgba(255,107,0,.07)]" : "border-border/65",
      )}
    >
      <span
        className={cn(
          "mx-auto grid size-11 place-items-center rounded-lg",
          active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <b className="mt-2 block text-xs">{label}</b>
      <span className="num mt-2 block text-sm font-extrabold">{value}</span>
      {sub && <span className="mt-0.5 block text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
