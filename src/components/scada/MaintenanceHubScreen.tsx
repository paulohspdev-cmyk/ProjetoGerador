import { ClipboardList, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type WorkOrderApi } from "@/lib/api";
import { MaintenanceV3Screen } from "./IndustrialOpsScreens";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function isFinal(status: string) {
  const value = status.trim().toLowerCase();
  return (
    value === "concluída" || value === "concluida" || value === "cancelada" || value === "cancelado"
  );
}

export function MaintenanceHubScreen() {
  const { can, users } = useAuth();
  const admin = can("manageUsers");
  const [orders, setOrders] = useState<WorkOrderApi[]>([]);
  const [editing, setEditing] = useState<WorkOrderApi | null>(null);
  const [responsible, setResponsible] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await rcApi.workOrders.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ordens de serviço.");
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(), 5000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  const setStatus = async (row: WorkOrderApi, status: string) => {
    try {
      await rcApi.workOrders.update(row.id, { status });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar OS.");
    }
  };

  const beginResponsibleEdit = (row: WorkOrderApi) => {
    setEditing(row);
    setResponsible(row.tech || "");
    setError("");
    setMessage("");
  };

  const saveResponsible = async () => {
    if (!editing) return;
    try {
      await rcApi.workOrders.update(editing.id, { tech: responsible.trim() });
      setEditing(null);
      setResponsible("");
      setMessage("Responsável atualizado.");
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar responsável.");
    }
  };

  const remove = async (row: WorkOrderApi) => {
    if (!window.confirm(`Excluir a OS ${row.id}?`)) return;
    try {
      await rcApi.workOrders.remove(row.id);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir OS.");
    }
  };

  return (
    <>
      <MaintenanceV3Screen />
      <ScreenBody>
        <Stats
          items={[
            { icon: ClipboardList, label: "Ordens de serviço", value: orders.length },
            {
              icon: ClipboardList,
              label: "Abertas",
              value: orders.filter((row) => !isFinal(row.status)).length,
            },
            {
              icon: ClipboardList,
              label: "Finalizadas",
              value: orders.filter((row) => isFinal(row.status)).length,
              tone: "text-online",
            },
            {
              icon: UserRound,
              label: "Sem responsável",
              value: orders.filter((row) => !isFinal(row.status) && !row.tech.trim()).length,
              tone: orders.some((row) => !isFinal(row.status) && !row.tech.trim())
                ? "text-alert"
                : "text-online",
            },
          ]}
        />

        {error && (
          <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl border border-online/30 bg-online/10 p-3 text-sm text-online">
            {message}
          </p>
        )}

        {editing && can("edit") && (
          <Panel title={`Responsável pela OS ${editing.id}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-semibold">
                Responsável
                <input
                  list="rc-responsible-users"
                  value={responsible}
                  onChange={(event) => setResponsible(event.target.value)}
                  placeholder="Nome da pessoa ou equipe"
                  className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
                <datalist id="rc-responsible-users">
                  {users.filter((item) => item.active).map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveResponsible()}
                  className="h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setResponsible("");
                  }}
                  className="h-11 rounded-lg border border-border px-4 text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </Panel>
        )}

        <Panel title="Ordens de serviço">
          <ScadaTable
            rows={orders}
            columns={[
              { label: "OS", render: (row) => <span className="num">{row.id}</span> },
              { label: "Gerador", render: (row) => <b>{row.gen || "—"}</b> },
              { label: "Unidade", render: (row) => row.site || "—" },
              { label: "Tipo", render: (row) => row.type },
              {
                label: "Responsável",
                render: (row) => row.tech || <span className="text-alert">Não definido</span>,
              },
              {
                label: "Status",
                render: (row) => (
                  <Pill
                    tone={
                      row.status === "Concluída"
                        ? "ok"
                        : row.status === "Cancelada"
                          ? "muted"
                          : row.status === "Urgente"
                            ? "err"
                            : "warn"
                    }
                  >
                    {row.status}
                  </Pill>
                ),
              },
              {
                label: "Ações",
                render: (row) =>
                  can("edit") ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionBtn onClick={() => beginResponsibleEdit(row)}>Responsável</ActionBtn>
                      {!isFinal(row.status) && row.status !== "Em andamento" && (
                        <ActionBtn onClick={() => void setStatus(row, "Em andamento")}>Iniciar</ActionBtn>
                      )}
                      {!isFinal(row.status) && (
                        <ActionBtn tone="ok" onClick={() => void setStatus(row, "Concluída")}>Concluir</ActionBtn>
                      )}
                      {!isFinal(row.status) && (
                        <ActionBtn onClick={() => void setStatus(row, "Cancelada")}>Cancelar</ActionBtn>
                      )}
                      {admin && isFinal(row.status) && (
                        <ActionBtn tone="danger" onClick={() => void remove(row)}>Excluir</ActionBtn>
                      )}
                    </span>
                  ) : "—",
              },
            ]}
          />
        </Panel>
      </ScreenBody>
    </>
  );
}
