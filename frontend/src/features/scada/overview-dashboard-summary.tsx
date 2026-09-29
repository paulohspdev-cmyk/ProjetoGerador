import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BellRing,
  CalendarDays,
  ChartLine,
  ChartPie,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  Fuel,
  MapPin,
  RefreshCw,
  Router,
  X,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";
import { Pill, Stats } from "./kit";
import {
  formatBytes,
  pct,
  type FuelSummary,
  type GeneratorStatusSummary,
  type SiteDecisionRow,
  type ModemDecisionRow,
  type TrafficSummary,
  type WorkSummary,
} from "./overview-dashboard-model";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-full min-h-8 w-full flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.18}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DecisionCard({
  icon: Icon,
  title,
  footer,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rc-panel rc-decision-card flex h-full min-h-0 flex-col", className)}>
      <header className="flex shrink-0 items-center gap-2 px-3.5 pt-2.5">
        <Icon className="size-[18px] shrink-0 text-primary" />
        <h2 className="text-[13px] font-bold tracking-normal text-foreground">{title}</h2>
      </header>
      <div className="flex min-h-0 grow flex-col px-3.5 py-1.5">{children}</div>
      {footer ? (
        <footer className="mt-auto shrink-0 px-3 pb-2 pt-0.5 text-center">{footer}</footer>
      ) : null}
    </section>
  );
}

export function DecisionLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link
      to="/p/$slug"
      params={{ slug }}
      className="inline-flex items-center justify-center gap-0.5 text-xs font-semibold text-primary hover:underline"
    >
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

