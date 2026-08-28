import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { useScadaOps } from "./ScadaOpsProvider";

export function ScreenBody({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-6 3xl:p-8">
      {children}
    </div>
  );
}

export type StatItem = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
  icon?: LucideIcon;
};

export function Stats({ items }: { items: StatItem[] }) {
  return (
    <div
      className={cn(
        "grid gap-2",
        items.length <= 2 && "grid-cols-2",
        items.length === 3 && "grid-cols-2 md:grid-cols-3",
        items.length === 4 && "grid-cols-2 lg:grid-cols-4",
        items.length >= 5 && "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
      )}
    >
      {items.map((c) => (
        <div key={c.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2.5">
          {c.icon && (
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
              <c.icon className={cn("size-4", c.tone ?? "text-primary")} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">{c.label}</p>
            <p className={cn("num text-lg font-bold leading-tight", c.tone)}>{c.value}</p>
            {c.sub && <p className="truncate text-[10px] text-muted-foreground">{c.sub}</p>}
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
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {actions}
      </header>
      <div className="p-3">{children}</div>
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
  tone?: "ok" | "warn" | "err" | "info" | "muted";
}) {
  const map = {
    ok: "border-online/40 bg-online/15 text-online",
    warn: "border-alert/40 bg-alert/15 text-alert",
    err: "border-offline/40 bg-offline/15 text-offline",
    info: "border-chart-2/40 bg-chart-2/15 text-chart-2",
    muted: "border-border bg-secondary text-muted-foreground",
  };
  return (
    <span className={cn("num rounded-sm border px-1.5 py-0.5 text-[10px] font-bold", map[tone])}>
      {children}
    </span>
  );
}

type Col<T> = { label: string; hide?: string; render: (row: T) => ReactNode };

export function ScadaTable<T extends { id: string }>({
  columns,
  rows,
  min = "720px",
}: {
  columns: Col<T>[];
  rows: T[];
  min?: string;
}) {
  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="w-full border-collapse text-[12px]" style={{ minWidth: min }}>
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            {columns.map((c) => (
              <th key={c.label} className={cn("px-2 py-2 text-left font-semibold", c.hide)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30">
              {columns.map((c) => (
                <td key={c.label} className={cn("px-2 py-2", c.hide)}>
                  {c.render(row)}
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
  color?: string;
  unit?: string;
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={36} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
            formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ""}`, "Valor"]}
          />
          <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} />
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
  desc?: string;
  on?: boolean;
}) {
  const { switchOn, toggleSwitch } = useScadaOps();
  const checked = switchOn(id, on);
  return (
    <button
      type="button"
      onClick={() => toggleSwitch(id, on)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-secondary/40"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      <span
        className={cn(
          "num rounded-full px-2 py-0.5 text-[10px] font-bold",
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
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "ok";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-2 py-0.5 text-[11px] font-semibold hover:bg-secondary",
        tone === "danger" && "border-offline/40 text-offline hover:bg-offline/10",
        tone === "ok" && "border-online/40 text-online hover:bg-online/10",
        tone === "default" && "border-border",
      )}
    >
      {children}
    </button>
  );
}
