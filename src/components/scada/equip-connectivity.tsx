import { Database, Network, Router, Signal, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { rcApi, type BridgeSession, type FieldDevice, type SystemDiagnostics } from "@/lib/api";
import { Panel, Pill, ScreenBody, Stats } from "./kit";
import {
  ConnectivitySecondaryPanels,
  type ConnectivityTraffic,
} from "./connectivity-secondary-panels";

export { GatewaysScreen, ModemsScreen } from "./field-device-inventory";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

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

type ProductDiagnostics = SystemDiagnostics & {
  bridge: SystemDiagnostics["bridge"] & {
    traffic?: ConnectivityTraffic;
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
  const [devices, setDevices] = useState<FieldDevice[]>([]);
  const [error, setError] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [system, inventory] = await Promise.all([
          rcApi.system.health(),
          rcApi.fieldDevices.list().catch(() => [] as FieldDevice[]),
        ]);
        if (active) {
          setHealth(system as ProductDiagnostics);
          setDevices(inventory);
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
  const modems = devices.filter((device) => device.kind === "modem");
  const gateways = devices.filter((device) => device.kind === "gateway");
  const activeModems = modems.filter((device) => device.active).length;
  const activeGateways = gateways.filter((device) => device.active).length;
  const badSessions = sessions.filter((session) => fresh && session.diagnosis?.origin !== "none");
  const maxTraffic = Math.max(1, ...(traffic?.ports ?? []).map((item) => item.monthBytes));
  const signalDevices = devices.filter(
    (device) => device.rssi != null && Number.isFinite(Number(device.rssi)),
  );
  const carriers = [
    ...new Set(devices.map((device) => device.carrier?.trim()).filter(Boolean)),
  ].sort();
  const visibleDevices = devices.filter((device) => {
    if (carrierFilter && device.carrier !== carrierFilter) return false;
    if (kindFilter && kindFilter !== device.kind) return false;
    if (statusFilter) {
      const normalized = (device.status || "").toLowerCase();
      const key = !device.active || normalized.includes("offline") ? "offline" : "online";
      if (key !== statusFilter) return false;
    }
    return true;
  });
  const visibleSessions = sessions.filter((session) => {
    if (carrierFilter) return false;
    if (kindFilter && kindFilter !== "bridge") return false;
    if (!statusFilter) return true;
    const state = sessionState(session, fresh);
    const key = state.tone === "ok" ? "online" : session.connected ? "degraded" : "offline";
    return key === statusFilter;
  });

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Router,
            label: "Modems ativos",
            value: `${activeModems}/${modems.length}`,
            tone: activeModems === modems.length && modems.length ? "text-online" : undefined,
            sub: `${Math.max(0, modems.length - activeModems)} inativo(s)`,
          },
          {
            icon: Network,
            label: "Gateways ativos",
            value: `${activeGateways}/${gateways.length}`,
            tone: activeGateways === gateways.length && gateways.length ? "text-online" : undefined,
            sub: `${Math.max(0, gateways.length - activeGateways)} inativo(s)`,
          },
          {
            icon: Database,
            label: "Consumo hoje",
            value: traffic ? formatBytes(traffic.todayBytes) : "N/D",
            sub: "Tráfego medido pela bridge",
          },
          {
            icon: Database,
            label: "Consumo no mês",
            value: traffic ? formatBytes(traffic.monthBytes) : "N/D",
            sub: "Tráfego acumulado",
          },
          {
            icon: TriangleAlert,
            label: "Conexões degradadas",
            value: fresh ? degraded : "N/D",
            tone: degraded ? "text-offline" : "text-online",
            sub: fresh ? `${healthy}/${sessions.length} saudável(is)` : "Status desatualizado",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      <section className="rc-panel rounded-[10px] border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(180px,1.4fr)_auto]">
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Operadora
            <select
              value={carrierFilter}
              onChange={(event) => setCarrierFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todas</option>
              {carriers.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {carrier}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todos</option>
              <option value="online">Online</option>
              <option value="degraded">Atenção</option>
              <option value="offline">Offline</option>
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Tipo de dispositivo
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todos</option>
              <option value="modem">Modem</option>
              <option value="gateway">Gateway</option>
              <option value="bridge">Conexão / bridge</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setCarrierFilter("");
                setKindFilter("");
                setStatusFilter("");
              }}
              className="h-10 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-secondary"
            >
              Limpar filtros
            </button>
            <span className="num pb-2 text-[10px] text-muted-foreground">
              {health?.bridge.updatedAt
                ? `Atualizado ${new Date(health.bridge.updatedAt * 1000).toLocaleTimeString("pt-BR")}`
                : fresh
                  ? "Status atual"
                  : "Aguardando atualização"}
            </span>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Modems, gateways e conexões" className="xl:col-span-7">
          <div className="scroll-slim min-w-0 overflow-x-auto">
            <table className="rc-data-table w-full min-w-[760px] border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  {[
                    "Dispositivo / conexão",
                    "Tipo",
                    "Operadora / IP",
                    "Sinal",
                    "Status",
                    "Hoje",
                    "Mês",
                    "Última leitura",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border-b border-border/70 px-3 py-2.5 text-left font-bold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDevices.map((device) => {
                  const status = device.active ? device.status || "Ativo" : "Inativo";
                  const rssi = device.rssi == null ? null : Number(device.rssi);
                  return (
                    <tr key={device.id}>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <b>{device.name}</b>
                        <span className="block text-[10px] text-muted-foreground">
                          {device.model || device.host || "—"}
                        </span>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        {device.kind === "modem" ? "Modem" : "Gateway"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        {device.carrier || device.host || "—"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <span className="num">{rssi == null ? "N/D" : `${rssi} dBm`}</span>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <Pill tone={device.active ? "ok" : "muted"}>{status}</Pill>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 text-muted-foreground">
                        —
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 text-muted-foreground">
                        —
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {dt(device.last_seen)}
                      </td>
                    </tr>
                  );
                })}
                {visibleSessions.map((session) => {
                  const state = sessionState(session, fresh);
                  const portTraffic = trafficByPort.get(session.remotePort);
                  const lastActivity = Math.max(
                    Number(session.lastRxAt || 0),
                    Number(session.lastTxAt || 0),
                  );
                  return (
                    <tr key={`session-${session.remotePort}`}>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <b>{sessionName(session)}</b>
                        <span className="block text-[10px] text-muted-foreground">
                          Porta {session.remotePort}
                        </span>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">Bridge</td>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {fresh && session.connected ? session.remoteIp || "—" : "—"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 text-muted-foreground">
                        N/D
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <Pill tone={state.tone}>{state.label}</Pill>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {formatBytes(portTraffic?.todayBytes)}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {formatBytes(portTraffic?.monthBytes)}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {lastActivity ? dt(lastActivity) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visibleDevices.length && !visibleSessions.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem dispositivos ou conexões configuradas.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Qualidade de sinal / conexões" className="xl:col-span-5">
          {signalDevices.length ? (
            <div className="space-y-3">
              {signalDevices.slice(0, 10).map((device) => {
                const rssi = Number(device.rssi);
                const quality = Math.max(0, Math.min(100, ((rssi + 110) / 60) * 100));
                const tone =
                  quality >= 70 ? "bg-online" : quality >= 40 ? "bg-alert" : "bg-offline";
                return (
                  <div
                    key={device.id}
                    className="grid grid-cols-[120px_minmax(0,1fr)_58px] items-center gap-3 text-xs"
                  >
                    <span className="truncate font-semibold">{device.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-secondary">
                      <i
                        className={`block h-full rounded-full ${tone}`}
                        style={{ width: `${quality}%` }}
                      />
                    </span>
                    <b className="num text-right">{rssi} dBm</b>
                  </div>
                );
              })}
            </div>
          ) : sessions.length ? (
            <div className="space-y-3">
              {sessions.slice(0, 10).map((session) => {
                const state = sessionState(session, fresh);
                return (
                  <div
                    key={session.remotePort}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/55 bg-background/25 p-3"
                  >
                    <span className="min-w-0 truncate text-xs font-semibold">
                      {sessionName(session)}
                    </span>
                    <Pill tone={state.tone}>{state.label}</Pill>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma leitura de sinal disponível.
            </p>
          )}
        </Panel>
      </div>

      <ConnectivitySecondaryPanels
        traffic={traffic}
        sessions={sessions}
        healthy={healthy}
        degraded={degraded}
        fresh={fresh}
        badSessions={badSessions}
        maxTraffic={maxTraffic}
      />
    </ScreenBody>
  );
}
