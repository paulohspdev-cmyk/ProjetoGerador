import type { BridgeSession } from "@/lib/api";
import { Panel, Pill } from "./kit";

export type ConnectivityTrafficPort = {
  remotePort: number;
  todayBytes: number;
  monthBytes: number;
};

export type ConnectivityOutage = {
  id: number;
  remote_port: number;
  started_at: number;
  ended_at?: number | null;
};

export type ConnectivityTraffic = {
  todayBytes: number;
  monthBytes: number;
  ports: ConnectivityTrafficPort[];
  outages?: ConnectivityOutage[];
};

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "N/D";
  const bytes = Math.max(0, Number(value));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
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

export function ConnectivitySecondaryPanels({
  traffic,
  sessions,
  healthy,
  degraded,
  fresh,
  badSessions,
  maxTraffic,
}: {
  traffic: ConnectivityTraffic | undefined;
  sessions: BridgeSession[];
  healthy: number;
  degraded: number;
  fresh: boolean;
  badSessions: BridgeSession[];
  maxTraffic: number;
}) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-12">
      <Panel title="Consumo por conexão" className="xl:col-span-4">
        <div className="space-y-3">
          {(traffic?.ports ?? []).slice(0, 8).map((item) => (
            <div
              key={item.remotePort}
              className="grid grid-cols-[80px_minmax(0,1fr)_72px] items-center gap-3 text-xs"
            >
              <span className="num">:{item.remotePort}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary">
                <i
                  className="block h-full rounded-full bg-chart-2"
                  style={{ width: `${Math.max(2, (item.monthBytes / maxTraffic) * 100)}%` }}
                />
              </span>
              <b className="num text-right">{formatBytes(item.monthBytes)}</b>
            </div>
          ))}
          {!(traffic?.ports ?? []).length && (
            <p className="py-7 text-center text-sm text-muted-foreground">
              Tráfego por conexão indisponível.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Disponibilidade da ponte de comunicação" className="xl:col-span-3">
        <div className="flex min-h-44 items-center justify-center gap-5">
          <div
            className="grid size-32 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--online) 0 ${sessions.length ? (healthy / sessions.length) * 100 : 0}%, var(--offline) 0)`,
            }}
          >
            <div className="grid size-[94px] place-items-center rounded-full bg-card text-center">
              <div>
                <b className="num block text-2xl">
                  {fresh && sessions.length
                    ? `${Math.round((healthy / sessions.length) * 100)}%`
                    : "N/D"}
                </b>
                <span className="text-[10px] text-muted-foreground">Disponível</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <p>
              <span className="mr-2 inline-block size-2 rounded-full bg-online" />
              Saudáveis <b className="num ml-2">{healthy}</b>
            </p>
            <p>
              <span className="mr-2 inline-block size-2 rounded-full bg-offline" />
              Degradadas <b className="num ml-2">{degraded}</b>
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Incidentes de conectividade" className="xl:col-span-5">
        <div className="divide-y divide-border/55">
          {badSessions.slice(0, 6).map((session) => (
            <div
              key={session.remotePort}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5"
            >
              <div className="min-w-0">
                <b className="block truncate text-xs">{sessionName(session)}</b>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {session.diagnosis?.label || "Conexão degradada"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Reconexões: {session.reconnections} · Timeouts: {session.timeouts} · Erros:{" "}
                  {session.errors}
                </p>
              </div>
              <Pill tone={diagnosisTone(session)}>
                {session.diagnosis?.origin === "field"
                  ? "CAMPO/MODEM"
                  : session.diagnosis?.origin === "controller"
                    ? "CONTROLADORA"
                    : session.diagnosis?.origin === "configuration"
                      ? "CONFIG"
                      : "SISTEMA"}
              </Pill>
            </div>
          ))}
          {(traffic?.outages ?? []).slice(0, Math.max(0, 6 - badSessions.length)).map((outage) => (
            <div
              key={`outage-${outage.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5"
            >
              <div>
                <b className="text-xs">Porta {outage.remote_port}</b>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Início {dt(outage.started_at)} ·{" "}
                  {outage.ended_at ? `retorno ${dt(outage.ended_at)}` : "ainda offline"}
                </p>
              </div>
              <Pill tone={outage.ended_at ? "muted" : "err"}>
                {outage.ended_at ? "ENCERRADO" : "ABERTO"}
              </Pill>
            </div>
          ))}
          {!badSessions.length && !(traffic?.outages ?? []).length && (
            <p className="py-8 text-center text-sm text-online">
              Nenhum incidente de conectividade ativo.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
