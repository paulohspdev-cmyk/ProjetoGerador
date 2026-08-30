import type { ReactNode } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RapidTrend } from "@/lib/api";
import { cn } from "@/lib/utils";

import { fmt } from "../generator-metrics";

export function KpiTile({
  label,
  value,
  sub,
  tone = "cyan",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "green" | "cyan" | "gold" | "blue" | "red";
}) {
  return (
    <div className={cn("gen-kpi", tone)}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  );
}

export function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="gen-cell">
      <p>{label}</p>
      <strong className="num">{value}</strong>
    </div>
  );
}

export function BoolFlag({
  label,
  value,
  goodWhenTrue = false,
}: {
  label: string;
  value: boolean | null;
  goodWhenTrue?: boolean;
}) {
  if (value == null) {
    return (
      <div className="gen-flag">
        <span>{label}</span>
        <b className="num text-muted-foreground">N/D</b>
      </div>
    );
  }

  const ok = goodWhenTrue ? value : !value;
  return (
    <div className="gen-flag">
      <span>{label}</span>
      <b className={cn("num", ok ? "text-online" : "text-offline")}>
        {value ? "true" : "false"}
      </b>
    </div>
  );
}

export function FlowChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flow-chip">
      <span className="flow-chip-icon">{icon}</span>
      <div className="min-w-0">
        <p>{label}</p>
        <strong className="num">{value}</strong>
      </div>
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  const digits = unit === "Hz" ? 2 : unit === "V" || unit === "RPM" ? 0 : 1;

  return (
    <div className={cn("gen-read", value == null && "opacity-60")}>
      <p>{label}</p>
      <strong className="num">
        {value == null ? "N/D" : fmt(value, digits)}
        {value != null && <span>{unit}</span>}
      </strong>
    </div>
  );
}

export function TrendCard({
  trend,
  loading,
  error,
}: {
  trend: RapidTrend | null;
  loading: boolean;
  error: string;
}) {
  const rows =
    trend?.points.map((point) => ({
      t: new Date(point.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      v: point.value,
    })) ?? [];

  return (
    <section className="gen-card gen-chart-card">
      <header className="gen-card-head">
        <h2>Histórico Rapid 24h</h2>
        <span className="num text-[10px] text-muted-foreground">
          {trend?.metric ?? "N/D"}
        </span>
      </header>
      <div className="gen-chart-body">
        {loading && (
          <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
            Consultando Rapid SCADA…
          </div>
        )}
        {!loading && error && (
          <div className="grid h-full place-items-center px-3 text-center text-[10px] text-muted-foreground">
            {error}
          </div>
        )}
        {!loading && !error && !rows.length && (
          <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
            Sem pontos no período
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} width={40} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
