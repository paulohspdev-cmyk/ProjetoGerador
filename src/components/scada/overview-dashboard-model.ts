import { useCallback, useEffect, useMemo, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import {
  industrialApi,
  type IndustrialAlarm,
  type MaintenancePlan,
} from "@/lib/industrial-api";
import { rcApi, type SystemDiagnostics } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";

export type TrafficPort = {
  remotePort: number;
  todayRx: number;
  todayTx: number;
  todayBytes: number;
  monthRx: number;
  monthTx: number;
  monthBytes: number;
};

export type TrafficSummary = {
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

export type GeneratorStatusSummary = {
  online: number;
  alert: number;
  offline: number;
  unconfigured: number;
};

export type FuelSummary = {
  count: number;
  totalGenerators: number;
  average: number | null;
  min: number | null;
  max: number | null;
};

export type ModemDecisionRow = {
  remotePort: number;
  label: string;
  connected: boolean;
  today: number;
  month: number;
};

export type WorkSummary = {
  open: number;
  urgent: number;
  running: number;
  planned: number;
  error: boolean;
};

export type MaintenanceSummary = {
  due: number;
  warning: number;
  error: string | null;
};

export type SeverityBucket = {
  label: string;
  value: number;
  tone: "critical" | "alarm" | "warning" | "info";
};

export function formatBytes(value: number | null | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export function alarmTone(severity: string) {
  if (severity === "fault") return "err" as const;
  if (severity === "alarm" || severity === "warning") return "warn" as const;
  return "info" as const;
}

export function alarmLabel(severity: string) {
  if (severity === "fault") return "Crítico";
  if (severity === "alarm") return "Alarme";
  if (severity === "warning") return "Atenção";
  return "Informativo";
}

export function friendlyAlarmMessage(alarm: IndustrialAlarm) {
  if (alarm.code === "COMM_LOSS") return "Falha de comunicação com equipamento em campo.";
  if (/rapid|scada|binding|modbus|device|controller pack|canal/i.test(alarm.message)) {
    return "Ocorrência de comunicação requer verificação.";
  }
  return alarm.message || "Ocorrência ativa requer verificação.";
}

function metricAvailable(generator: { availableMetrics?: string[] }, key: string) {
  return (generator.availableMetrics ?? []).includes(key);
}

function isOpenWorkOrder(status: string) {
  return !/conclu|cancel|fechad/i.test(status);
}

export function useOverviewDecisionModel() {
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

  const generatorStatus = useMemo<GeneratorStatusSummary>(
    () => ({
      online: generators.filter((generator) => generator.status === "online").length,
      alert: generators.filter((generator) => generator.status === "alerta").length,
      offline: generators.filter((generator) => generator.status === "offline").length,
      unconfigured: generators.filter((generator) => generator.status === "nao_configurado").length,
    }),
    [generators],
  );

  const fuel = useMemo<FuelSummary>(() => {
    const readings = generators
      .filter(
        (generator) =>
          metricAvailable(generator, "fuel_level") &&
          Number.isFinite(Number(generator.fuelLevel)) &&
          Number(generator.fuelLevel) >= 0 &&
          Number(generator.fuelLevel) <= 100,
      )
      .map((generator) => Number(generator.fuelLevel));
    return {
      count: readings.length,
      totalGenerators: generators.length,
      average: readings.length
        ? readings.reduce((sum, value) => sum + value, 0) / readings.length
        : null,
      min: readings.length ? Math.min(...readings) : null,
      max: readings.length ? Math.max(...readings) : null,
    };
  }, [generators]);

  const bridgeFresh = diag?.bridge.statusFresh === true;
  const sessions = useMemo(
    () => [...(diag?.bridge.sessions ?? [])].sort((a, b) => a.remotePort - b.remotePort),
    [diag],
  );
  const connectedModems = bridgeFresh ? sessions.filter((session) => session.connected).length : 0;
  const traffic = diag?.bridge.traffic;
  const trafficByPort = useMemo(
    () => new Map((traffic?.ports ?? []).map((item) => [item.remotePort, item])),
    [traffic],
  );
  const modemRows = useMemo<ModemDecisionRow[]>(
    () =>
      sessions.map((session, index) => {
        const usage = trafficByPort.get(session.remotePort);
        return {
          remotePort: session.remotePort,
          label: `Modem ${String(index + 1).padStart(2, "0")}`,
          connected: session.connected,
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
  const work: WorkSummary = {
    open: openWorkOrders.length,
    urgent: openWorkOrders.filter((item) => /urgente/i.test(item.status)).length,
    running: openWorkOrders.filter((item) => /andamento/i.test(item.status)).length,
    planned: openWorkOrders.filter((item) => /planejada/i.test(item.status)).length,
    error: Boolean(opsError),
  };

  const maintenanceSummary: MaintenanceSummary = {
    due: maintenance.filter((item) => item.enabled && item.state === "due").length,
    warning: maintenance.filter((item) => item.enabled && item.state === "warning").length,
    error: maintenanceError,
  };

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

  return {
    updatedAt,
    retryAll,
    hasAnyError: Boolean(
      generatorsError || diagError || alarmError || maintenanceError || opsError,
    ),
    generatorsReady,
    generatorsError,
    totalGenerators: generators.length,
    generatorStatus,
    fuel,
    bridgeFresh,
    modemCount: sessions.length,
    connectedModems,
    traffic,
    modemRows,
    maxMonthTraffic,
    communicationLoading: !diag && !diagError,
    activeAlarms,
    alarmError,
    sitesWithAttention,
    work,
    maintenance: maintenanceSummary,
    severity,
    severityMax,
  };
}
