import { Link } from "@tanstack/react-router";
import { BellRing, Wrench } from "lucide-react";

import { Pill } from "@/components/scada/kit";
import type { Generator } from "@/data/generators";
import type { EventItemApi, RapidTrend } from "@/lib/api";
import type { MaintenancePlan } from "@/lib/industrial-api";

import { TrendCard } from "./GeneratorDetailPrimitives";
import type { GeneratorDetailModel } from "./generator-detail-model";
import { MetricGauge } from "./GeneratorDetailProfessionalPrimitives";

type Props = {
  gen: Generator;
  model: GeneratorDetailModel;
  events: EventItemApi[];
  eventError: string;
  trend: RapidTrend | null;
  trendLoading: boolean;
  trendError: string;
  plans: MaintenancePlan[];
  maintenanceError: string;
  canStart: boolean;
  canStop: boolean;
};

export function GeneratorDetailProfessionalLower({
  gen,
  model,
  events,
  eventError,
  trend,
  trendLoading,
  trendError,
  plans,
  maintenanceError,
  canStart,
  canStop,
}: Props) {
  return (
    <>
      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-12">
        <section className="gen-detail-section rounded-xl p-4 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">Motor e alternador</h2>
            <span className="text-[10px] text-muted-foreground">
              Limites do perfil quando configurados
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-2 2xl:grid-cols-4">
            <MetricGauge
              label="Temp. motor"
              value={model.temp}
              unit="°C"
              limit={gen.metricLimits?.["coolant_temperature"]}
            />
            <MetricGauge
              label="Pressão do óleo"
              value={model.oil}
              unit="bar"
              digits={1}
              limit={gen.metricLimits?.["oil_pressure"]}
            />
            <MetricGauge
              label="Alternador"
              value={model.alt}
              unit="V"
              digits={1}
              limit={gen.metricLimits?.["alternator_voltage"]}
            />
            <MetricGauge
              label="Carga"
              value={model.load}
              unit="kW"
              limit={gen.metricLimits?.["power_kw"]}
            />
          </div>
        </section>

        <div className="min-h-[310px] xl:col-span-4 [&_.gen-card]:h-full [&_.gen-card]:rounded-xl [&_.gen-card]:border-border/70 [&_.gen-card]:bg-card/70 [&_.gen-chart-body]:min-h-[240px]">
          <TrendCard trend={trend} loading={trendLoading} error={trendError} />
        </div>

        <section className="gen-detail-section rounded-xl p-4 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold">Alarmes e eventos recentes</h2>
            <BellRing className="size-4 text-primary" />
          </div>
          <div className="divide-y divide-border/55">
            {eventError && <p className="py-5 text-xs text-offline">{eventError}</p>}
            {!eventError &&
              events.slice(0, 6).map((event) => {
                const fault = event.level === "FAULT" || event.level === "ERROR";
                const warn = event.level === "WARN" || event.level === "WARNING";
                return (
                  <div
                    key={event.id}
                    className="grid grid-cols-[54px_auto_minmax(0,1fr)] items-center gap-2 py-2.5"
                  >
                    <span className="num text-[10px] text-muted-foreground">
                      {new Date(event.created_at * 1000).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Pill tone={fault ? "err" : warn ? "warn" : "info"}>{event.level}</Pill>
                    <span className="truncate text-xs">{event.message}</span>
                  </div>
                );
              })}
            {!eventError && !events.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum evento registrado.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-12">
        <section className="gen-detail-section rounded-xl p-4 xl:col-span-7">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Plano de manutenção</h2>
            <Link
              to="/p/$slug"
              params={{ slug: "manutencao" }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver plano completo
            </Link>
          </div>
          {maintenanceError ? (
            <p className="py-5 text-xs text-offline">{maintenanceError}</p>
          ) : plans.length ? (
            <div className="scroll-slim overflow-x-auto">
              <table className="rc-data-table w-full min-w-[620px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground">
                    {["Atividade", "Periodicidade", "Restante", "Status"].map((label) => (
                      <th key={label} className="border-b border-border/65 px-3 py-2 text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, 6).map((plan) => (
                    <tr key={plan.id}>
                      <td className="border-b border-border/45 px-3 py-2.5 font-semibold">
                        {plan.name}
                      </td>
                      <td className="num border-b border-border/45 px-3 py-2.5">
                        {[
                          plan.interval_hours ? `${plan.interval_hours} h` : "",
                          plan.interval_days ? `${plan.interval_days} d` : "",
                        ]
                          .filter(Boolean)
                          .join(" / ") || "N/D"}
                      </td>
                      <td className="num border-b border-border/45 px-3 py-2.5">
                        {[
                          plan.hour_remaining != null ? `${plan.hour_remaining.toFixed(1)} h` : "",
                          plan.day_remaining != null ? `${plan.day_remaining.toFixed(1)} d` : "",
                        ]
                          .filter(Boolean)
                          .join(" / ") || "N/D"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <Pill
                          tone={
                            plan.state === "due"
                              ? "err"
                              : plan.state === "warning"
                                ? "warn"
                                : plan.state === "ok"
                                  ? "ok"
                                  : "muted"
                          }
                        >
                          {plan.state === "due"
                            ? "Vencido"
                            : plan.state === "warning"
                              ? "Próximo"
                              : plan.state === "ok"
                                ? "No prazo"
                                : "N/D"}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/25 p-4">
              <Wrench className="size-5 text-muted-foreground" />
              <div>
                <b className="text-sm">Nenhum plano vinculado a este gerador</b>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cadastre o plano no módulo de manutenção para acompanhar periodicidade e
                  vencimentos.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="gen-detail-section rounded-xl p-4 xl:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Parâmetros e comunicação</h2>
            <span className="text-[10px] text-muted-foreground">
              Somente configuração/estado real
            </span>
          </div>
          <div className="grid gap-x-5 sm:grid-cols-2">
            {[
              ["Controladora", gen.controller],
              ["Modo de operação", model.modeLabel],
              ["Transporte", gen.transport || "N/D"],
              ["Endpoint", gen.ip || "N/D"],
              ["Porta", gen.listenPort == null ? "N/D" : String(gen.listenPort)],
              ["Unit ID", gen.modbusUnit == null ? "N/D" : String(gen.modbusUnit)],
              [
                "Dispositivo interno",
                gen.rapidDeviceNum == null ? "N/D" : String(gen.rapidDeviceNum),
              ],
              [
                "Fonte de telemetria",
                gen.telemetrySource === "rapid_scada" ? "Telemetria industrial" : "N/D",
              ],
              ["START homologado", canStart ? "Sim" : "Não"],
              ["STOP homologado", canStop ? "Sim" : "Não"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-xs"
              >
                <span className="text-muted-foreground">{label}</span>
                <b className="num max-w-[58%] truncate text-right">{value}</b>
              </div>
            ))}
          </div>
          {gen.lastError && (
            <div className="mt-3 rounded-lg border border-offline/25 bg-offline/8 p-3 text-xs text-offline">
              <b>Última condição registrada:</b> {gen.lastError}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
