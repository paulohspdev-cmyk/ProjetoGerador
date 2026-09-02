import { type FormEvent, useEffect, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type AuditItem } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody } from "./kit";
import { dateTime } from "./operation-helpers";

export function HistoryScreen() {
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.audit
      .list(1000)
      .then((data) => {
        if (active) {
          setRows(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Falha ao consultar histórico operacional.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const tableRows = rows.map((r) => ({ ...r, id: String(r.id) }));
  return (
    <ScreenBody>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      <Panel title="Histórico operacional auditável">
        {!tableRows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum evento auditável disponível.
          </p>
        ) : (
          <ScadaTable
            rows={tableRows}
            columns={[
              {
                label: "Quando",
                render: (r) => <span className="num">{dateTime(r.created_at)}</span>,
              },
              { label: "Origem", render: (r) => <b>{r.actor}</b> },
              { label: "Ação", render: (r) => r.action },
              { label: "Entidade", render: (r) => `${r.entity_type} / ${r.entity_id}` },
              { label: "Detalhe", render: (r) => r.detail || "—" },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}

export function ReportsScreen() {
  const { generators } = useGenerators();
  const { reports, generateReport, downloadReport } = useScadaOps();
  const [name, setName] = useState("Parque — geradores");
  const [period, setPeriod] = useState("Hoje");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    generateReport({ name, period, format: "CSV" }, generators);
  };

  return (
    <ScreenBody>
      <Panel title="Gerar relatório">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              required
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Período / referência
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              required
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Gerar CSV real
            </button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          O relatório exporta somente dados disponíveis; ausência permanece N/D.
        </p>
      </Panel>
      <Panel title="Relatórios">
        {!reports.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum relatório gerado.</p>
        ) : (
          <ScadaTable
            rows={reports}
            columns={[
              { label: "ID", render: (r) => <span className="num">{r.id}</span> },
              { label: "Relatório", render: (r) => <b>{r.name}</b> },
              { label: "Período", render: (r) => r.period },
              { label: "Formato", render: (r) => r.format },
              {
                label: "Status",
                render: (r) => <Pill tone={r.status === "Pronto" ? "ok" : "warn"}>{r.status}</Pill>,
              },
              {
                label: "Download",
                render: (r) => (
                  <ActionBtn onClick={() => downloadReport(r.id, generators)}>Baixar</ActionBtn>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}
