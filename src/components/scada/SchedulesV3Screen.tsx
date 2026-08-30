import { type FormEvent, useEffect, useState } from "react";
import { CalendarClock, FileText, HardDriveDownload, Bell } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type SchedulerJob } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

type JobKind = "backup" | "report" | "notification";

function fmtInterval(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} dia(s)`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

function payloadString(payload: Record<string, unknown> | undefined, key: string, fallback = "") {
  const value = payload?.[key];
  return typeof value === "string" ? value : fallback;
}

export function SchedulesV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<SchedulerJob[]>([]);
  const [editing, setEditing] = useState<SchedulerJob | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<JobKind>("backup");
  const [interval, setInterval] = useState("86400");
  const [reportFormat, setReportFormat] = useState("PDF");
  const [channel, setChannel] = useState("panel");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRows(await rcApi.scheduler.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar agendamentos.");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setKind("backup");
    setInterval("86400");
    setReportFormat("PDF");
    setChannel("panel");
    setDestination("");
  };

  const beginEdit = (row: SchedulerJob) => {
    const jobKind = row.kind as JobKind;
    setEditing(row);
    setName(row.name);
    setKind(jobKind);
    setInterval(String(row.interval_seconds));
    setReportFormat(payloadString(row.payload, "format", "PDF"));
    setChannel(payloadString(row.payload, "channel", "panel"));
    setDestination(payloadString(row.payload, "destination"));
    setError("");
    setMessage("");
  };

  const buildPayload = () =>
    kind === "report"
      ? { name: name.trim() || "Relatório agendado", period: "Agendado", format: reportFormat }
      : kind === "notification"
        ? {
            channel,
            destination: destination.trim(),
            subject: name.trim() || "RC Geradores",
            body: "Agendamento executado",
          }
        : {};

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    const intervalSeconds = Number(interval);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60) {
      setError("O intervalo mínimo é 60 segundos.");
      return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await rcApi.scheduler.update(editing.id, {
          name: name.trim(),
          kind,
          interval_seconds: intervalSeconds,
          payload,
          enabled: editing.enabled,
        });
        setMessage("Agendamento atualizado.");
      } else {
        await rcApi.scheduler.create({
          name: name.trim(),
          kind,
          interval_seconds: intervalSeconds,
          payload,
          enabled: true,
        });
        setMessage("Agendamento criado.");
      }
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar agendamento.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: SchedulerJob) => {
    try {
      await rcApi.scheduler.update(row.id, {
        name: row.name,
        kind: row.kind as JobKind,
        interval_seconds: row.interval_seconds,
        payload: row.payload ?? {},
        enabled: !row.enabled,
      });
      setMessage(row.enabled ? "Agendamento pausado." : "Agendamento reativado.");
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar agendamento.");
    }
  };

  const remove = async (row: SchedulerJob) => {
    if (!window.confirm(`Excluir o job administrativo ${row.name}?`)) return;
    try {
      await rcApi.scheduler.remove(row.id);
      if (editing?.id === row.id) reset();
      setMessage("Agendamento excluído.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir agendamento.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: CalendarClock, label: "Jobs persistentes", value: rows.length },
          {
            icon: HardDriveDownload,
            label: "Backups",
            value: rows.filter((r) => r.kind === "backup").length,
          },
          {
            icon: FileText,
            label: "Relatórios",
            value: rows.filter((r) => r.kind === "report").length,
          },
          {
            icon: Bell,
            label: "Notificações",
            value: rows.filter((r) => r.kind === "notification").length,
          },
        ]}
      />
      <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">
        Scheduler fechado: aceita exclusivamente backup, relatório e notificação. START, STOP,
        transferência, MCB, GCB e paralelismo não fazem parte deste motor.
      </p>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">
          {message}
        </p>
      )}

      {admin && (
        <Panel title={editing ? "Editar job administrativo" : "Novo job administrativo"}>
          <form onSubmit={save} className="grid gap-2 md:grid-cols-4">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Nome
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Tipo
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as JobKind)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="backup">Backup</option>
                <option value="report">Relatório</option>
                <option value="notification">Notificação</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Intervalo
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="3600">1 hora</option>
                <option value="21600">6 horas</option>
                <option value="43200">12 horas</option>
                <option value="86400">1 dia</option>
                <option value="604800">7 dias</option>
                <option value="2592000">30 dias</option>
              </select>
            </label>
            {kind === "report" && (
              <label className="text-[11px] font-semibold text-muted-foreground">
                Formato
                <select
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option>PDF</option>
                  <option>XLSX</option>
                  <option>CSV</option>
                </select>
              </label>
            )}
            {kind === "notification" && (
              <>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Canal
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="panel">Painel</option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Destino
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="quando aplicável"
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
              </>
            )}
            <div className="flex items-end gap-1">
              <button
                disabled={busy}
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : editing ? "Salvar" : "Criar job"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={reset}
                  className="h-9 rounded-md border border-border px-3 text-xs"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Scheduler administrativo">
        <ScadaTable
          rows={rows}
          min="940px"
          columns={[
            { label: "Nome", render: (r) => <b>{r.name}</b> },
            { label: "Tipo", render: (r) => <Pill>{r.kind}</Pill> },
            {
              label: "Intervalo",
              render: (r) => <span className="num">{fmtInterval(r.interval_seconds)}</span>,
            },
            {
              label: "Próxima execução",
              render: (r) => (
                <span className="num">{new Date(r.next_run * 1000).toLocaleString("pt-BR")}</span>
              ),
            },
            { label: "Último resultado", render: (r) => r.last_result || "—" },
            {
              label: "Estado",
              render: (r) => (
                <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativo" : "Pausado"}</Pill>
              ),
            },
            {
              label: "Ações",
              render: (r) =>
                admin ? (
                  <span className="flex flex-wrap gap-1">
                    <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>
                    <ActionBtn onClick={() => void toggle(r)}>
                      {r.enabled ? "Pausar" : "Reativar"}
                    </ActionBtn>
                    <ActionBtn tone="danger" onClick={() => void remove(r)}>
                      Excluir
                    </ActionBtn>
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
