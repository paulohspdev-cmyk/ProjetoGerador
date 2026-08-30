import { type FormEvent, useEffect, useState } from "react";
import { FileSpreadsheet, FileText, RefreshCcw } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type ReportApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

type ReportFormat = "CSV" | "XLSX" | "PDF";

export function ReportsV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<ReportApi[]>([]);
  const [name, setName] = useState("Parque — geradores");
  const [period, setPeriod] = useState("Hoje");
  const [format, setFormat] = useState<ReportFormat>("PDF");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setRows(await rcApi.reports.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar relatórios.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await rcApi.reports.create({
        name: name.trim(),
        period: period.trim(),
        format,
      });
      setRows((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar relatório.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (row: ReportApi) => {
    if (!window.confirm(`Excluir o relatório ${row.name} e seu arquivo gerado?`)) return;
    try {
      await rcApi.reports.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir relatório.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: FileText, label: "Relatórios", value: rows.length },
          {
            icon: FileSpreadsheet,
            label: "PDF",
            value: rows.filter((r) => r.format.toUpperCase() === "PDF").length,
          },
          {
            icon: FileSpreadsheet,
            label: "XLSX/CSV",
            value: rows.filter((r) => r.format.toUpperCase() !== "PDF").length,
          },
        ]}
      />
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {can("create") && (
        <Panel title="Gerar relatório real">
          <form onSubmit={create} className="grid gap-2 md:grid-cols-4">
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
              Período / referência
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option>Hoje</option>
                <option>Últimas 24 horas</option>
                <option>Últimos 7 dias</option>
                <option>Últimos 30 dias</option>
                <option>Mensal</option>
                <option>Operacional atual</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Formato
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ReportFormat)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="PDF">PDF</option>
                <option value="XLSX">Excel XLSX</option>
                <option value="CSV">CSV</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                disabled={busy}
                type="submit"
                className="h-9 w-full rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Gerando…" : `Gerar ${format}`}
              </button>
            </div>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            O backend exporta somente métricas disponíveis na API/Rapid SCADA. Dado não homologado
            permanece ausente/N/D; o relatório não estima valores.
          </p>
        </Panel>
      )}
      <Panel
        title="Relatórios persistidos"
        actions={
          <ActionBtn onClick={() => void load()}>
            <RefreshCcw className="mr-1 inline size-3" />
            Atualizar
          </ActionBtn>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ScadaTable
            rows={rows}
            columns={[
              { label: "Relatório", render: (r) => <b>{r.name}</b> },
              { label: "Período", render: (r) => r.period },
              {
                label: "Formato",
                render: (r) => (
                  <Pill tone={r.format.toUpperCase() === "PDF" ? "info" : "muted"}>{r.format}</Pill>
                ),
              },
              {
                label: "Status",
                render: (r) => <Pill tone={r.status === "Pronto" ? "ok" : "warn"}>{r.status}</Pill>,
              },
              {
                label: "Ações",
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    <ActionBtn
                      onClick={() =>
                        void rcApi.reports
                          .download(r.id)
                          .catch((err) =>
                            setError(err instanceof Error ? err.message : "Falha no download."),
                          )
                      }
                    >
                      Baixar
                    </ActionBtn>
                    {admin && (
                      <ActionBtn tone="danger" onClick={() => void remove(r)}>
                        Excluir
                      </ActionBtn>
                    )}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}
