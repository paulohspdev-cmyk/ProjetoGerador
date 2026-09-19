import { HeartPulse, Settings, ShieldAlert } from "lucide-react";

import { rcApi, type BridgePeerObservation, type SystemDiagnostics } from "@/lib/api";
import { Panel, ScadaTable, ScreenBody, Stats, Tone } from "./kit";
import { DiagnosticsTable, RemoteState, useRemote } from "./scada-lib";

export function HealthScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics | null>(
    () => rcApi.system.diagnostics(),
    null,
  );
  const {
    data: peerHistory,
    error: peerHistoryError,
    loading: peerHistoryLoading,
  } = useRemote<BridgePeerObservation[]>(() => rcApi.system.bridgePeers(200), []);
  const servicesOk =
    data?.services.filter((service) => service.status === "active" || service.status === "OK")
      .length ?? 0;
  const workers = data?.observability?.workers ?? [];
  const workersOk = workers.filter((worker) => worker.healthy).length;
  const workerRows = workers.map((worker) => ({ ...worker, id: worker.name }));
  const queues = data?.observability?.queues;
  const notificationPending = queues
    ? (queues.notifications["queued"] ?? 0) +
      (queues.notifications["retry"] ?? 0) +
      (queues.notifications["sending"] ?? 0)
    : 0;
  const lifecyclePending = queues
    ? (queues.lifecycle["queued"] ?? 0) + (queues.lifecycle["running"] ?? 0)
    : 0;
  const stale = queues ? queues.staleNotificationClaims + queues.staleLifecycleOperations : 0;
  const bridgeSecurity = data?.bridge.security;
  const reverseTcpRisk = bridgeSecurity?.risk === "high";
  const readiness = data?.productionReadiness;

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: HeartPulse,
            label: "Serviços OK",
            value: data ? `${servicesOk}/${data.services.length}` : "N/D",
            tone: data?.ok ? "text-online" : undefined,
          },
          {
            icon: HeartPulse,
            label: "Workers OK",
            value: data?.observability ? `${workersOk}/${workers.length}` : "N/D",
            tone: data?.observability?.healthy ? "text-online" : undefined,
          },
          {
            icon: Settings,
            label: "Filas pendentes",
            value: data?.observability ? notificationPending + lifecyclePending : "N/D",
          },
          {
            icon: Settings,
            label: "Itens travados",
            value: data?.observability ? stale : "N/D",
            tone: stale === 0 && data?.observability ? "text-online" : undefined,
          },
          {
            icon: ShieldAlert,
            label: "Reverse TCP",
            value: bridgeSecurity ? (reverseTcpRisk ? "SEM ALLOWLIST" : "PROTEGIDO") : "N/D",
            sub: bridgeSecurity?.label,
            tone: reverseTcpRisk ? "text-offline" : bridgeSecurity ? "text-online" : undefined,
          },
          {
            icon: ShieldAlert,
            label: "Produção",
            value: readiness
              ? readiness.ready
                ? "PRONTO"
                : `${readiness.blockers} BLOQUEIO(S)`
              : "N/D",
            sub: readiness ? `${readiness.warnings} aviso(s)` : undefined,
            tone: readiness?.ready ? "text-online" : readiness ? "text-offline" : undefined,
          },
        ]}
      />
      <Panel title="Saúde do sistema">
        <RemoteState loading={loading} error={error} empty={!data} />
        {data && <DiagnosticsTable data={data} />}
      </Panel>
      {readiness && (
        <Panel title="Checklist de produção">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
            <Tone tone={readiness.ready ? "ok" : "warn"}>
              {readiness.ready ? "PRONTO" : `${readiness.blockers} BLOQUEIO(S)`}
            </Tone>
            <span>{readiness.warnings} aviso(s)</span>
            <span className="text-muted-foreground">{readiness.note}</span>
          </div>
          <ScadaTable
            rows={readiness.checks.map((item) => ({ ...item, rowId: item.id }))}
            columns={[
              { label: "Verificação", render: (row) => <b>{row.label}</b> },
              {
                label: "Estado",
                render: (row) => (
                  <Tone tone={row.ok ? "ok" : "warn"}>
                    {row.ok ? "OK" : row.severity === "blocker" ? "BLOQUEIO" : "AVISO"}
                  </Tone>
                ),
              },
              { label: "Detalhe", render: (row) => row.detail },
            ]}
          />
        </Panel>
      )}
      {bridgeSecurity && (
        <Panel title="Segurança reverse TCP">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Tone tone={reverseTcpRisk ? "warn" : "ok"}>
              {reverseTcpRisk ? "RISCO" : "PROTEGIDO"}
            </Tone>
            <span>{bridgeSecurity.label || "Postura de segurança da bridge indisponível."}</span>
          </div>
          {reverseTcpRisk && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Os listeners de campo aceitam peers sem allowlist. Confirme os IPs/CIDRs legítimos
              antes de ativar o modo fail-closed para não interromper modems com endereço dinâmico.
            </p>
          )}
        </Panel>
      )}
      <Panel title="Peers reverse TCP observados">
        <RemoteState
          loading={peerHistoryLoading}
          error={peerHistoryError}
          empty={!peerHistoryLoading && peerHistory.length === 0}
        />
        {peerHistory.length > 0 && (
          <ScadaTable
            rows={peerHistory.map((peer) => ({
              ...peer,
              id: String(peer.remotePort) + "-" + peer.remoteIp,
            }))}
            columns={[
              { label: "Porta", render: (row) => <b>{row.remotePort}</b> },
              { label: "IP", render: (row) => <span className="num">{row.remoteIp}</span> },
              {
                label: "Aceitas",
                render: (row) => <span className="num">{row.acceptedCount}</span>,
              },
              {
                label: "Recusadas",
                render: (row) => <span className="num">{row.rejectedCount}</span>,
              },
              {
                label: "Primeira vez",
                render: (row) => new Date(row.firstSeenAt * 1000).toLocaleString("pt-BR"),
              },
              {
                label: "Última vez",
                render: (row) => new Date(row.lastSeenAt * 1000).toLocaleString("pt-BR"),
              },
              {
                label: "Última decisão",
                render: (row) => (
                  <Tone tone={row.lastDecision === "accepted" ? "ok" : "warn"}>
                    {row.lastDecision === "accepted" ? "ACEITA" : "RECUSADA"}
                  </Tone>
                ),
              },
              { label: "Motivo", render: (row) => row.lastReason || "—" },
            ]}
          />
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Histórico agregado por porta e IP, com retenção padrão de 90 dias. Nenhum frame ou payload
          Modbus é armazenado aqui.
        </p>
      </Panel>
      <Panel title="Workers internos">
        {workers.length ? (
          <ScadaTable
            rows={workerRows}
            columns={[
              { label: "Worker", render: (row) => <b>{row.name}</b> },
              {
                label: "Estado",
                render: (row) => <Tone tone={row.healthy ? "ok" : "warn"}>{row.status}</Tone>,
              },
              { label: "PID", render: (row) => row.pid || "—" },
              {
                label: "Heartbeat",
                render: (row) =>
                  row.ageSeconds === null
                    ? "N/D"
                    : `${row.ageSeconds}s / ${row.staleAfterSeconds ?? "?"}s`,
              },
              { label: "Detalhe", render: (row) => row.detail || "—" },
            ]}
          />
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Heartbeats individuais ainda não disponíveis nesta versão do backend.
          </p>
        )}
      </Panel>
      <Panel title="Filas internas">
        {queues ? (
          <div className="grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              Notificações pendentes: <b>{notificationPending}</b>
            </div>
            <div className="rounded-md border border-border p-3">
              Ciclo de vida pendente: <b>{lifecyclePending}</b>
            </div>
            <div className="rounded-md border border-border p-3">
              Scheduler vencido: <b>{queues.dueSchedulerJobs}</b>
            </div>
            <div className="rounded-md border border-border p-3">
              Claims/operações travadas: <b>{stale}</b>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Métricas de fila ainda não disponíveis nesta versão do backend.
          </p>
        )}
      </Panel>
    </ScreenBody>
  );
}