export function DecisionHeader({
  updatedAt,
  onRefresh,
  demo = false,
}: {
  updatedAt: Date | null;
  onRefresh: () => void;
  demo?: boolean;
}) {
  return (
    <section className="rc-page-hero flex items-center px-5 py-3 sm:px-6">
      <div className="relative z-10 flex w-full flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">
            Visão geral
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Painel de decisão</h2>
          <p className="mt-1 max-w-lg text-sm leading-5 text-slate-200">
            Acompanhe os principais indicadores do parque gerador e tome decisões com agilidade.
            Este painel ajuda a identificar disponibilidade, consumo e ações pendentes em tempo
            real.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          {demo ? (
            <span className="inline-flex h-8 items-center rounded-md border border-amber-300/40 bg-amber-400/15 px-3 font-semibold text-amber-100">
              Demonstração
            </span>
          ) : null}
          <span className="inline-flex h-8 items-center gap-2 rounded-md border border-white/15 bg-black/25 px-3 backdrop-blur">
            <Clock3 className="size-4" />
            {updatedAt
              ? `Atualizado ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Atualizando…"}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-white/15 bg-black/25 px-3 text-[10px] font-extrabold uppercase tracking-[0.06em] text-slate-200 backdrop-blur transition-colors hover:border-primary/40 hover:text-white"
            aria-label="Atualizar painel"
          >
            <RefreshCw className="size-4 text-primary" /> Atualizar
          </button>
        </div>
      </div>
    </section>
  );
}

export function DecisionErrorBanner({ onRetry }: { onRetry: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <aside className="rc-decision-toast" role="status">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-5">
          Parte do painel está temporariamente indisponível.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-current hover:bg-black/5"
          aria-label="Fechar aviso"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 opacity-80">Os demais indicadores continuam válidos.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-current/30 px-3 py-1.5 text-xs font-semibold"
      >
        Tentar novamente
      </button>
    </aside>
  );
}

export function DecisionStats({
  bridgeFresh,
  connectedModems,
  modemCount,
  generatorsReady,
  generatorsError,
  totalGenerators,
  generatorStatus,
  alarmError,
  alarmsOpen,
  sitesWithAttention,
  work,
  traffic,
  fuel,
}: {
  bridgeFresh: boolean;
  connectedModems: number;
  modemCount: number;
  generatorsReady: boolean;
  generatorsError: string | null;
  totalGenerators: number;
  generatorStatus: GeneratorStatusSummary;
  alarmError: string | null;
  alarmsOpen: number;
  sitesWithAttention: number;
  work: WorkSummary;
  traffic?: TrafficSummary;
  fuel: FuelSummary;
}) {
  return (
    <Stats
      items={[
        {
          icon: Router,
          label: "Modems online",
          value: bridgeFresh ? `${connectedModems}/${modemCount}` : "N/D",
          iconWrap: "rc-kpi-online",
          tone: "text-online",
          sub: bridgeFresh ? `${Math.max(0, modemCount - connectedModems)} offline` : undefined,
          subTone: "text-offline",
        },
        {
          icon: CalendarDays,
          label: "Geradores online",
          value:
            !generatorsReady || generatorsError
              ? "N/D"
              : `${generatorStatus.online}/${totalGenerators}`,
          iconWrap: "rc-kpi-online",
          tone: "text-online",
          sub:
            generatorsReady && !generatorsError
              ? `${generatorStatus.offline} offline · ${generatorStatus.alert} em alerta`
              : undefined,
          subTone: "text-offline",
        },
        {
          icon: BellRing,
          label: "Alarmes abertos",
          value: alarmError ? "N/D" : alarmsOpen,
          iconWrap: "rc-kpi-offline",
          tone: "text-offline",
          sub: alarmError ? undefined : `${sitesWithAttention} unidade(s) com ocorrência`,
          subTone: "text-offline",
        },
        {
          icon: ClipboardList,
          label: "OS abertas",
          value: work.error ? "N/D" : work.open,
          iconWrap: "rc-kpi-primary",
          tone: "text-primary",
          sub: work.error ? undefined : `${work.urgent} urgente(s)`,
          subTone: "text-offline",
        },
        {
          icon: Database,
          iconWrap: "rc-kpi-info",
          label: "Dados hoje",
          value: traffic ? formatBytes(traffic.todayBytes) : "N/D",
          tone: "text-info",
          sub: traffic ? `${formatBytes(traffic.monthBytes)} no mês` : undefined,
        },
        {
          icon: Fuel,
          iconWrap: "rc-kpi-primary",
          tone: "text-primary",
          label: "Combustível médio",
          value:
            fuel.average == null
              ? fuel.mixedUnits
                ? "Unidades mistas"
                : "N/D"
              : `${fuel.average.toFixed(0)} ${fuel.unit ?? ""}`.trim(),
          sub: `${fuel.count}/${fuel.totalGenerators} com leitura`,
        },
      ]}
    />
  );
}

export function TrafficPanel({
  traffic,
  className,
}: {
  traffic?: TrafficSummary;
  className?: string | undefined;
}) {
  const todaySeries = traffic?.todaySeries?.length
    ? traffic.todaySeries
    : traffic
      ? [0, traffic.todayBytes]
      : [0, 0];
  const monthSeries = traffic?.monthSeries?.length
    ? traffic.monthSeries
    : traffic
      ? [traffic.todayBytes, traffic.monthBytes]
      : [0, 0];

  return (
    <DecisionCard
      icon={ChartLine}
      title="Consumo de dados dos modems"
      className={className}
      footer={<DecisionLink slug="conectividade">Ver todos os modems</DecisionLink>}
    >
      <div className="grid h-full sm:grid-cols-2">
        <div className="flex h-full min-h-0 flex-col pr-3">
          <p className="text-xs font-semibold text-muted-foreground">Hoje</p>
          <p className="num text-xl font-extrabold leading-tight text-info">
            {traffic ? formatBytes(traffic.todayBytes) : "N/D"}
          </p>
          <Sparkline values={todaySeries} color="var(--info)" />
          <p className="text-[11px] text-muted-foreground">
            {traffic?.todayQuota
              ? `Meta: ${formatBytes(traffic.todayQuota)}`
              : "Sem meta configurada"}
          </p>
        </div>
        <div className="flex h-full min-h-0 flex-col border-t border-border/70 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <p className="text-xs font-semibold text-muted-foreground">Mês atual</p>
          <p className="num text-xl font-extrabold leading-tight text-info">
            {traffic ? formatBytes(traffic.monthBytes) : "N/D"}
          </p>
          <Sparkline values={monthSeries} color="var(--info)" />
          <p className="text-[11px] text-muted-foreground">
            {traffic?.monthQuota ? `Meta: ${formatBytes(traffic.monthQuota)}` : "Acumulado do mês"}
          </p>
        </div>
      </div>
    </DecisionCard>
  );
}

export function ModemListPanel({
  loading,
  rows,
  traffic,
  maxMonthTraffic,
  bridgeFresh,
  className,
}: {
  loading: boolean;
  rows: ModemDecisionRow[];
  traffic?: TrafficSummary;
  maxMonthTraffic: number;
  bridgeFresh: boolean;
  className?: string | undefined;
}) {
  const preview = [...rows].sort((a, b) => b.month - a.month).slice(0, 4);
  const monthQuota = traffic?.monthQuota ?? null;

  return (
    <DecisionCard
      icon={Router}
      title="Modems"
      className={className}
      footer={<DecisionLink slug="conectividade">Ver todos os modems</DecisionLink>}
    >
      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando consumo…</p>
      ) : preview.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma conexão de modem disponível.
        </p>
      ) : (
        <div className="min-w-0">
          <div className="grid grid-cols-[18px_minmax(72px,1.1fr)_64px_minmax(56px,0.7fr)_minmax(88px,1.1fr)] gap-2 border-b border-border/70 pb-1 text-[10px] font-bold tracking-wide text-muted-foreground">
            <span />
            <span>Modem</span>
            <span>Status</span>
            <span>Hoje</span>
            <span>Uso da meta</span>
          </div>
          {preview.map((item, index) => {
            const usage = monthQuota
              ? pct(item.month, monthQuota)
              : maxMonthTraffic > 0
                ? pct(item.month, maxMonthTraffic)
                : 0;
            return (
              <div
                key={item.remotePort}
                className="grid grid-cols-[18px_minmax(72px,1.1fr)_64px_minmax(56px,0.7fr)_minmax(88px,1.1fr)] items-center gap-2 border-b border-border/40 py-px text-xs"
              >
                <span className="text-muted-foreground">{index + 1}</span>
                <span className="truncate font-bold">{item.label}</span>
                <Pill tone={bridgeFresh ? (item.connected ? "ok" : "err") : "muted"}>
                  {bridgeFresh ? (item.connected ? "Online" : "Offline") : "N/D"}
                </Pill>
                <span className="num text-xs font-semibold">{formatBytes(item.today)}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
                    <i
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${usage}%` }}
                    />
                  </span>
                  <b className="num w-8 text-right text-xs">{usage.toFixed(0)}%</b>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DecisionCard>
  );
}

