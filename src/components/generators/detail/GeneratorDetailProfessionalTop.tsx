import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Building2,
  Clock3,
  Cog,
  Droplets,
  Fuel,
  Gauge,
  Pencil,
  Play,
  Power,
  Radio,
  ShieldCheck,
  Thermometer,
  UtilityPole,
  Zap,
} from "lucide-react";

import { Pill } from "@/components/scada/kit";
import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

import { GeneratorEditDialog } from "../GeneratorEditDialog";
import { formatMetric } from "../generator-metrics";
import type { GeneratorDetailModel } from "./generator-detail-model";
import {
  FlowNode,
  KpiCard,
  metricTone,
  toneClass,
  type MetricTone,
} from "./GeneratorDetailProfessionalPrimitives";

type Props = {
  gen: Generator;
  model: GeneratorDetailModel;
  canStart: boolean;
  canStop: boolean;
  commandBusy: "start" | "stop" | null;
  onCommand: (action: "start" | "stop") => void | Promise<void>;
};

export function GeneratorDetailProfessionalTop({
  gen,
  model,
  canStart,
  canStop,
  commandBusy,
  onCommand,
}: Props) {
  const voltage = model.genL12 ?? model.genL1;
  const loadPercent =
    model.load != null && gen.nominalPower != null && gen.nominalPower > 0
      ? Math.max(0, Math.min(100, (model.load / gen.nominalPower) * 100))
      : null;
  const lastTelemetry = gen.lastTelemetryAt
    ? new Date(gen.lastTelemetryAt * 1000).toLocaleString("pt-BR")
    : "N/D";
  const healthTone: MetricTone =
    gen.status === "offline"
      ? "err"
      : gen.status === "alerta" || (model.alarms ?? 0) > 0
        ? "warn"
        : model.comm
          ? "ok"
          : "info";
  const healthLabel =
    gen.status === "offline"
      ? "Sem comunicação"
      : gen.status === "alerta" || (model.alarms ?? 0) > 0
        ? "Atenção"
        : model.comm
          ? "Operacional"
          : "N/D";

  return (
    <>
      <header className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/65 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-online/20 bg-online/8 text-online">
            <Cog className="size-7" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-tight">{gen.tag}</h1>
              <Pill
                tone={
                  gen.status === "online"
                    ? "ok"
                    : gen.status === "alerta"
                      ? "warn"
                      : gen.status === "offline"
                        ? "err"
                        : "muted"
                }
              >
                {gen.status === "online"
                  ? "Online"
                  : gen.status === "alerta"
                    ? "Em alerta"
                    : gen.status === "offline"
                      ? "Offline"
                      : "Não configurado"}
              </Pill>
              <Pill tone="info">{model.modeLabel}</Pill>
              {model.running === true && <Pill tone="ok">Em carga / rotação</Pill>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {model.name} · {gen.site || "Sem unidade"} · {gen.controller}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-right text-[10px] text-muted-foreground sm:block">
            Última telemetria
            <br />
            <b className="num text-foreground">{lastTelemetry}</b>
          </span>
          <GeneratorEditDialog
            generator={gen}
            trigger={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary"
              >
                <Pencil className="size-4" /> Editar
              </button>
            }
          />
          <button
            type="button"
            disabled={!canStart || commandBusy !== null}
            onClick={() => void onCommand("start")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-chart-2/45 px-3 text-xs font-semibold text-chart-2 hover:bg-chart-2/10 disabled:opacity-40"
            title={canStart ? "Partida homologada" : "START indisponível para esta controladora"}
          >
            <Play className="size-4" /> {commandBusy === "start" ? "Enviando…" : "Ligar"}
          </button>
          <button
            type="button"
            data-command="auto"
            disabled
            title="Função indisponível"
            className="hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground opacity-45 2xl:inline-flex"
          >
            AUTO
          </button>
          <button
            type="button"
            data-command="test"
            disabled
            title="Função indisponível"
            className="hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground opacity-45 2xl:inline-flex"
          >
            TEST
          </button>
          <button
            type="button"
            disabled={!canStop || commandBusy !== null}
            onClick={() => void onCommand("stop")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-offline/45 px-3 text-xs font-semibold text-offline hover:bg-offline/10 disabled:opacity-40"
            title={canStop ? "Parada homologada" : "STOP indisponível para esta controladora"}
          >
            <Power className="size-4" /> {commandBusy === "stop" ? "Enviando…" : "Desligar"}
          </button>
        </div>
      </header>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          icon={<Activity className="size-5" />}
          label="Potência ativa"
          value={formatMetric(model.load, "kW", 0)}
          sub={
            loadPercent == null ? "Potência nominal N/D" : `${loadPercent.toFixed(0)}% da nominal`
          }
          tone={metricTone(model.load, gen.metricLimits?.["power_kw"])}
        />
        <KpiCard
          icon={<Zap className="size-5" />}
          label="Tensão"
          value={formatMetric(voltage, "V", 0)}
          sub={model.genL12 != null ? "L1-L2" : model.genL1 != null ? "L1-N" : "Sem leitura"}
          tone={metricTone(voltage, gen.metricLimits?.["voltage_l1_l2"])}
        />
        <KpiCard
          icon={<Radio className="size-5" />}
          label="Frequência"
          value={formatMetric(model.frequency, "Hz", 2)}
          sub={model.frequency == null ? "Sem leitura" : "Gerador"}
          tone={metricTone(model.frequency, gen.metricLimits?.["frequency"])}
        />
        <KpiCard
          icon={<Gauge className="size-5" />}
          label="Rotação"
          value={formatMetric(model.rpm, "rpm", 0)}
          sub={
            model.running == null ? "Estado N/D" : model.running ? "Rotação detectada" : "Parado"
          }
          tone={metricTone(model.rpm, gen.metricLimits?.["rpm"])}
        />
        <KpiCard
          icon={<Fuel className="size-5" />}
          label="Combustível"
          value={formatMetric(model.fuel, "%", 0)}
          sub={model.fuel == null ? "Sem leitura" : "Nível medido"}
          tone={metricTone(model.fuel, gen.metricLimits?.["fuel_level"])}
        />
        <KpiCard
          icon={<Clock3 className="size-5" />}
          label="Horímetro"
          value={formatMetric(model.runHours, "h", 1)}
          sub="Total acumulado"
          tone="info"
        />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <section className="gen-detail-section rounded-xl p-4 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Fluxo de potência</h2>
            <span className="text-[10px] text-muted-foreground">
              Estados provenientes da telemetria disponível
            </span>
          </div>
          <div className="scroll-slim flex min-w-0 items-center justify-between gap-2 overflow-x-auto pb-2">
            <FlowNode
              icon={<UtilityPole className="size-6" />}
              label="REDE"
              value={formatMetric(model.mainsL12 ?? model.mainsL1, "V", 0)}
              sub={model.mainsPresent ? "Presente" : model.mainsKnown ? "Ausente" : "N/D"}
              active={model.mainsPresent}
            />
            <ArrowRight
              className={cn(
                "size-5 shrink-0",
                model.mainsPresent ? "text-online" : "text-muted-foreground",
              )}
            />
            <FlowNode
              icon={<ShieldCheck className="size-6" />}
              label="DISJUNTORES"
              value={model.mcbKnown ? (model.mcb ? "MCB I" : "MCB O") : "MCB N/D"}
              sub={model.gcbKnown ? (model.gcb ? "GCB fechado" : "GCB aberto") : "GCB N/D"}
              active={model.mcb || model.gcb}
            />
            <ArrowRight
              className={cn("size-5 shrink-0", model.gcb ? "text-online" : "text-muted-foreground")}
            />
            <FlowNode
              icon={<Cog className="size-6" />}
              label="GERADOR"
              value={formatMetric(model.load, "kW", 0)}
              sub={`${formatMetric(model.rpm, "rpm", 0)} · ${formatMetric(model.frequency, "Hz", 1)}`}
              active={model.running === true}
            />
            <ArrowRight
              className={cn(
                "size-5 shrink-0",
                model.running ? "text-online" : "text-muted-foreground",
              )}
            />
            <FlowNode
              icon={<Building2 className="size-6" />}
              label="CARGA"
              value={formatMetric(model.load, "kW", 0)}
              sub={loadPercent == null ? "Percentual N/D" : `${loadPercent.toFixed(0)}% da nominal`}
              active={model.running === true && (model.load ?? 0) > 0}
            />
          </div>
        </section>

        <section className="gen-detail-section rounded-xl p-4 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Saúde do equipamento</h2>
            <Pill
              tone={
                healthTone === "ok"
                  ? "ok"
                  : healthTone === "warn"
                    ? "warn"
                    : healthTone === "err"
                      ? "err"
                      : "muted"
              }
            >
              {healthLabel}
            </Pill>
          </div>
          <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="grid place-items-center">
              <div
                className={cn(
                  "grid size-28 place-items-center rounded-full border-[10px] bg-background/30",
                  healthTone === "ok"
                    ? "border-online"
                    : healthTone === "warn"
                      ? "border-alert"
                      : healthTone === "err"
                        ? "border-offline"
                        : "border-muted",
                )}
              >
                <div className="text-center">
                  <ShieldCheck className={cn("mx-auto size-7", toneClass(healthTone))} />
                  <b className="mt-1 block text-sm">{healthLabel}</b>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border/55 text-xs">
              {[
                {
                  icon: Thermometer,
                  label: "Temperatura do motor",
                  value: formatMetric(model.temp, "°C", 0),
                  tone: metricTone(model.temp, gen.metricLimits?.["coolant_temperature"]),
                },
                {
                  icon: Droplets,
                  label: "Pressão do óleo",
                  value: formatMetric(model.oil, "bar", 1),
                  tone: metricTone(model.oil, gen.metricLimits?.["oil_pressure"]),
                },
                {
                  icon: BatteryCharging,
                  label: "Tensão da bateria",
                  value: formatMetric(model.batt, "V", 1),
                  tone: metricTone(model.batt, gen.metricLimits?.["battery_voltage"]),
                },
                {
                  icon: Fuel,
                  label: "Nível de combustível",
                  value: formatMetric(model.fuel, "%", 0),
                  tone: metricTone(model.fuel, gen.metricLimits?.["fuel_level"]),
                },
                {
                  icon: Radio,
                  label: "Comunicação",
                  value: model.comm ? "Online" : gen.status === "offline" ? "Offline" : "N/D",
                  tone: model.comm
                    ? ("ok" as MetricTone)
                    : gen.status === "offline"
                      ? ("err" as MetricTone)
                      : ("info" as MetricTone),
                },
                {
                  icon: Cog,
                  label: "Controladora",
                  value: gen.controller,
                  tone: model.comm ? ("ok" as MetricTone) : ("info" as MetricTone),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-2 py-2"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">{item.label}</span>
                  <b className="num max-w-44 truncate text-right">{item.value}</b>
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      item.tone === "ok"
                        ? "bg-online"
                        : item.tone === "warn"
                          ? "bg-alert"
                          : item.tone === "err"
                            ? "bg-offline"
                            : "bg-chart-2",
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
