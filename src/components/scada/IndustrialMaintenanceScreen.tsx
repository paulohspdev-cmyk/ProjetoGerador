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
  const { can } = useAuth();
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

  const byId = useMemo(() => new Map(generators.map((g) => [g.id, g])), [generators]);
  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    const g = byId.get(generatorId);
    if (!g) return;
    const intervalHours = hours ? Number(hours) : undefined;
    const intervalDays = days ? Number(days) : undefined;
    if (!intervalHours && !intervalDays) {
      setError("Informe intervalo por horas e/ou dias.");
      return;
    }
    const runKnown = (g.availableMetrics ?? []).includes("run_hours");
    try {
      await industrialApi.maintenance.create({
        generatorId,
        name,
        ...(intervalHours ? { intervalHours } : {}),
        ...(intervalDays ? { intervalDays } : {}),
        ...(runKnown ? { lastServiceHours: g.runHours } : {}),
      });
      setMessage(
        runKnown
          ? `Plano iniciado na leitura real de ${g.runHours.toFixed(1)} h.`
          : "Plano criado; referência por horas ficará N/D até existir run_hours homologado.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar plano.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Wrench, label: "Planos ativos", value: plans.filter((p) => p.enabled).length },
          {
            icon: AlertTriangle,
            label: "Vencidos",
            value: plans.filter((p) => p.state === "due").length,
            tone: plans.some((p) => p.state === "due") ? "text-offline" : "text-online",
          },
          {
            icon: CalendarClock,
            label: "Próximos",
            value: plans.filter((p) => p.state === "warning").length,
            tone: "text-alert",
          },
          {
            icon: Wrench,
            label: "OS abertas",
            value: workOrders.filter((w) => w.status !== "Concluída").length,
          },
        ]}
      />
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
      {can("create") && (
        <Panel title="Novo plano preventivo">
          <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-4">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Gerador
              <select
                value={generatorId}
                onChange={(e) => setGeneratorId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {generators.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.tag}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Plano
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                required
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Intervalo horas
              <input
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="250"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Intervalo dias
              <input
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
                placeholder="opcional"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <div className="sm:col-span-4">
              <button
                type="submit"
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
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
              render: (r) => <b>{r.generator_tag || r.generator_id || r.asset_id || "—"}</b>,
            },
            {
              label: "Plano",
              render: (r) => (
                <span>
                  <b>{r.name}</b>
                  <span className="block text-[10px] text-muted-foreground">{r.kind}</span>
                </span>
              ),
            },
            {
              label: "Intervalo",
              render: (r) => (
                <span className="num">
                  {[
                    r.interval_hours ? `${r.interval_hours} h` : "",
                    r.interval_days ? `${r.interval_days} d` : "",
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </span>
              ),
            },
            {
              label: "Horímetro",
              render: (r) =>
                r.current_hours == null ? (
                  "N/D"
                ) : (
                  <span className="num">{r.current_hours.toFixed(1)} h</span>
                ),
            },
            {
              label: "Restante",
              render: (r) => (
                <span className="num">
                  {[
                    r.hour_remaining != null ? `${r.hour_remaining.toFixed(1)} h` : "",
                    r.day_remaining != null ? `${r.day_remaining.toFixed(1)} d` : "",
                  ]
                    .filter(Boolean)
                    .join(" / ") || "N/D"}
                </span>
              ),
            },
            {
              label: "Estado",
              render: (r) => (
                <Pill
                  tone={
                    r.state === "due"
                      ? "err"
                      : r.state === "warning"
                        ? "warn"
                        : r.state === "ok"
                          ? "ok"
                          : "muted"
                  }
                >
                  {(r.state || "unknown").toUpperCase()}
                </Pill>
              ),
            },
            {
              label: "Último serviço",
              render: (r) => <span className="num">{dt(r.last_service_at)}</span>,
            },
            {
              label: "Ações",
              render: (r) => (
                <span className="flex flex-wrap gap-1">
                  {can("edit") && (
                    <ActionBtn
                      tone="ok"
                      onClick={() =>
                        void industrialApi.maintenance
                          .complete(
                            r.id,
                            r.current_hours ?? undefined,
                            "Conclusão registrada pelo painel",
                          )
                          .then(load)
                          .catch((err) =>
                            setError(err instanceof Error ? err.message : "Falha ao concluir"),
                          )
                      }
                    >
                      Concluir
                    </ActionBtn>
                  )}
                  {can("create") && (r.state === "due" || r.state === "warning") && (
                    <ActionBtn
                      onClick={() => {
                        const g = r.generator_id ? byId.get(r.generator_id) : undefined;
                        if (g)
                          void addWorkOrder({
                            gen: g.tag,
                            site: g.site,
                            type: `Preventiva — ${r.name}`,
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
