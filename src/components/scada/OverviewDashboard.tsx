import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  BellRing,
  ClipboardList,
  Fuel,
  Radio,
  RefreshCw,
  Router,
  TriangleAlert,
} from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import {
  industrialApi,
  type IndustrialAlarm,
  type MaintenancePlan,
} from "@/lib/industrial-api";
import { rcApi, type BridgeSession, type SystemDiagnostics } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Panel, Pill, ScreenBody, Stats } from "./kit";
import { useScadaOps } from "./ScadaOpsProvider";

type TrafficPort = {
  remotePort: number;
  todayRx: number;
  todayTx: number;
  todayBytes: number;
  monthRx: number;
  monthTx: number;
  monthBytes: number;
};

type TrafficSummary = {
  day: string;
  month: string;
  todayRx: number;
  todayTx: number;
  todayBytes: number;
  monthRx: number;
  monthTx: number;
  monthBytes: number;
  ports: TrafficPort[];
  updatedAt: number;
};

type ProductDiagnostics = SystemDiagnostics & {
  bridge: SystemDiagnostics["bridge"] & { traffic?: TrafficSummary };
};

type SeverityBucket = {
  label: string;
  value: number;
  tone: "critical" | "alarm" | "warning" | "info";
};

function formatBytes(value: number | null | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function metricAvailable(generator: { availableMetrics?: string[] }, key: string) {
  return (generator.availableMetrics ?? []).includes(key);
}

function alarmTone(severity: string) {
  if (severity === "fault") return "err" as const;
  if (severity === "alarm" || severity === "warning") return "warn" as const;
  return "info" as const;
}

function alarmLabel(severity: string) {
  if (severity === "fault") return "Crítico";
  if (severity === "alarm") return "Alarme";
  if (severity === "warning") return "Atenção";
  return "Informativo";
}

function friendlyAlarmMessage(alarm: IndustrialAlarm) {
  if (alarm.code === "COMM_LOSS") return "Falha de comunicação com equipamento em campo.";
  if (/rapid|scada|binding|modbus|device|controller pack|canal/i.test(alarm.message)) {
    return "Ocorrência de comunicação requer verificação.";
  }
  return alarm.message || "Ocorrência ativa requer verificação.";
}

function isOpenWorkOrder(status: string) {
  return !/conclu|cancel|fechad/i.test(status);
}

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

function MeterRow({
  label,
  value,
  max,
  display,
  tone = "bg-primary",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(120px,1.8fr)_auto] items-center gap-3 py-2">
      <span className="truncate text-sm font-semibold">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-secondary">
        <i
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${pct(value, max)}%` }}
        />
      </span>
      <b className="num min-w-16 text-right text-sm">{display}</b>
    </div>
  );
}

export function OverviewDashboard() {
  const {
    generators,
    ready: generatorsReady,
    error: generatorsError,
    refresh: refreshGenerators,
  } = useGenerators();
  const { workOrders, error: opsError, refresh: refreshOps } = useScadaOps();
  const [diag, setDiag] = useState<ProductDiagnostics | null>(null);
  const [alarms, setAlarms] = useState<IndustrialAlarm[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenancePlan[]>([]);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refreshOperational = useCallback(async () => {
    const [healthResult, alarmResult, maintenanceResult] = await Promise.allSettled([
      rcApi.system.health(),
      industrialApi.alarms.list(true),
      industrialApi.maintenance.list(),
    ]);

    if (healthResult.status === "fulfilled") {
      setDiag(healthResult.value as ProductDiagnostics);
      setDiagError(null);
    } else {
      setDiagError(
        healthResult.reason instanceof Error
          ? healthResult.reason.message
          : "Falha ao consultar comunicação.",
      );
    }

    if (alarmResult.status === "fulfilled") {
      setAlarms(alarmResult.value);
      setAlarmError(null);
    } else {
      setAlarmError(
        alarmResult.reason instanceof Error
          ? alarmResult.reason.message
          : "Falha ao consultar alarmes.",
      );
    }

    if (maintenanceResult.status === "fulfilled") {
      setMaintenance(maintenanceResult.value);
      setMaintenanceError(null);
    } else {
      setMaintenanceError(
        maintenanceResult.reason instanceof Error
          ? maintenanceResult.reason.message
          : "Falha ao consultar manutenção.",
      );
    }

    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    void refreshOperational();
    const timer = window.setInterval(() => void refreshOperational(), 10000);
    return () => window.clearInterval(timer);
  }, [refreshOperational]);

  const activeAlarms = useMemo(
    () =>
      [...alarms]
        .filter((alarm) => alarm.active)
        .sort((a, b) => Number(b.last_seen || 0) - Number(a.last_seen || 0)),
    [alarms],
  );

  const generatorStatus = useMemo(
    () => ({
      online: generators.filter((generator) => generator.status === "online").length,
      alert: generators.filter((generator) => generator.status === "alerta").length,
      offline: generators.filter((generator) => generator.status === "offline").length,
      unconfigured: generators.filter((generator) => generator.status === "nao_configurado").length,
    }),
    [generators],
  );

  const fuelReadings = useMemo(
    () =>
      generators
        .filter(
          (generator) =>
            metricAvailable(generator, "fuel_level") &&
            Number.isFinite(Number(generator.fuelLevel)) &&
            Number(generator.fuelLevel) >= 0 &&
            Number(generator.fuelLevel) <= 100,
        )
        .map((generator) => Number(generator.fuelLevel)),
    [generators],
  );

  const fuelAverage = fuelReadings.length
    ? fuelReadings.reduce((sum, value) => sum + value, 0) / fuelReadings.length
    : null;
  const fuelMin = fuelReadings.length ? Math.min(...fuelReadings) : null;
  const fuelMax = fuelReadings.length ? Math.max(...fuelReadings) : null;

  const bridgeFresh = diag?.bridge.statusFresh === true;
  const sessions = useMemo(
    () => [...(diag?.bridge.sessions ?? [])].sort((a, b) => a.remotePort - b.remotePort),
    [diag],
  );
  const connectedSessions = bridgeFresh ? sessions.filter((session) => session.connected) : [];
  const traffic = diag?.bridge.traffic;
  const trafficByPort = useMemo(
    () => new Map((traffic?.ports ?? []).map((item) => [item.remotePort, item])),
    [traffic],
  );

  const modemRows = useMemo(
    () =>
      sessions.map((session, index) => {
        const usage = trafficByPort.get(session.remotePort);
        return {
          session,
          label: `Modem ${String(index + 1).padStart(2, "0")}`,
          today: usage?.todayBytes ?? 0,
          month: usage?.monthBytes ?? 0,
        };
      }),
    [sessions, trafficByPort],
  );
  const maxMonthTraffic = Math.max(1, ...modemRows.map((item) => item.month));

  const openWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => isOpenWorkOrder(workOrder.status)),
    [workOrders],
  );
  const workOrderUrgent = openWorkOrders.filter((item) => /urgente/i.test(item.status)).length;
  const workOrderRunning = openWorkOrders.filter((item) => /andamento/i.test(item.status)).length;
  const workOrderPlanned = openWorkOrders.filter((item) => /planejada/i.test(item.status)).length;

  const maintenanceDue = maintenance.filter((item) => item.enabled && item.state === "due").length;
  const maintenanceWarning = maintenance.filter(
    (item) => item.enabled && item.state === "warning",
  ).length;

  const severity: SeverityBucket[] = [
    {
      label: "Crítico",
      value: activeAlarms.filter((item) => item.severity === "fault").length,
      tone: "critical",
    },
    {
      label: "Alarme",
      value: activeAlarms.filter((item) => item.severity === "alarm").length,
      tone: "alarm",
    },
    {
      label: "Atenção",
      value: activeAlarms.filter((item) => item.severity === "warning").length,
      tone: "warning",
    },
    {
      label: "Informativo",
      value: activeAlarms.filter(
        (item) => !["fault", "alarm", "warning"].includes(item.severity),
      ).length,
      tone: "info",
    },
  ];
  const severityMax = Math.max(1, ...severity.map((item) => item.value));

  const sitesWithAttention = useMemo(() => {
    const generatorSite = new Map(generators.map((generator) => [generator.id, generator.site]));
    return new Set(
      activeAlarms
        .map((alarm) => (alarm.generator_id ? generatorSite.get(alarm.generator_id) : undefined))
        .filter((site): site is string => Boolean(site)),
    ).size;
  }, [activeAlarms, generators]);

  const retryAll = () => {
    void refreshGenerators();
    void refreshOps();
    void refreshOperational();
  };

  const hasAnyError = Boolean(
    generatorsError || diagError || alarmError || maintenanceError || opsError,
  );

  return (
    <ScreenBody>
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
            onClick={retryAll}
            className="grid size-9 place-items-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary"
            aria-label="Atualizar painel"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {hasAnyError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-offline/40 bg-offline/10 px-4 py-3 text-sm text-offline">
          <div>
            <b>Parte do painel está temporariamente indisponível.</b>
            <span className="ml-1 text-foreground/75">Os demais indicadores continuam válidos.</span>
          </div>
          <button
            type="button"
            onClick={retryAll}
            className="rounded-md border border-offline/40 px-3 py-1.5 font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <Stats
        items={[
          {
            icon: Router,
            label: "Modems online",
            value: bridgeFresh ? `${connectedSessions.length}/${sessions.length}` : "N/D",
            tone: bridgeFresh && connectedSessions.length === sessions.length ? "text-online" : undefined,
            sub: bridgeFresh ? `${Math.max(0, sessions.length - connectedSessions.length)} offline` : undefined,
          },
          {
            icon: Activity,
            label: "Geradores online",
            value:
              !generatorsReady || generatorsError
                ? "N/D"
                : `${generatorStatus.online}/${generators.length}`,
            tone:
              generatorsReady && generatorStatus.online === generators.length
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
            value: alarmError ? "N/D" : activeAlarms.length,
            tone: activeAlarms.length ? "text-alert" : "text-online",
            sub: alarmError ? undefined : `${sitesWithAttention} unidade(s) com ocorrência`,
          },
          {
            icon: ClipboardList,
            label: "OS abertas",
            value: opsError ? "N/D" : openWorkOrders.length,
            tone: workOrderUrgent ? "text-offline" : undefined,
            sub: opsError ? undefined : `${workOrderUrgent} urgente(s)`,
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
            value: fuelAverage == null ? "N/D" : `${fuelAverage.toFixed(0)}%`,
            sub: `${fuelReadings.length}/${generators.length} com leitura`,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-5">
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

          {!diag && !diagError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando consumo…</p>
          ) : modemRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma conexão de modem disponível.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {modemRows.map((item) => (
                <div key={item.session.remotePort} className="py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold">{item.label}</span>
                      <Pill tone={bridgeFresh ? (item.session.connected ? "ok" : "err") : "muted"}>
                        {bridgeFresh ? (item.session.connected ? "ONLINE" : "OFFLINE") : "N/D"}
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

        <Panel title="Disponibilidade" className="xl:col-span-2">
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">Geradores</p>
                  <p className="text-xs text-muted-foreground">Situação atual do parque</p>
                </div>
                <p className="num text-xl font-extrabold">
                  {generators.length ? `${pct(generatorStatus.online, generators.length).toFixed(0)}%` : "N/D"}
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
                  {bridgeFresh && sessions.length
                    ? `${pct(connectedSessions.length, sessions.length).toFixed(0)}%`
                    : "N/D"}
                </p>
              </div>
              <SegmentBar
                segments={[
                  { value: connectedSessions.length, className: "bg-online", label: "Online" },
                  {
                    value: bridgeFresh ? Math.max(0, sessions.length - connectedSessions.length) : 0,
                    className: "bg-offline",
                    label: "Offline",
                  },
                ]}
              />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Combustível do parque">
          {fuelAverage == null ? (
            <div className="py-8 text-center">
              <Fuel className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Nível de combustível indisponível</p>
              <p className="mt-1 text-xs text-muted-foreground">
                O indicador aparecerá quando houver medição disponível nos equipamentos.
              </p>
            </div>
          ) : (
            <div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-secondary/35 p-3">
                  <p className="text-xs text-muted-foreground">Média medida</p>
                  <p className="num mt-1 text-2xl font-extrabold">{fuelAverage.toFixed(0)}%</p>
                </div>
                <div className="rounded-xl bg-secondary/35 p-3">
                  <p className="text-xs text-muted-foreground">Menor leitura</p>
                  <p className="num mt-1 text-2xl font-extrabold">{fuelMin?.toFixed(0)}%</p>
                </div>
                <div className="rounded-xl bg-secondary/35 p-3">
                  <p className="text-xs text-muted-foreground">Maior leitura</p>
                  <p className="num mt-1 text-2xl font-extrabold">{fuelMax?.toFixed(0)}%</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Nível médio do parque</span>
                  <span>{fuelReadings.length} medição(ões)</span>
                </div>
                <span className="block h-3 overflow-hidden rounded-full bg-secondary">
                  <i
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${fuelAverage}%` }}
                  />
                </span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Alarmes por prioridade">
          {alarmError ? (
            <p className="py-8 text-center text-sm text-offline">Alarmes indisponíveis.</p>
          ) : activeAlarms.length === 0 ? (
            <div className="py-8 text-center">
              <BellRing className="mx-auto size-8 text-online" />
              <p className="mt-2 font-semibold text-online">Nenhum alarme aberto</p>
            </div>
          ) : (
            <div className="space-y-1">
              {severity.map((item) => (
                <MeterRow
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  max={severityMax}
                  display={String(item.value)}
                  tone={
                    item.tone === "critical"
                      ? "bg-offline"
                      : item.tone === "alarm" || item.tone === "warning"
                        ? "bg-alert"
                        : "bg-chart-2"
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Trabalho pendente"
          actions={
            <Link
              to="/p/$slug"
              params={{ slug: "ordens-servico" }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Abrir OS
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">OS abertas</p>
              <b className="num mt-1 block text-xl">{opsError ? "N/D" : openWorkOrders.length}</b>
            </div>
            <div className="rounded-lg bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Urgentes</p>
              <b className={cn("num mt-1 block text-xl", workOrderUrgent && "text-offline")}>
                {opsError ? "N/D" : workOrderUrgent}
              </b>
            </div>
            <div className="rounded-lg bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Em andamento</p>
              <b className="num mt-1 block text-xl">{opsError ? "N/D" : workOrderRunning}</b>
            </div>
            <div className="rounded-lg bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Planejadas</p>
              <b className="num mt-1 block text-xl">{opsError ? "N/D" : workOrderPlanned}</b>
            </div>
          </div>
        </Panel>

        <Panel
          title="Manutenção"
          actions={
            <Link
              to="/p/$slug"
              params={{ slug: "manutencao" }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver manutenção
            </Link>
          }
        >
          {maintenanceError ? (
            <p className="py-7 text-center text-sm text-offline">Manutenção indisponível.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-semibold">Vencidas</span>
                <b className={cn("num text-xl", maintenanceDue && "text-offline")}>{maintenanceDue}</b>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-semibold">Próximas</span>
                <b className={cn("num text-xl", maintenanceWarning && "text-alert")}>
                  {maintenanceWarning}
                </b>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Requer atenção"
          actions={
            <Link
              to="/p/$slug"
              params={{ slug: "alarmes" }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver alarmes
            </Link>
          }
        >
          {alarmError ? (
            <p className="py-7 text-center text-sm text-offline">Alarmes indisponíveis.</p>
          ) : activeAlarms.length === 0 ? (
            <div className="py-7 text-center">
              <p className="font-semibold text-online">Nenhuma ocorrência ativa</p>
              <p className="mt-1 text-xs text-muted-foreground">Não há item exigindo ação imediata.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {activeAlarms.slice(0, 5).map((alarm) => (
                <li key={alarm.alarm_key} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-bold">
                      <TriangleAlert className="size-4 text-alert" />
                      {alarm.code === "COMM_LOSS" ? "Falha de comunicação" : "Ocorrência ativa"}
                    </span>
                    <Pill tone={alarmTone(alarm.severity)}>{alarmLabel(alarm.severity)}</Pill>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {friendlyAlarmMessage(alarm)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </ScreenBody>
  );
}
