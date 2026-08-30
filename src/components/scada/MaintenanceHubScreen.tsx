import { ClipboardList } from "lucide-react";
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
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [orders, setOrders] = useState<WorkOrderApi[]>([]);
  const [error, setError] = useState("");

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
  const remove = async (row: WorkOrderApi) => {
    if (!window.confirm(`Excluir a OS ${row.id}? Somente OS finalizada pode ser excluída.`)) return;
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
          ]}
        />
        {error && (
          <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
            {error}
          </p>
        )}
        <Panel title="Ordens de serviço persistidas">
          <ScadaTable
            rows={orders}
            columns={[
              { label: "OS", render: (r) => <span className="num">{r.id}</span> },
              { label: "Gerador", render: (r) => <b>{r.gen || "—"}</b> },
              { label: "Site", render: (r) => r.site || "—" },
              { label: "Tipo", render: (r) => r.type },
              { label: "Técnico", render: (r) => r.tech || "—" },
              {
                label: "Status",
                render: (r) => (
                  <Pill
                    tone={
                      r.status === "Concluída"
                        ? "ok"
                        : r.status === "Cancelada"
                          ? "muted"
                          : r.status === "Urgente"
                            ? "err"
                            : "warn"
                    }
                  >
                    {r.status}
                  </Pill>
                ),
              },
              {
                label: "Ações",
                render: (r) =>
                  can("edit") ? (
                    <span className="flex flex-wrap gap-1">
                      {!isFinal(r.status) && r.status !== "Em andamento" && (
                        <ActionBtn onClick={() => void setStatus(r, "Em andamento")}>
                          Iniciar
                        </ActionBtn>
                      )}
                      {!isFinal(r.status) && (
                        <ActionBtn tone="ok" onClick={() => void setStatus(r, "Concluída")}>
                          Concluir
                        </ActionBtn>
                      )}
                      {!isFinal(r.status) && (
                        <ActionBtn onClick={() => void setStatus(r, "Cancelada")}>
                          Cancelar
                        </ActionBtn>
                      )}
                      {admin && isFinal(r.status) && (
                        <ActionBtn tone="danger" onClick={() => void remove(r)}>
                          Excluir
                        </ActionBtn>
                      )}
                    </span>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </Panel>
      </ScreenBody>
    </>
  );
}
