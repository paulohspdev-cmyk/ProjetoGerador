import { Network, Router, Signal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { rcApi, type BridgeSession, type SystemDiagnostics } from "@/lib/api";
import { Panel, Pill, ScreenBody, Stats } from "./kit";

export { GatewaysScreen, ModemsScreen } from "./field-device-inventory";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function formatBytes(value: number | null | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

type TrafficPort = {
  remotePort: number;
  todayBytes: number;
  monthBytes: number;
};

type ConnectionOutage = {
  id: number;
  remote_port: number;
  started_at: number;
  ended_at?: number | null;
};

type ProductDiagnostics = SystemDiagnostics & {
  bridge: SystemDiagnostics["bridge"] & {
    traffic?: {
      todayBytes: number;
      monthBytes: number;
      ports: TrafficPort[];
      outages?: ConnectionOutage[];
    };
  };
};

function sessionState(session: BridgeSession, fresh: boolean) {
  if (!fresh) return { label: "N/D", tone: "muted" as const };
  const origin = session.diagnosis?.origin;
  if (origin === "none") return { label: "ONLINE", tone: "ok" as const };
  if (origin === "controller") return { label: "CONTROLADORA", tone: "warn" as const };
  if (origin === "configuration") return { label: "CONFIG", tone: "warn" as const };
  if (origin === "system") return { label: "SISTEMA", tone: "err" as const };
  return { label: session.connected ? "DEGRADADO" : "OFFLINE", tone: "err" as const };
}

function sessionName(session: BridgeSession) {
  if (session.generators.length)
    return session.generators.map((generator) => generator.tag).join(", ");
  return `Conexão ${session.remotePort}`;
}

function diagnosisTone(session: BridgeSession) {
  if (session.diagnosis?.origin === "none") return "ok" as const;
  if (session.diagnosis?.origin === "controller" || session.diagnosis?.origin === "configuration")
    return "warn" as const;
  return "err" as const;
}

export function ConnectivityScreen() {
  const [health, setHealth] = useState<ProductDiagnostics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = (await rcApi.system.health()) as ProductDiagnostics;
        if (active) {
          setHealth(data);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(errText(loadError));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const fresh = health?.bridge.statusFresh === true;
  const sessions = health?.bridge.sessions ?? [];
  const healthy = fresh
    ? sessions.filter((session) => session.diagnosis?.origin === "none").length
    : 0;
  const degraded = fresh ? Math.max(0, sessions.length - healthy) : 0;
  const traffic = health?.bridge.traffic;
  const trafficByPort = useMemo(
    () => new Map((traffic?.ports ?? []).map((item) => [item.remotePort, item])),
    [traffic],
  );

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Conectividade</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Conexões e tráfego.</p>
      </div>

      <Stats
        items={[
          {
            icon: Signal,
            label: "Conexões saudáveis",
            value: fresh ? `${healthy}/${sessions.length}` : "N/D",
            tone: fresh && healthy ? "text-online" : undefined,
          },
          {
            icon: Signal,
            label: "Com falha / degradadas",
            value: fresh ? degraded : "N/D",
            tone: fresh && degraded ? "text-offline" : undefined,
          },
          {
            icon: Router,
            label: "Dados hoje",
            value: traffic ? formatBytes(traffic.todayBytes) : "N/D",
          },
          {
            icon: Network,
            label: "Dados no mês",
            value: traffic ? formatBytes(traffic.monthBytes) : "N/D",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      <Panel title="Conexões">
        {!sessions.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem conexões configuradas.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => {
              const state = sessionState(session, fresh);
              const portTraffic = trafficByPort.get(session.remotePort);
              const lastActivity = Math.max(
                Number(session.lastRxAt || 0),
                Number(session.lastTxAt || 0),
              );
              const outages = (traffic?.outages ?? [])
                .filter((item) => item.remote_port === session.remotePort)
                .slice(0, 3);
              return (
                <article
                  key={session.remotePort}
                  className="rounded-xl border border-border bg-background/35 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold">{sessionName(session)}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {session.generators.length > 1
                          ? `${session.generators.length} geradores`
                          : "Conexão única"}
                      </p>
                    </div>
                    <Pill tone={state.tone}>{state.label}</Pill>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Último contato</dt>
                      <dd className="mt-0.5 font-semibold">
                        {lastActivity ? dt(lastActivity) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Endereço remoto</dt>
                      <dd className="num mt-0.5 font-semibold">
                        {fresh && session.connected ? session.remoteIp || "—" : "—"}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-secondary/35 p-2.5">
                      <dt className="text-muted-foreground">Hoje</dt>
                      <dd className="num mt-0.5 text-sm font-extrabold">
                        {formatBytes(portTraffic?.todayBytes)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-secondary/35 p-2.5">
                      <dt className="text-muted-foreground">Mês</dt>
                      <dd className="num mt-0.5 text-sm font-extrabold">
                        {formatBytes(portTraffic?.monthBytes)}
                      </dd>
                    </div>
                  </dl>

                  {session.diagnosis && (
                    <div className="mt-3 rounded-lg border border-border bg-secondary/25 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <b>Causa provável</b>
                        <Pill tone={diagnosisTone(session)}>
                          {session.diagnosis.origin === "field"
                            ? "CAMPO/MODEM"
                            : session.diagnosis.origin === "controller"
                              ? "CONTROLADORA"
                              : session.diagnosis.origin === "system"
                                ? "SISTEMA"
                                : session.diagnosis.origin === "configuration"
                                  ? "CONFIGURAÇÃO"
                                  : "NORMAL"}
                        </Pill>
                      </div>
                      <p className="mt-1 text-muted-foreground">{session.diagnosis.label}</p>
                    </div>
                  )}

                  {outages.length > 0 && (
                    <details className="mt-3 border-t border-border/60 pt-3 text-xs">
                      <summary className="cursor-pointer font-semibold">
                        Quedas recentes ({outages.length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {outages.map((outage) => (
                          <li key={outage.id}>
                            Início {dt(outage.started_at)} ·{" "}
                            {outage.ended_at ? `retorno ${dt(outage.ended_at)}` : "ainda offline"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <details className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-semibold text-foreground">
                      Detalhes técnicos
                    </summary>
                    <div className="mt-2 space-y-1">
                      <p>Reconexões: {session.reconnections}</p>
                      <p>
                        Timeouts: {session.timeouts} · Erros: {session.errors}
                      </p>
                      {session.generators.map((generator) => (
                        <p key={`${generator.generatorId}-${generator.unit}`}>
                          {generator.tag}: endereço {generator.unit} · dispositivo{" "}
                          {generator.rapidDeviceNum ?? "N/D"}
                        </p>
                      ))}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </ScreenBody>
  );
}
