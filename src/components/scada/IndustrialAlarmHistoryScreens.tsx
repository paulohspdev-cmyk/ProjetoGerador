import { useCallback, useEffect, useMemo, useState } from "react";
import { History, ShieldAlert, Wrench } from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { industrialApi, type ProcessEvent } from "@/lib/industrial-api";
import { Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function severityTone(value: string): "err" | "warn" | "info" | "muted" {
  if (value === "fault") return "err";
  if (value === "alarm" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "muted";
}

export function ProcessHistoryScreen() {
  const { generators } = useGenerators();
  const [rows, setRows] = useState<ProcessEvent[]>([]);
  const [generatorId, setGeneratorId] = useState("");
  const [severity, setSeverity] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await industrialApi.processEvents.list(1000, generatorId, severity));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar histórico de processo.");
    }
  }, [generatorId, severity]);
  useEffect(() => {
    void load();
  }, [load]);
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
        Tendências, lendo o histórico de telemetria. Auditoria de usuários permanece separada em
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
