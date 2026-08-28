import { type ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { fmt } from "./PowerFlowCard";

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

export function Readout({
  label,
  value,
  unit,
  tone = "ok",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className={cn("gen-read", tone)}>
      <p>{label}</p>
      <strong className="num">
        {value}
        <span>{unit}</span>
      </strong>
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

export function BoolFlag({ label, on, good }: { label: string; on: boolean; good?: boolean }) {
  const ok = good ? on : !on;
  return (
    <div className="gen-flag">
      <span>{label}</span>
      <b className={cn("num", ok ? "text-online" : "text-offline")}>{on ? "true" : "false"}</b>
    </div>
  );
}

export function MaintenanceBar({
  used,
  remain,
  cycle = 300,
  warn = 250,
}: {
  used: number;
  remain: number;
  cycle?: number;
  warn?: number;
}) {
  const pct = Math.min(100, Math.max(0, (used / cycle) * 100));
  const warnPct = (warn / cycle) * 100;
  const tone = used < warn ? "ok" : used < cycle ? "warn" : "bad";
  return (
    <section className={cn("maint-bar", tone)}>
      <header>
        <h3>Horas para manutenção</h3>
        <strong className="num">{fmt(remain, 0)} h</strong>
      </header>
      <div className="maint-track" aria-label={`Ciclo ${used} de ${cycle} horas`}>
        <i className="ok" style={{ width: `${warnPct}%` }} />
        <i className="warn" style={{ width: `${100 - warnPct}%` }} />
        <b style={{ left: `${pct}%` }} />
      </div>
      <div className="maint-scale">
        <span>0 h</span>
        <span>250 h alerta</span>
        <span>300 h limite</span>
      </div>
      <p>
        Ciclo {fmt(used, 0)}/{cycle} h · {tone === "ok" ? "OK" : tone === "warn" ? "Alerta" : "Vencida"}
      </p>
    </section>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function SemiGauge({
  label,
  value,
  max,
  unit,
  min = 0,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  min?: number;
}) {
  const cx = 110;
  const cy = 108;
  const r = 78;
  const pct = Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min)));
  const angle = pct * 180;
  const needle = polar(cx, cy, r - 10, angle);

  return (
    <div className="gen-gauge-card">
      <h3>{label}</h3>
      <svg viewBox="0 8 220 132" className="gen-semi" aria-label={label}>
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-bg" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-red" pathLength="100" strokeDasharray="12 88" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-yellow" pathLength="100" strokeDasharray="14 86" strokeDashoffset="-12" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-green" pathLength="100" strokeDasharray="48 52" strokeDashoffset="-26" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-yellow" pathLength="100" strokeDasharray="14 86" strokeDashoffset="-74" />
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gen-arc-red" pathLength="100" strokeDasharray="12 88" strokeDashoffset="-88" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} className="gen-needle" />
        <circle cx={cx} cy={cy} r="5" className="gen-hub" />
        <text x={cx} y={cy + 20} textAnchor="middle" className="gen-readout">
          {fmt(value, unit === "Hz" || unit === "%" || unit === "kW" ? 1 : 0)} {unit}
        </text>
      </svg>
    </div>
  );
}

export function CircleGauge({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const cx = 80;
  const cy = 80;
  const r = 58;
  const pct = Math.min(1, Math.max(0, value / Math.max(1, max)));
  const deg = pct * 270 - 135;
  const rad = ((deg - 90) * Math.PI) / 180;
  const nx = cx + (r - 8) * Math.cos(rad);
  const ny = cy + (r - 8) * Math.sin(rad);
  const circ = 2 * Math.PI * r * 0.75;

  return (
    <div className="gen-gauge-card">
      <h3>{label}</h3>
      <svg viewBox="0 0 160 150" className="gen-circle" aria-label={label}>
        <circle cx={cx} cy={cy} r={r} fill="none" className="gen-arc-bg" strokeDasharray={`${circ} ${2 * Math.PI * r}`} transform={`rotate(135 ${cx} ${cy})`} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="gen-arc-green"
          strokeDasharray={`${circ * pct} ${2 * Math.PI * r}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="gen-needle" />
        <circle cx={cx} cy={cy} r="5" className="gen-hub" />
        <text x={cx} y={cy + 68} textAnchor="middle" className="gen-readout">
          {fmt(value)} {unit}
        </text>
      </svg>
    </div>
  );
}

export function BarGauge({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div className="gen-gauge-card gen-bar-card">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3>{label}</h3>
        <strong className="num text-[16px] text-foreground">
          {fmt(value)} {unit}
        </strong>
      </div>
      <div className="gen-bar">
        <i className="ok" />
        <i className="warn" />
        <i className="bad" />
        <b style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export type PhasePoint = { t: string; l1: number; l2: number; l3: number };

export function phaseSeries(seed: number, base: number, amp: number, live: boolean, n = 28): PhasePoint[] {
  return Array.from({ length: n }, (_, i) => {
    if (!live) return { t: `${i}`, l1: 0, l2: 0, l3: 0 };
    const w = i / 3 + seed;
    return {
      t: `${i}`,
      l1: Number((base + Math.sin(w) * amp).toFixed(1)),
      l2: Number((base + 0.6 + Math.sin(w + 0.9) * amp).toFixed(1)),
      l3: Number((base - 0.4 + Math.sin(w + 1.7) * amp).toFixed(1)),
    };
  });
}

export function kwSeries(seed: number, load: number, live: boolean, n = 28) {
  return Array.from({ length: n }, (_, i) => ({
    t: `${i}`,
    v: live ? Math.max(0, Number((load * (0.72 + 0.28 * Math.abs(Math.sin(i / 2.4 + seed)))).toFixed(1))) : 0,
  }));
}

export function PhaseChart({
  title,
  data,
  live,
}: {
  title: string;
  data: PhasePoint[];
  live: boolean;
}) {
  const last = data[data.length - 1] ?? { l1: 0, l2: 0, l3: 0 };
  return (
    <section className="gen-card gen-chart-card">
      <header className="gen-card-head">
        <h2>{title}</h2>
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
          <span className="text-[#60a5fa]">F01 {fmt(last.l1, 0)}V</span>
          <span className="text-[#4ade80]">F02 {fmt(last.l2, 0)}V</span>
          <span className="text-[#f87171]">F03 {fmt(last.l3, 0)}V</span>
        </div>
      </header>
      <div className="gen-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={40} domain={live ? ["auto", "auto"] : [0, 10]} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
              formatter={(v: number, name: string) => [`${fmt(v, 0)} V`, name.toUpperCase()]}
            />
            <Line type="monotone" dataKey="l1" stroke="#60a5fa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="l2" stroke="#4ade80" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="l3" stroke="#f87171" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function KwChart({ data }: { data: Array<{ t: string; v: number }> }) {
  return (
    <div className="gen-chart-body">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={40} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
            formatter={(v: number) => [`${fmt(v, 1)} kW`, "Potência"]}
          />
          <Line type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniTank({ pct }: { pct: number }) {
  const h = Math.min(100, Math.max(0, pct));
  return (
    <span className="mini-tank" aria-hidden>
      <i style={{ height: `${h}%` }} />
    </span>
  );
}

export function FlowChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className={cn("flow-chip", tone)}>
      <span className="flow-chip-icon">{icon}</span>
      <div className="min-w-0">
        <p>{label}</p>
        <strong className="num">{value}</strong>
      </div>
    </div>
  );
}
