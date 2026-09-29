import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMetric } from "../generator-metrics";
import type { GeneratorDetailTrendMap } from "./useGeneratorDetailData";

export type TrendSeriesSpec = {
  key: string;
  label: string;
  unit: string;
  current: number | null | undefined;
  digits?: number;
  tone: string;
};

export function unitText(value: number | null | undefined, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return formatMetric(value, unit, digits);
}

function normalizedTrendTime(value: string, periodHours: number) {
  const normalized = value.replace(/\.(\d{3})\d*Z$/, ".$1Z");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  if (periodHours > 24) {
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
    });
  }
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function addGapBreaks(rows: Array<Record<string, string | number | null>>, periodHours: number) {
  if (rows.length < 3) return rows;
  const parsed = rows
    .map((row) => new Date(String(row["timestamp"])).getTime())
    .filter(Number.isFinite);
  const deltas = parsed
    .slice(1)
    .map((value, index) => value - parsed[index]!)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (!deltas.length) return rows;
  const median = deltas[Math.floor(deltas.length / 2)]!;
  const threshold = median * 3;
  const result: Array<Record<string, string | number | null>> = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (index > 0) {
      const previous = rows[index - 1]!;
      const previousTime = new Date(String(previous["timestamp"])).getTime();
      const currentTime = new Date(String(row["timestamp"])).getTime();
      if (
        Number.isFinite(previousTime) &&
        Number.isFinite(currentTime) &&
        currentTime - previousTime > threshold
      ) {
        const midpoint = new Date(previousTime + (currentTime - previousTime) / 2).toISOString();
        result.push({ timestamp: midpoint, time: normalizedTrendTime(midpoint, periodHours) });
      }
    }
    result.push(row);
  }
  return result;
}

function mergeTrendRows(
  series: TrendSeriesSpec[],
  trends: GeneratorDetailTrendMap,
  periodHours: number,
) {
  const rows = new Map<string, Record<string, string | number | null>>();
  for (const item of series) {
    const trend = trends[item.key];
    if (!trend) continue;
    for (const point of trend.points) {
      const row = rows.get(point.timestamp) ?? {
        timestamp: point.timestamp,
        time: normalizedTrendTime(point.timestamp, periodHours),
      };
      row[item.key] = point.value;
      rows.set(point.timestamp, row);
    }
  }
  return addGapBreaks(
    [...rows.values()].sort((a, b) => String(a["timestamp"]).localeCompare(String(b["timestamp"]))),
    periodHours,
  );
}

export function HistoryPanel({
  title,
  subtitle,
  series,
  trends,
  configuredTrendMetrics,
  trendErrors,
  loading,
  periodHours,
  periodLabel,
}: {
  title: string;
  subtitle?: string | undefined;
  series: TrendSeriesSpec[];
  trends: GeneratorDetailTrendMap;
  configuredTrendMetrics: Set<string>;
  trendErrors: Record<string, string>;
  loading: boolean;
  periodHours: number;
  periodLabel: string;
}) {
  const rows = mergeTrendRows(series, trends, periodHours);
  const hasConfigured = series.some((item) => configuredTrendMetrics.has(item.key));
  const activeSeries = series.filter((item) => trends[item.key]?.points.length);
  const error = series.map((item) => trendErrors[item.key]).find(Boolean);

  return (
    <section className="gen-detail-section flex h-full min-h-0 flex-col overflow-hidden rounded-xl p-2">
      <div className="mb-1 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[11px] font-extrabold">{title}</h2>
          <p className="truncate text-[9px] text-muted-foreground">
            {subtitle ?? `Histórico real · últimas ${periodLabel}`}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-online/25 bg-online/5 px-1.5 py-0.5 text-[8px] font-bold text-online">
          <i className="size-1.5 rounded-full bg-current" />
          {periodHours === 168 ? "7D" : `${periodHours}H`}
        </span>
      </div>

      <div className="mb-1 flex min-h-[20px] shrink-0 flex-wrap gap-x-2 gap-y-0.5">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1 text-[9px]">
            <i className="size-1.5 rounded-full" style={{ background: item.tone }} />
            <span className="text-muted-foreground">{item.label}</span>
            <b className="num">{unitText(item.current, item.unit, item.digits ?? 0)}</b>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {loading && !rows.length ? (
          <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
            Carregando histórico…
          </div>
        ) : rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 5, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
              <XAxis
                dataKey="time"
                minTickGap={32}
                tick={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={42}
                tick={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 10,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
              />
              {activeSeries.map((item) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={(item.label + " " + item.unit).trim()}
                  stroke={item.tone}
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-[10px] text-muted-foreground">
            {error
              ? "Histórico temporariamente indisponível"
              : hasConfigured
                ? "Sem pontos definidos nas últimas 24h"
                : "Canal histórico não provisionado nesta controladora"}
          </div>
        )}
      </div>
    </section>
  );
}

export function MiniTrendCard({
  title,
  metric,
  unit,
  value,
  digits,
  tone,
  trends,
  configuredTrendMetrics,
  loading,
  periodHours,
}: {
  title: string;
  metric: string;
  unit: string;
  value: number | null | undefined;
  digits?: number;
  tone: string;
  trends: GeneratorDetailTrendMap;
  configuredTrendMetrics: Set<string>;
  loading: boolean;
  periodHours: number;
}) {
  const trend = trends[metric];
  const rows = addGapBreaks(
    trend?.points.map((point) => ({
      timestamp: point.timestamp,
      time: normalizedTrendTime(point.timestamp, periodHours),
      value: point.value,
    })) ?? [],
    periodHours,
  );
  const configured = configuredTrendMetrics.has(metric);

  return (
    <section className="gen-detail-section flex h-full min-h-0 flex-col overflow-hidden rounded-lg px-2 py-1.5">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="truncate text-[9px] font-bold text-muted-foreground">{title}</span>
        <b className="num shrink-0 text-[11px]">{unitText(value, unit, digits ?? 0)}</b>
      </div>
      <div className="mt-1 min-h-0 flex-1">
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 2, right: 1, left: 1, bottom: 1 }}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={tone}
                strokeWidth={1.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-center text-[8px] text-muted-foreground">
            {loading && configured ? "Carregando…" : configured ? "Sem histórico" : "N/D"}
          </div>
        )}
      </div>
    </section>
  );
}
