import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { useScadaOps } from "./ScadaOpsProvider";

export function ScreenBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-5 3xl:p-6">
      {children}
    </div>
  );
}

export type StatItem = {
  label: string;
  value: string | number;
  sub?: string | undefined;
  tone?: string | undefined;
  icon?: LucideIcon | undefined;
};

export function Stats({ items }: { items: StatItem[] }) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        items.length <= 2 && "grid-cols-1 min-[420px]:grid-cols-2",
        items.length === 3 && "grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3",
        items.length === 4 && "grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4",
        items.length >= 5 && "grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]"
        >
          {item.icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
              <item.icon className={cn("size-4.5", item.tone ?? "text-primary")} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className={cn("num break-words text-xl font-extrabold leading-tight", item.tone)}>
              {item.value}
            </p>
            {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3">
        <h2 className="min-w-0 break-words text-[13px] font-extrabold uppercase tracking-[0.06em] text-foreground/85">
          {title}
        </h2>
        {actions && <div className="scroll-slim max-w-full overflow-x-auto">{actions}</div>}
      </header>
      <div className="min-w-0 p-3.5">{children}</div>
    </section>
  );
}

export function Tone({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ok" | "warn" | "err" | "info" | "muted";
}) {
  const map = {
    ok: "text-online",
    warn: "text-alert",
    err: "text-offline",
    info: "text-chart-2",
    muted: "text-muted-foreground",
  };
  return <span className={cn("num font-semibold", map[tone])}>{children}</span>;
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "err" | "info" | "muted" | undefined;
}) {
  const map = {
    ok: "border-online/40 bg-online/15 text-online",
    warn: "border-alert/40 bg-alert/15 text-alert",
    err: "border-offline/40 bg-offline/15 text-offline",
    info: "border-chart-2/40 bg-chart-2/15 text-chart-2",
    muted: "border-border bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "num inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-bold",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}

type Col<T> = { label: string; hide?: string | undefined; render: (row: T) => ReactNode };

export function ScadaTable<T extends { id: string | number }>({
  columns,
  rows,
  min = "640px",
}: {
  columns: Col<T>[];
  rows: T[];
  min?: string | undefined;
}) {
  return (
    <div className="scroll-slim min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth: min }}>
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {columns.map((column) => (
              <th key={column.label} className={cn("px-3 py-2.5 text-left font-bold", column.hide)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30">
              {columns.map((column) => (
                <td key={column.label} className={cn("px-3 py-2.5 align-top", column.hide)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
      )}
    </div>
  );
}

export function Trend({
  data,
  color = "var(--online)",
  unit,
}: {
  data: Array<{ t: string; v: number }>;
  color?: string | undefined;
  unit?: string | undefined;
}) {
  return (
    <div className="h-48 min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={40} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
            formatter={(value: number) => [`${value}${unit ? ` ${unit}` : ""}`, "Valor"]}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            fill={color}
            fillOpacity={0.18}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SwitchRow({
  id,
  label,
  desc,
  on = true,
}: {
  id: string;
  label: string;
  desc?: string | undefined;
  on?: boolean | undefined;
}) {
  const { switchOn, toggleSwitch } = useScadaOps();
  const checked = switchOn(id, on);
  return (
    <button
      type="button"
      onClick={() => toggleSwitch(id, on)}
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-secondary/40"
    >
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">{label}</p>
        {desc && <p className="break-words text-xs text-muted-foreground">{desc}</p>}
      </div>
      <span
        className={cn(
          "num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
          checked ? "bg-online/20 text-online" : "bg-secondary text-muted-foreground",
        )}
      >
        {checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}

export function ActionBtn({
  children,
  onClick,
  tone = "default",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "ok" | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "max-w-full rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger" && "border-offline/40 text-offline hover:bg-offline/10",
        tone === "ok" && "border-online/40 text-online hover:bg-online/10",
        tone === "default" && "border-border",
      )}
    >
      {children}
    </button>
  );
}
