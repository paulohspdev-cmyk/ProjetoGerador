import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CircleOff,
  Gauge,
  Radio,
  RefreshCw,
  Router,
} from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { StatusPill } from "@/components/generators/StatusPill";
import { industrialApi, type IndustrialAlarm } from "@/lib/industrial-api";
import { rcApi, type BridgeSession, type SystemDiagnostics } from "@/lib/api";
import { Panel, Pill, ScreenBody, Stats } from "./kit";

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

function metricAvailable(generator: { availableMetrics?: string[] }, key: string) {
  return (generator.availableMetrics ?? []).includes(key);
}

function formatBytes(value: number | null | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function sessionLabel(session: BridgeSession) {
  if (session.generators.length === 1) return session.generators[0]?.tag || `Porta ${session.remotePort}`;
  if (session.generators.length > 1) return session.generators.map((item) => item.tag).join(", ");
  return `Conexão ${session.remotePort}`;
}

function alarmTone(severity: string) {
  return severity === "fault" || severity === "alarm" ? "err" : "warn";
}

export function OverviewDashboard() {
  const {
    generators,
    ready: generatorsReady,
    error: generatorsError,
    refresh: refreshGenerators,
  } = useGenerators();
  const [diag, setDiag] = useState<ProductDiagnostics | null>(null);
  const [alarms, setAlarms] = useState<IndustrialAlarm[]>([]);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refreshOperational = useCallback(async () => {
    const [healthResult, alarmResult] = await Promise.allSettled([
      rcApi.system.health(),
      industrialApi.alarms.list(true),
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
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    void refreshOperational();
    const timer = window.setInterval(() => void refreshOperational(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshOperational]);

  const online = generators.filter((generator) => generator.status === "online").length;
  const offline = generators.filter((generator) => generator.status === "offline").length;
  const alert = generators.filter((generator) => generator.status === "alerta").length;
  const running = generators.filter(
    (generator) => metricAvailable(generator, "rpm") && generator.rpm > 300,
  ).length;

  const bridgeFresh = diag?.bridge.statusFresh === true;
  const sessions = diag?.bridge.sessions ?? [];
  const connectedSessions = bridgeFresh ? sessions.filter((session) => session.connected) : [];
  const traffic = diag?.bridge.traffic;

  const trafficByPort = useMemo(
    () => new Map((traffic?.ports ?? []).map((item) => [item.remotePort, item])),
    [traffic],
  );

  const attention = useMemo(
    () =>
      [...alarms]
        .filter((item) => item.active)
        .sort((a, b) => Number(b.last_seen || 0) - Number(a.last_seen || 0)),
    [alarms],
  );

  const retryAll = () => {
    void refreshGenerators();
    void refreshOperational();
  };

  return (
    <ScreenBody>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Situação do parque</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Acompanhe geradores, comunicação e ocorrências em um só lugar.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{updatedAt ? `Atualizado ${updatedAt.toLocaleTimeString("pt-BR")}` : "Atualizando…"}</span>
          <button
            type="button"
            onClick={retryAll}
            className="grid size-9 place-items-center rounded-lg border border-border bg-card hover:bg-secondary"
            aria-label="Atualizar painel"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {(generatorsError || diagError || alarmError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-offline/40 bg-offline/10 px-4 py-3 text-sm text-offline">
          <div>
            <b>Algumas informações não puderam ser atualizadas.</b>
            {generatorsError && <span className="ml-1">Geradores: {generatorsError}.</span>}
            {diagError && <span className="ml-1">Comunicação: {diagError}.</span>}
            {alarmError && <span className="ml-1">Alarmes: {alarmError}.</span>}
          </div>
          <button type="button" onClick={retryAll} className="rounded-md border border-offline/40 px-3 py-1.5 font-semibold">
            Tentar novamente
          </button>
        </div>
      )}

      <Stats
        items={[
          {
            icon: Activity,
            label: "Geradores online",
            value: generatorsError ? "—" : `${online}/${generators.length}`,
            tone: online ? "text-online" : undefined,
          },
          {
            icon: CircleOff,
            label: "Geradores offline",
            value: generatorsError ? "—" : offline,
            tone: offline ? "text-offline" : "text-online",
          },
          {
            icon: Gauge,
            label: "Em operação",
            value: generatorsError ? "—" : running,
            sub: "motor em funcionamento",
          },
          {
            icon: BellRing,
            label: "Alarmes ativos",
            value: alarmError ? "—" : attention.length || alert,
            tone: attention.length || alert ? "text-alert" : "text-online",
          },
          {
            icon: Router,
            label: "Modems online",
            value: bridgeFresh ? `${connectedSessions.length}/${sessions.length}` : "N/D",
            tone: bridgeFresh && connectedSessions.length ? "text-online" : undefined,
          },
          {
            icon: Radio,
            label: "Dados hoje",
            value: traffic ? formatBytes(traffic.todayBytes) : "N/D",
            sub: traffic ? `${formatBytes(traffic.monthBytes)} no mês` : undefined,
          },
        ]}
      />

      {!generatorsReady && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Carregando geradores…
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Geradores"
          className="xl:col-span-2"
          actions={
            <Link to="/p/$slug" params={{ slug: "geradores" }} className="text-xs font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          }
        >
          {!generatorsError && generatorsReady && generators.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum gerador cadastrado.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {generators.map((generator) => {
                const rpm = metricAvailable(generator, "rpm") ? `${generator.rpm.toFixed(0)} rpm` : "—";
                const hz =
                  metricAvailable(generator, "frequency") && generator.frequency != null
                    ? `${generator.frequency.toFixed(1)} Hz`
                    : "—";
                return (
                  <Link
                    key={generator.id}
                    to="/p/geradores/$id"
                    params={{ id: generator.id }}
                    className="group rounded-xl border border-border bg-background/35 p-3 transition-colors hover:border-primary/45 hover:bg-secondary/25"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold">{generator.tag}</p>
                        <p className="truncate text-xs text-muted-foreground">{generator.site || "Sem unidade"}</p>
                      </div>
                      <StatusPill status={generator.status} />
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span><b className="num">{rpm}</b></span>
                      <span><b className="num">{hz}</b></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Requer atenção"
          actions={
            <Link to="/p/$slug" params={{ slug: "alarmes" }} className="text-xs font-semibold text-primary hover:underline">
              Abrir alarmes
            </Link>
          }
        >
          {alarmError ? (
            <p className="py-6 text-sm text-offline">Alarmes indisponíveis.</p>
          ) : attention.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-semibold text-online">Nenhum alarme ativo</p>
              <p className="mt-1 text-xs text-muted-foreground">O parque não possui ocorrência ativa registrada.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {attention.slice(0, 8).map((item) => (
                <li key={item.alarm_key} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{item.code || "Alarme"}</b>
                    <Pill tone={alarmTone(item.severity)}>{item.severity}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Comunicação dos modems"
        actions={
          <Link to="/p/$slug" params={{ slug: "conectividade" }} className="text-xs font-semibold text-primary hover:underline">
            Ver conectividade
          </Link>
        }
      >
        {!diag && !diagError ? (
          <p className="py-6 text-sm text-muted-foreground">Carregando comunicação…</p>
        ) : sessions.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nenhuma conexão de modem configurada.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => {
              const portTraffic = trafficByPort.get(session.remotePort);
              const onlineNow = bridgeFresh && session.connected;
              return (
                <article key={session.remotePort} className="rounded-xl border border-border bg-background/35 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{sessionLabel(session)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {session.generators.length > 1 ? `${session.generators.length} geradores vinculados` : "Conexão de campo"}
                      </p>
                    </div>
                    <Pill tone={onlineNow ? "ok" : bridgeFresh ? "err" : "muted"}>
                      {onlineNow ? "ONLINE" : bridgeFresh ? "OFFLINE" : "N/D"}
                    </Pill>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-secondary/35 p-2">
                      <p className="text-muted-foreground">Hoje</p>
                      <b className="num text-sm">{portTraffic ? formatBytes(portTraffic.todayBytes) : "0 B"}</b>
                    </div>
                    <div className="rounded-lg bg-secondary/35 p-2">
                      <p className="text-muted-foreground">Mês</p>
                      <b className="num text-sm">{portTraffic ? formatBytes(portTraffic.monthBytes) : "0 B"}</b>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </ScreenBody>
  );
}
