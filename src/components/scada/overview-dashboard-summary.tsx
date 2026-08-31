import { Link } from "@tanstack/react-router";
import { Activity, BellRing, ClipboardList, Fuel, Radio, RefreshCw, Router } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, Pill, Stats } from "./kit";
import {
  formatBytes,
  pct,
  type FuelSummary,
  type GeneratorStatusSummary,
  type ModemDecisionRow,
  type TrafficSummary,
  type WorkSummary,
} from "./overview-dashboard-model";

function SegmentBar({
  segments,
}: {
  segments: Array<{ value: number; className: string; label: string }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={cn("h-full transition-[width]", segment.className)}
            style={{ width: `${pct(segment.value, total)}%` }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <i className={cn("size-2 rounded-full", segment.className)} />
            {segment.label} <b className="num text-foreground">{segment.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DecisionHeader({
  updatedAt,
  onRefresh,
}: {
  updatedAt: Date | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Visão geral</p>
        <h2 className="mt-1 text-xl font-extrabold">Painel de decisão</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicadores essenciais para identificar disponibilidade, consumo e pendências do parque.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {updatedAt ? `Atualizado ${updatedAt.toLocaleTimeString("pt-BR")}` : "Atualizando…"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="grid size-9 place-items-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary"
          aria-label="Atualizar painel"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function DecisionErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-offline/40 bg-offline/10 px-4 py-3 text-sm text-offline">
      <div>
        <b>Parte do painel está temporariamente indisponível.</b>
        <span className="ml-1 text-foreground/75">Os demais indicadores continuam válidos.</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-offline/40 px-3 py-1.5 font-semibold"
      >
        Tentar novamente
      </button>
    </div>
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
          tone: bridgeFresh && modemCount > 0 && connectedModems === modemCount ? "text-online" : undefined,
          sub: bridgeFresh ? `${Math.max(0, modemCount - connectedModems)} offline` : undefined,
        },
        {
          icon: Activity,
          label: "Geradores online",
          value:
            !generatorsReady || generatorsError
              ? "N/D"
              : `${generatorStatus.online}/${totalGenerators}`,
          tone:
            generatorsReady && totalGenerators > 0 && generatorStatus.online === totalGenerators
              ? "text-online"
              : undefined,
          sub:
            generatorsReady && !generatorsError
              ? `${generatorStatus.offline} offline · ${generatorStatus.alert} em alerta`
              : undefined,
        },
        {
          icon: BellRing,
          label: "Alarmes abertos",
          value: alarmError ? "N/D" : alarmsOpen,
          tone: alarmsOpen ? "text-alert" : "text-online",
          sub: alarmError ? undefined : `${sitesWithAttention} unidade(s) com ocorrência`,
        },
        {
          icon: ClipboardList,
          label: "OS abertas",
          value: work.error ? "N/D" : work.open,
          tone: work.urgent ? "text-offline" : undefined,
          sub: work.error ? undefined : `${work.urgent} urgente(s)`,
        },
        {
          icon: Radio,
          label: "Dados hoje",
          value: traffic ? formatBytes(traffic.todayBytes) : "N/D",
          sub: traffic ? `${formatBytes(traffic.monthBytes)} no mês` : undefined,
        },
        {
          icon: Fuel,
          label: "Combustível médio",
          value: fuel.average == null ? "N/D" : `${fuel.average.toFixed(0)}%`,
          sub: `${fuel.count}/${fuel.totalGenerators} com leitura`,
        },
      ]}
    />
  );
}

export function TrafficPanel({
  loading,
  rows,
  traffic,
  maxMonthTraffic,
  bridgeFresh,
}: {
  loading: boolean;
  rows: ModemDecisionRow[];
  traffic?: TrafficSummary;
  maxMonthTraffic: number;
  bridgeFresh: boolean;
}) {
  return (
    <Panel
      title="Consumo de dados dos modems"
      className="xl:col-span-3"
      actions={
        <Link
          to="/p/$slug"
          params={{ slug: "conectividade" }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver conectividade
        </Link>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-secondary/35 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hoje</p>
          <p className="num mt-1 text-2xl font-extrabold">
            {traffic ? formatBytes(traffic.todayBytes) : "N/D"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/35 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês atual</p>
          <p className="num mt-1 text-2xl font-extrabold">
            {traffic ? formatBytes(traffic.monthBytes) : "N/D"}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando consumo…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma conexão de modem disponível.
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((item) => (
            <div key={item.remotePort} className="py-2">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold">{item.label}</span>
                  <Pill tone={bridgeFresh ? (item.connected ? "ok" : "err") : "muted"}>
                    {bridgeFresh ? (item.connected ? "ONLINE" : "OFFLINE") : "N/D"}
                  </Pill>
                </div>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  Hoje {formatBytes(item.today)} · Mês {formatBytes(item.month)}
                </span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-secondary">
                <i
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${pct(item.month, maxMonthTraffic)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function AvailabilityPanel({
  generatorStatus,
  totalGenerators,
  bridgeFresh,
  modemCount,
  connectedModems,
}: {
  generatorStatus: GeneratorStatusSummary;
  totalGenerators: number;
  bridgeFresh: boolean;
  modemCount: number;
  connectedModems: number;
}) {
  return (
    <Panel title="Disponibilidade" className="xl:col-span-2">
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Geradores</p>
              <p className="text-xs text-muted-foreground">Situação atual do parque</p>
            </div>
            <p className="num text-xl font-extrabold">
              {totalGenerators ? `${pct(generatorStatus.online, totalGenerators).toFixed(0)}%` : "N/D"}
            </p>
          </div>
          <SegmentBar
            segments={[
              { value: generatorStatus.online, className: "bg-online", label: "Online" },
              { value: generatorStatus.alert, className: "bg-alert", label: "Alerta" },
              { value: generatorStatus.offline, className: "bg-offline", label: "Offline" },
              {
                value: generatorStatus.unconfigured,
                className: "bg-muted-foreground/50",
                label: "Não configurado",
              },
            ]}
          />
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Modems</p>
              <p className="text-xs text-muted-foreground">Conexões de campo</p>
            </div>
            <p className="num text-xl font-extrabold">
              {bridgeFresh && modemCount
                ? `${pct(connectedModems, modemCount).toFixed(0)}%`
                : "N/D"}
            </p>
          </div>
          <SegmentBar
            segments={[
              { value: connectedModems, className: "bg-online", label: "Online" },
              {
                value: bridgeFresh ? Math.max(0, modemCount - connectedModems) : 0,
                className: "bg-offline",
                label: "Offline",
              },
            ]}
          />
        </div>
      </div>
    </Panel>
  );
}
