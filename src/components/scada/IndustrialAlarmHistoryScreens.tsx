import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  History,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import {
  industrialApi,
  type IndustrialAlarm,
  type ProcessEvent,
} from "@/lib/industrial-api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function severityTone(value: string): "err" | "warn" | "info" | "muted" {
  if (value === "fault") return "err";
  if (value === "alarm" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "muted";
}

export function IndustrialAlarmsScreen() {
  const { generators } = useGenerators();
  const { can } = useAuth();
  const [rows, setRows] = useState<IndustrialAlarm[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setRows(await industrialApi.alarms.list(true));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar alarmes industriais.");
    }
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const tagById = useMemo(() => new Map(generators.map((g) => [g.id, g.tag])), [generators]);
  const pending = rows.filter((r) => !r.acked_at);

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: BellRing,
            label: "Ativos",
            value: rows.length,
            tone: rows.length ? "text-alert" : "text-online",
          },
          {
            icon: ShieldAlert,
            label: "Falhas",
            value: rows.filter((r) => r.severity === "fault").length,
            tone: "text-offline",
          },
          {
            icon: AlertTriangle,
            label: "Não reconhecidos",
            value: pending.length,
            tone: pending.length ? "text-alert" : "text-online",
          },
          {
            icon: CheckCircle2,
            label: "Reconhecidos",
            value: rows.filter((r) => !!r.acked_at).length,
          },
        ]}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        A fila registra somente condições comprováveis. Perda de comunicação, estado de alerta e
        alarm_count entram quando realmente observados; causas nativas individuais só aparecem
        depois que o Controller Pack homologar seus códigos/bitfields.
      </p>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      <Panel title="Alarmes industriais ativos">
        <ScadaTable
          rows={rows.map((r) => ({ ...r, id: r.alarm_key }))}
          columns={[
            {
              label: "Gerador / asset",
              render: (r) => (
                <b>
                  {r.generator_id
                    ? tagById.get(r.generator_id) || r.generator_id
                    : r.asset_id || "Sistema"}
                </b>
              ),
            },
            {
              label: "Severidade",
              render: (r) => (
                <Pill tone={severityTone(r.severity)}>{r.severity.toUpperCase()}</Pill>
              ),
            },
            { label: "Código", render: (r) => <span className="num">{r.code || "—"}</span> },
            { label: "Mensagem", render: (r) => r.message },
            { label: "Fonte", render: (r) => <span className="num text-[10px]">{r.source}</span> },
            { label: "Desde", render: (r) => <span className="num">{dt(r.first_seen)}</span> },
            {
              label: "ACK",
              render: (r) =>
                r.acked_at ? (
                  <span>
                    <Tone tone="ok">Sim</Tone>
                    <span className="block text-[10px] text-muted-foreground">{r.acked_by}</span>
                  </span>
                ) : can("operate") ? (
                  <ActionBtn
                    onClick={() =>
                      void industrialApi.alarms
                        .ack(r.alarm_key)
                        .then(load)
                        .catch((err) =>
                          setError(err instanceof Error ? err.message : "Falha no ACK"),
                        )
                    }
                  >
                    Reconhecer
                  </ActionBtn>
                ) : (
                  <Tone tone="warn">Pendente</Tone>
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ProcessHistoryScreen() {
  const { generators } = useGenerators();
  const [rows, setRows] = useState<ProcessEvent[]>([]);
  const [generatorId, setGeneratorId] = useState("");
  const [severity, setSeverity] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setRows(await industrialApi.processEvents.list(1000, generatorId, severity));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar histórico de processo.");
    }
  };
  useEffect(() => {
    void load();
  }, [generatorId, severity]);
  const tagById = useMemo(() => new Map(generators.map((g) => [g.id, g.tag])), [generators]);

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: History, label: "Eventos de processo", value: rows.length },
          {
            icon: ShieldAlert,
            label: "Alarmes/falhas",
            value: rows.filter((r) => r.event_type.startsWith("alarm_")).length,
          },
          {
            icon: Wrench,
            label: "Manutenções",
            value: rows.filter((r) => r.event_type === "maintenance_completed").length,
          },
        ]}
      />
      <Panel title="Filtros">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Gerador
            <select
              value={generatorId}
              onChange={(e) => setGeneratorId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos</option>
              {generators.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.tag}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Severidade
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todas</option>
              <option value="fault">Fault</option>
              <option value="alarm">Alarm</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
        </div>
      </Panel>
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Este histórico é de eventos/estados industriais. Tendências analógicas continuam no menu
        Tendências, lendo o archive do Rapid SCADA. Auditoria de usuários permanece separada em
        Gestão → Auditoria.
      </p>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      <Panel title="Linha do tempo de processo">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Quando", render: (r) => <span className="num">{dt(r.created_at)}</span> },
            {
              label: "Gerador / asset",
              render: (r) => (
                <b>
                  {r.generator_id
                    ? tagById.get(r.generator_id) || r.generator_id
                    : r.asset_id || "Sistema"}
                </b>
              ),
            },
            { label: "Evento", render: (r) => r.event_type },
            {
              label: "Severidade",
              render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>,
            },
            { label: "Código", render: (r) => <span className="num">{r.code || "—"}</span> },
            { label: "Mensagem", render: (r) => r.message },
            { label: "Fonte", render: (r) => <span className="num text-[10px]">{r.source}</span> },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
