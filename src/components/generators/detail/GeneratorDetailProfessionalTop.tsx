import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Clock3,
  Cog,
  Droplets,
  Fuel,
  Gauge,
  Pencil,
  Radio,
  ShieldCheck,
  Thermometer,
  Zap,
} from "lucide-react";

import { Pill } from "@/components/scada/kit";
import { generatorDisplayStatus, type Generator } from "@/data/generators";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { GeneratorEditDialog } from "../GeneratorEditDialog";
import {
  IconBreakerClosed,
  IconBreakerOpen,
  IconGenerator,
  IconLoad,
  IconMains,
  IconStart,
  IconStop,
} from "../scada-icons";
import { readGeneratorTelemetry } from "../generator-health";
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
  canAction: (action: IndustrialCommandAction) => boolean;
  commandBusy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void | Promise<void>;
};

export function GeneratorDetailProfessionalTop({
  gen,
  model,
  canAction,
  commandBusy,
  onCommand,
}: Props) {
  const voltage = model.genL12 ?? model.genL1;
  const telemetry = readGeneratorTelemetry(gen);
  const fuelUnit = gen.metricUnits?.["fuel_level"]?.trim() || "";
  const fuelTone: MetricTone =
    telemetry.tones.fuel === "critical"
      ? "err"
      : telemetry.tones.fuel === "warning"
        ? "warn"
        : telemetry.tones.fuel === "good"
          ? "ok"
          : "info";
  const oilUnit = gen.metricUnits?.["oil_pressure"]?.trim() || "";
  const coolantUnit = gen.metricUnits?.["coolant_temperature"]?.trim() || "";
  const loadPercent =
    model.load != null && model.nominalPower != null && model.nominalPower > 0
      ? Math.max(0, Math.min(100, (model.load / model.nominalPower) * 100))
      : null;
  const lastTelemetry = gen.lastTelemetryAt
    ? new Date(gen.lastTelemetryAt * 1000).toLocaleString("pt-BR")
    : "N/D";
  const displayStatus = generatorDisplayStatus(gen);
  const healthTone: MetricTone =
    displayStatus === "stale" || displayStatus === "offline"
      ? "err"
      : displayStatus === "alerta" || (model.alarms ?? 0) > 0
        ? "warn"
        : model.comm
          ? "ok"
          : "info";
  const healthLabel =
    displayStatus === "stale"
      ? "Comunicação perdida"
      : displayStatus === "offline"
        ? "Sem comunicação"
        : displayStatus === "alerta" || (model.alarms ?? 0) > 0
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
                  displayStatus === "online"
                    ? "ok"
                    : displayStatus === "alerta"
                      ? "warn"
                      : displayStatus === "offline" || displayStatus === "stale"
                        ? "err"
                        : "muted"
                }
              >
                {displayStatus === "stale"
                  ? "Comunicação perdida"
                  : displayStatus === "online"
                    ? "Online"
                    : displayStatus === "alerta"
                      ? "Em alerta"
                      : displayStatus === "offline"
                        ? "Offline"
                        : "Não configurado"}
              </Pill>
              <Pill tone="info">{model.modeLabel}</Pill>
              {model.mainsToBus && model.generatorToBus ? (
                <Pill tone="ok">Em paralelo</Pill>
              ) : model.generatorToBus ? (
                <Pill tone="ok">Alimentando barramento</Pill>
              ) : model.running === true ? (
                <Pill tone="info">Em rotação</Pill>
              ) : null}
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
            disabled={!canAction("start") || commandBusy !== null}
            onClick={() => void onCommand("start")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-chart-2/45 px-3 text-xs font-semibold text-chart-2 hover:bg-chart-2/10 disabled:opacity-40"
            title={
              canAction("start")
                ? "Partida homologada"
                : "START indisponível para esta controladora"
            }
          >
            <IconStart size={16} /> {commandBusy === "start" ? "Enviando…" : "Ligar"}
          </button>
          <button
            type="button"
            data-command="manual"
            disabled={!canAction("manual") || commandBusy !== null}
            title={canAction("manual") ? "MANUAL homologado" : "MANUAL ainda não homologado"}
            onClick={() => void onCommand("manual")}
            className="hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground disabled:opacity-40 2xl:inline-flex"
          >
            {commandBusy === "manual" ? "…" : "MAN"}
          </button>
          <button
            type="button"
            data-command="auto"
            disabled={!canAction("auto") || commandBusy !== null}
            title={canAction("auto") ? "AUTO homologado" : "AUTO ainda não homologado"}
            onClick={() => void onCommand("auto")}
            className="hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground disabled:opacity-40 2xl:inline-flex"
          >
            {commandBusy === "auto" ? "…" : "AUTO"}
          </button>
          <button
            type="button"
            data-command="test"
            disabled={!canAction("test") || commandBusy !== null}
            title={canAction("test") ? "TEST homologado" : "TEST ainda não homologado"}
            onClick={() => void onCommand("test")}
            className="hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground disabled:opacity-40 2xl:inline-flex"
          >
            {commandBusy === "test" ? "…" : "TEST"}
          </button>
          <button
            type="button"
            disabled={!canAction("stop") || commandBusy !== null}
            onClick={() => void onCommand("stop")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-offline/45 px-3 text-xs font-semibold text-offline hover:bg-offline/10 disabled:opacity-40"
            title={
              canAction("stop") ? "Parada homologada" : "STOP indisponível para esta controladora"
            }
          >
            <IconStop size={16} /> {commandBusy === "stop" ? "Enviando…" : "Desligar"}
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
          value={formatMetric(model.fuel, fuelUnit, 0)}
          sub={
            model.fuel == null
              ? "Sem leitura"
              : telemetry.fuelOutOfRange
                ? "Acima da capacidade informada"
                : "Nível medido"
          }
          tone={fuelTone}
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
              icon={<IconMains size={24} />}
              label="REDE"
              value={formatMetric(model.mainsL12 ?? model.mainsL1, "V", 0)}
              sub={model.mainsPresent ? "Presente" : model.mainsKnown ? "Ausente" : "N/D"}
              active={model.mainsPresent}
            />
            <ArrowRight
              className={cn(
                "size-5 shrink-0",
                model.mainsToBus ? "text-online" : "text-muted-foreground",
              )}
            />
            <FlowNode
              icon={
                model.mcb && model.gcb ? (
                  <IconBreakerClosed size={24} />
                ) : (
                  <IconBreakerOpen size={24} />
                )
              }
              label="DISJUNTORES"
              value={model.mcbKnown ? (model.mcb ? "MCB I" : "MCB O") : "MCB N/D"}
              sub={model.gcbKnown ? (model.gcb ? "GCB fechado" : "GCB aberto") : "GCB N/D"}
              active={model.mcb || model.gcb}
            />
            <ArrowRight
              className={cn(
                "size-5 shrink-0",
                model.generatorToBus ? "text-online" : "text-muted-foreground",
              )}
            />
            <FlowNode
              icon={<Cog className="size-6" />}
              label="GERADOR"
              value={formatMetric(model.load, "kW", 0)}
              sub={`${formatMetric(model.rpm, "rpm", 0)} · ${formatMetric(model.frequency, "Hz", 1)}`}
              active={model.generatorPresent}
            />
            <ArrowRight
              className={cn(
                "size-5 shrink-0",
                model.busLive ? "text-online" : "text-muted-foreground",
              )}
            />
            <FlowNode
              icon={<IconLoad size={24} />}
              label="CARGA"
              value={formatMetric(model.busLoadKw, "kW", 0)}
              sub={
                model.busLoadKw == null
                  ? model.busLive
                    ? "Carga total não medida"
                    : "Barramento sem fonte confirmada"
                  : "Potência entregue pelo gerador"
              }
              active={model.busLive}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/55 pt-3">
            {(
              [
                {
                  label: model.mcbKnown ? (model.mcb ? "Abrir MCB" : "Fechar MCB") : "MCB N/D",
                  action: model.mcb ? "mcb_open" : "mcb_close",
                  known: model.mcbKnown,
                },
                {
                  label: model.gcbKnown ? (model.gcb ? "Abrir GCB" : "Fechar GCB") : "GCB N/D",
                  action: model.gcb ? "gcb_open" : "gcb_close",
                  known: model.gcbKnown,
                },
                {
                  label: "Paralelismo",
                  action: "paralleling",
                  known: true,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.action}
                type="button"
                disabled={!item.known || !canAction(item.action) || commandBusy !== null}
                onClick={() => void onCommand(item.action)}
                title={
                  canAction(item.action)
                    ? `${item.label} homologado`
                    : "Comando ainda não homologado para esta controladora"
                }
                className="h-8 rounded-md border border-border px-3 text-[11px] font-semibold disabled:opacity-35"
              >
                {commandBusy === item.action ? "Enviando…" : item.label}
              </button>
            ))}
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
                  value: formatMetric(model.temp, coolantUnit, 0),
                  tone: metricTone(model.temp, gen.metricLimits?.["coolant_temperature"]),
                },
                {
                  icon: Droplets,
                  label: "Pressão do óleo",
                  value: formatMetric(model.oil, oilUnit, 1),
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
                  value: formatMetric(model.fuel, fuelUnit, 0),
                  tone: fuelTone,
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
