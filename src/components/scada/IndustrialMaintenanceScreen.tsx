import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Wrench } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { industrialApi, type MaintenancePlan } from "@/lib/industrial-api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

export function MaintenanceV3Screen() {
  const { generators } = useGenerators();
  const { workOrders, addWorkOrder } = useScadaOps();
  const { can, user } = useAuth();
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [generatorId, setGeneratorId] = useState("");
  const [name, setName] = useState("Preventiva");
  const [hours, setHours] = useState("250");
  const [days, setDays] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setPlans(await industrialApi.maintenance.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar manutenção.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!generatorId && generators.length) setGeneratorId(generators[0]!.id);
  }, [generatorId, generators]);

  const byId = useMemo(
    () => new Map(generators.map((generator) => [generator.id, generator])),
    [generators],
  );

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const generator = byId.get(generatorId);
    if (!generator) return;
    const intervalHours = hours ? Number(hours) : undefined;
    const intervalDays = days ? Number(days) : undefined;
    if (!intervalHours && !intervalDays) {
      setError("Informe o intervalo por horas e/ou dias.");
      return;
    }
    const runKnown = (generator.availableMetrics ?? []).includes("run_hours");
    try {
      await industrialApi.maintenance.create({
        generatorId,
        name,
        ...(intervalHours ? { intervalHours } : {}),
        ...(intervalDays ? { intervalDays } : {}),
        ...(runKnown ? { lastServiceHours: generator.runHours } : {}),
      });
      setMessage("Plano de manutenção criado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar plano.");
    }
  };

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Manutenção</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Planeje preventivas e acompanhe o que está próximo do vencimento.
        </p>
      </div>

      <Stats
        items={[
          {
            icon: Wrench,
            label: "Planos ativos",
            value: plans.filter((plan) => plan.enabled).length,
          },
          {
            icon: AlertTriangle,
            label: "Vencidos",
            value: plans.filter((plan) => plan.state === "due").length,
            tone: plans.some((plan) => plan.state === "due") ? "text-offline" : "text-online",
          },
          {
            icon: CalendarClock,
            label: "Próximos",
            value: plans.filter((plan) => plan.state === "warning").length,
            tone: "text-alert",
          },
          {
            icon: Wrench,
            label: "OS abertas",
            value: workOrders.filter((workOrder) => workOrder.status !== "Concluída").length,
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

      {can("create") && (
        <Panel title="Novo plano preventivo">
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold">
              Gerador
              <select
                value={generatorId}
                onChange={(event) => setGeneratorId(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {generators.map((generator) => (
                  <option key={generator.id} value={generator.id}>
                    {generator.tag}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Plano
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                required
              />
            </label>
            <label className="text-sm font-semibold">
              A cada quantas horas?
              <input
                inputMode="decimal"
                value={hours}
                onChange={(event) => setHours(event.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="250"
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="text-sm font-semibold">
              Ou a cada quantos dias?
              <input
                inputMode="numeric"
                value={days}
                onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
                placeholder="Opcional"
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
            <div className="sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Criar plano
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Planos de manutenção">
        <ScadaTable
          rows={plans}
          columns={[
            {
              label: "Gerador",
              render: (row) => (
                <b>{row.generator_tag || row.generator_id || row.asset_id || "—"}</b>
              ),
            },
            { label: "Plano", render: (row) => <b>{row.name}</b> },
            {
              label: "Intervalo",
              render: (row) => (
                <span className="num">
                  {[
                    row.interval_hours ? `${row.interval_hours} h` : "",
                    row.interval_days ? `${row.interval_days} d` : "",
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </span>
              ),
            },
            {
              label: "Horímetro",
              render: (row) =>
                row.current_hours == null ? (
                  "N/D"
                ) : (
                  <span className="num">{row.current_hours.toFixed(1)} h</span>
                ),
            },
            {
              label: "Restante",
              render: (row) => (
                <span className="num">
                  {[
                    row.hour_remaining != null ? `${row.hour_remaining.toFixed(1)} h` : "",
                    row.day_remaining != null ? `${row.day_remaining.toFixed(1)} d` : "",
                  ]
                    .filter(Boolean)
                    .join(" / ") || "N/D"}
                </span>
              ),
            },
            {
              label: "Estado",
              render: (row) => (
                <Pill
                  tone={
                    row.state === "due"
                      ? "err"
                      : row.state === "warning"
                        ? "warn"
                        : row.state === "ok"
                          ? "ok"
                          : "muted"
                  }
                >
                  {row.state === "due"
                    ? "VENCIDO"
                    : row.state === "warning"
                      ? "PRÓXIMO"
                      : row.state === "ok"
                        ? "OK"
                        : "N/D"}
                </Pill>
              ),
            },
            {
              label: "Último serviço",
              render: (row) => <span className="num">{dt(row.last_service_at)}</span>,
            },
            {
              label: "Ações",
              render: (row) => (
                <span className="flex flex-wrap gap-1">
                  {can("edit") && (
                    <ActionBtn
                      tone="ok"
                      onClick={() =>
                        void industrialApi.maintenance
                          .complete(
                            row.id,
                            row.current_hours ?? undefined,
                            "Conclusão registrada pelo painel",
                          )
                          .then(load)
                          .catch((err) =>
                            setError(err instanceof Error ? err.message : "Falha ao concluir"),
                          )
                      }
                    >
                      Registrar serviço
                    </ActionBtn>
                  )}
                  {can("create") && (row.state === "due" || row.state === "warning") && (
                    <ActionBtn
                      onClick={() => {
                        const generator = row.generator_id ? byId.get(row.generator_id) : undefined;
                        if (generator)
                          addWorkOrder({
                            gen: generator.tag,
                            site: generator.site,
                            type: `Preventiva — ${row.name}`,
                            tech: user?.name || "",
                          });
                      }}
                    >
                      Abrir OS
                    </ActionBtn>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
