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