export function AvailabilityPanel({
  generatorStatus,
  totalGenerators,
  className,
}: {
  generatorStatus: GeneratorStatusSummary;
  totalGenerators: number;
  bridgeFresh: boolean;
  modemCount: number;
  connectedModems: number;
  className?: string | undefined;
}) {
  const slices = [
    { name: "Online", value: generatorStatus.online, color: "var(--online)" },
    { name: "Offline", value: generatorStatus.offline, color: "var(--offline)" },
    { name: "Alerta", value: generatorStatus.alert, color: "var(--alert)" },
    {
      name: "Não configurado",
      value: generatorStatus.unconfigured,
      color: "var(--muted-foreground)",
    },
  ];
  const chartData =
    totalGenerators > 0
      ? slices.filter((slice) => slice.value > 0)
      : [{ name: "Sem dados", value: 1, color: "var(--border)" }];

  return (
    <DecisionCard
      icon={ChartPie}
      title="Disponibilidade do parque"
      className={className}
      footer={<DecisionLink slug="geradores">Ver todos os geradores</DecisionLink>}
    >
      <div className="grid items-center gap-3 sm:grid-cols-[128px_minmax(0,1fr)]">
        <div className="relative mx-auto size-[128px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={46}
                outerRadius={58}
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            <div>
              <p className="num text-2xl font-extrabold leading-none">{totalGenerators || "N/D"}</p>
              <p className="mt-1 text-[9px] leading-[11px] text-muted-foreground">
                Total de
                <br />
                geradores
              </p>
            </div>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {slices.map((slice) => (
            <li key={slice.name} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <i className="size-2.5 rounded-full" style={{ background: slice.color }} />
                {slice.name}
              </span>
              <b className="num">
                {slice.value}{" "}
                <span className="font-semibold text-muted-foreground">
                  ({totalGenerators ? pct(slice.value, totalGenerators).toFixed(0) : 0}%)
                </span>
              </b>
            </li>
          ))}
        </ul>
      </div>
    </DecisionCard>
  );
}

export function SitePanel({
  sites,
  className,
}: {
  sites: SiteDecisionRow[];
  className?: string | undefined;
}) {
  return (
    <DecisionCard
      icon={MapPin}
      title="Unidades"
      className={className}
      footer={<DecisionLink slug="geradores">Ver todos os geradores</DecisionLink>}
    >
      {sites.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma unidade no parque.</p>
      ) : (
        <ul className="space-y-1.5">
          {sites.map((site) => (
            <li key={site.site} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-semibold">{site.site}</span>
              <span className="num shrink-0 text-muted-foreground">
                {site.online}/{site.total} online
                {site.alert + site.offline > 0 ? ` · ${site.alert + site.offline} fora` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DecisionCard>
  );
}
