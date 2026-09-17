import { HeartPulse, Settings } from "lucide-react";

import { rcApi, type SystemDiagnostics } from "@/lib/api";
import { Panel, ScadaTable, ScreenBody, Stats, Tone } from "./kit";
import { DiagnosticsTable, RemoteState, useRemote } from "./scada-lib";

export function HealthScreen() {
  const { data, error, loading } = useRemote<SystemDiagnostics | null>(
    () => rcApi.system.diagnostics(),
    null,
  );
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
        ]}
      />
      <Panel title="Saúde do sistema">
        <RemoteState loading={loading} error={error} empty={!data} />
        {data && <DiagnosticsTable data={data} />}
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
