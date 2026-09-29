import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Battery,
  Bell,
  CircleAlert,
  Clock3,
  Fuel,
  Gauge,
  Info,
  Settings2,
  Thermometer,
  Wrench,
  Zap,
} from "lucide-react";

import { Pill } from "@/features/scada/kit";
import type { EventItemApi } from "@/lib/api";
import type { MaintenancePlan } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";

import type { GeneratorDetailModel } from "./generator-detail-model";
import { NeedleGauge } from "./GeneratorDetailProfessionalPrimitives";
import {
  HistoryPanel,
  MiniTrendCard,
  type TrendSeriesSpec,
  unitText,
} from "./GeneratorDetailTrendPanels";
import type { GeneratorDetailTrendHours, GeneratorDetailTrendMap } from "./useGeneratorDetailData";

type Props = {
  model: GeneratorDetailModel;
  events: EventItemApi[];
  eventError: string;
  plans: MaintenancePlan[];
  maintenanceError: string;
  trends: GeneratorDetailTrendMap;
  trendErrors: Record<string, string>;
  trendsLoading: boolean;
  configuredTrendMetrics: Set<string>;
  trendHours: GeneratorDetailTrendHours;
  onTrendHoursChange: (hours: GeneratorDetailTrendHours) => void;
};

function EngineRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border/35 py-0.5 text-[11px] last:border-b-0">
      <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <b className="num shrink-0">{value}</b>
    </div>
  );
}

export function GeneratorDetailProfessionalLower({
  model,
  events,
  eventError,
  plans,
  maintenanceError,
  trends,
  trendErrors,
  trendsLoading,
  configuredTrendMetrics,
  trendHours,
  onTrendHoursChange,
}: Props) {
  const visiblePlans = plans.slice(0, 2).map((plan) => ({
    name: plan.name,
    next:
      [
        plan.hour_remaining != null ? "Em " + plan.hour_remaining.toFixed(0) + " h" : "",
        plan.day_remaining != null ? "Em " + plan.day_remaining.toFixed(0) + " d" : "",
      ]
        .filter(Boolean)
        .join(" · ") || "N/D",
    ok: plan.state === "ok" || plan.state == null,
  }));

  const eventRows = events.slice(0, 3).map((event) => ({
    time: new Date(event.created_at * 1000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    message: event.message,
    tone:
      event.level === "FAULT" || event.level === "ERROR"
        ? ("err" as const)
        : event.level === "WARN" || event.level === "WARNING"
          ? ("warn" as const)
          : ("info" as const),
  }));

  const alarmsOk = !eventRows.length && (model.alarms == null || model.alarms <= 0);
  const periodLabel =
    trendHours === 1
      ? "1 hora"
      : trendHours === 6
        ? "6 horas"
        : trendHours === 24
          ? "24 horas"
          : "7 dias";
  const showGeneratorLineToLine = ["voltage_l1_l2", "voltage_l2_l3", "voltage_l3_l1"].some((key) =>
    configuredTrendMetrics.has(key),
  );
  const showMainsLineToLine = [
    "mains_voltage_l1_l2",
    "mains_voltage_l2_l3",
    "mains_voltage_l3_l1",
  ].some((key) => configuredTrendMetrics.has(key));

  const paramSkip = new Set([
    "modo de operação",
    "modo atual",
    "frequência",
    "frequência da rede",
    "tensão",
    "fonte selecionada",
    "gcb",
    "mcb",
    "potência nominal",
  ]);
  const uniqueParams = model.parameters
    .filter((row) => !paramSkip.has(row.label.toLowerCase()))
    .slice(0, 6);

  const showMainsHistory = [
    "mains_voltage_l1",
    "mains_voltage_l2",
    "mains_voltage_l3",
    "mains_voltage_l1_l2",
    "mains_voltage_l2_l3",
    "mains_voltage_l3_l1",
    "mains_frequency",
    "mains_power_kw",
    "mains_power_factor",
  ].some((key) => configuredTrendMetrics.has(key));

  const historyPanels: Array<{
    title: string;
    subtitle?: string;
    series: TrendSeriesSpec[];
  }> = [
    {
      title: "Tensão do gerador · L1 L2 L3",
      series: [
        { key: "voltage_l1", label: "L1", unit: "V", current: model.genL1, tone: "var(--info)" },
        { key: "voltage_l2", label: "L2", unit: "V", current: model.genL2, tone: "var(--online)" },
        { key: "voltage_l3", label: "L3", unit: "V", current: model.genL3, tone: "var(--primary)" },
      ],
    },
    {
      title: "Corrente do gerador · I1 I2 I3",
      series: [
        { key: "current_l1", label: "I1", unit: "A", current: model.genI1, tone: "var(--info)" },
        { key: "current_l2", label: "I2", unit: "A", current: model.genI2, tone: "var(--online)" },
        { key: "current_l3", label: "I3", unit: "A", current: model.genI3, tone: "var(--primary)" },
      ],
    },
    {
      title: "Potência e fator de potência",
      series: [
        {
          key: "power_kw",
          label: "kW",
          unit: "kW",
          current: model.load,
          tone: "var(--online)",
        },
        {
          key: "power_kva",
          label: "kVA",
          unit: "kVA",
          current: model.powerKva,
          tone: "var(--info)",
        },
        {
          key: "power_kvar",
          label: "kvar",
          unit: "kvar",
          current: model.powerKvar,
          tone: "var(--primary)",
        },
        {
          key: "power_factor",
          label: "FP",
          unit: "",
          current: model.powerFactor,
          digits: 2,
          tone: "var(--chart-2)",
        },
      ],
    },
    {
      title: "Frequência do gerador",
      series: [
        {
          key: "frequency",
          label: "Frequência",
          unit: "Hz",
          current: model.frequency,
          digits: 1,
          tone: "var(--chart-2)",
        },
      ],
    },
  ];

  if (showGeneratorLineToLine) {
    historyPanels.splice(1, 0, {
      title: "Tensão do gerador · L-L",
      series: [
        {
          key: "voltage_l1_l2",
          label: "L1-L2",
          unit: "V",
          current: model.genL12,
          tone: "var(--info)",
        },
        {
          key: "voltage_l2_l3",
          label: "L2-L3",
          unit: "V",
          current: model.genL23,
          tone: "var(--online)",
        },
        {
          key: "voltage_l3_l1",
          label: "L3-L1",
          unit: "V",
          current: model.genL13,
          tone: "var(--primary)",
        },
      ],
    });
  }

  if (showMainsHistory) {
    historyPanels.push(
      {
        title: "Tensão da rede · L1 L2 L3",
        subtitle: "Histórico real da concessionária · 24 horas",
        series: [
          {
            key: "mains_voltage_l1",
            label: "L1",
            unit: "V",
            current: model.mainsL1,
            tone: "var(--info)",
          },
          {
            key: "mains_voltage_l2",
            label: "L2",
            unit: "V",
            current: model.mainsL2,
            tone: "var(--online)",
          },
          {
            key: "mains_voltage_l3",
            label: "L3",
            unit: "V",
            current: model.mainsL3,
            tone: "var(--primary)",
          },
        ],
      },
      {
        title: "Frequência / potência da rede",
        subtitle: "Histórico real da concessionária · 24 horas",
        series: [
          {
            key: "mains_frequency",
            label: "Hz",
            unit: "Hz",
            current: model.mainsFrequency,
            digits: 1,
            tone: "var(--chart-2)",
          },
          {
            key: "mains_power_kw",
            label: "kW",
            unit: "kW",
            current: model.mainsPower,
            tone: "var(--online)",
          },
        ],
      },
    );
  }

  if (showMainsLineToLine) {
    historyPanels.push({
      title: "Tensão da rede · L-L",
      series: [
        {
          key: "mains_voltage_l1_l2",
          label: "L1-L2",
          unit: "V",
          current: model.mainsL12,
          tone: "var(--info)",
        },
        {
          key: "mains_voltage_l2_l3",
          label: "L2-L3",
          unit: "V",
          current: model.mainsL23,
          tone: "var(--online)",
        },
        {
          key: "mains_voltage_l3_l1",
          label: "L3-L1",
          unit: "V",
          current: model.mainsL13,
          tone: "var(--primary)",
        },
      ],
    });
  }

  return (
    <div className="gen-detail-lower grid min-h-0 flex-1 grid-rows-[auto_minmax(178px,1fr)_112px_auto] gap-1.5 overflow-hidden">
      <div className="grid min-h-0 gap-1.5 xl:grid-cols-12">
        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-7">
          <h2 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold">
            <Gauge className="size-3 text-primary" /> Instantâneo
          </h2>
          <div className="grid grid-cols-4 gap-1">
            <NeedleGauge label="KW" unit="kW" value={model.load} max={model.nominalPower} />
            <NeedleGauge label="RPM" unit="rpm" value={model.rpm} max={model.rpmGaugeMax} />
            <NeedleGauge
              label="Óleo"
              unit={model.oilUnit}
              value={model.oil}
              max={model.oilGaugeMax}
              digits={1}
            />
            <NeedleGauge
              label="Temp."
              unit={model.tempUnit}
              value={model.temp}
              max={model.tempGaugeMax}
            />
          </div>
        </section>

        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-5">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-extrabold">ENGINE STATUS</h2>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[9px] font-bold tracking-wider",
                model.running
                  ? "border-online/40 bg-online/15 text-online"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {model.runningKnown ? (model.running ? "RUNNING" : "STOPPED") : "N/D"}
            </span>
          </div>
          <EngineRow
            icon={<Gauge className="size-3" />}
            label="Oil Pressure"
            value={unitText(model.oil, model.oilUnit, 1)}
          />
          <EngineRow
            icon={<Thermometer className="size-3" />}
            label="Coolant Temp."
            value={unitText(model.temp, model.tempUnit, 0)}
          />
          <EngineRow
            icon={<Fuel className="size-3" />}
            label="Fuel Level"
            value={unitText(model.fuel, model.fuelUnit, 0)}
          />
          <EngineRow
            icon={<Battery className="size-3" />}
            label="Battery"
            value={unitText(model.batt, "V", 1)}
          />
          <EngineRow
            icon={<Zap className="size-3" />}
            label="Alternator"
            value={unitText(model.alt, "V", 1)}
          />
          <EngineRow
            icon={<Clock3 className="size-3" />}
            label="Run Hours"
            value={unitText(model.runHours, "h", 1)}
          />
          <EngineRow
            icon={<Wrench className="size-3" />}
            label="Maintenance"
            value={unitText(model.maintenance, "h", 0)}
          />
          <EngineRow
            icon={<Fuel className="size-3" />}
            label="Autonomy"
            value={model.autonomyLabel || "N/D"}
          />
        </section>
      </div>

      <section
        className="flex min-h-0 flex-col gap-1"
        aria-label={`Tendências elétricas ${periodLabel}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-0.5">
          <div>
            <h2 className="text-[11px] font-extrabold">Tendências históricas reais</h2>
            <p className="text-[9px] text-muted-foreground">
              Somente canais provisionados para esta controladora
            </p>
          </div>
          <div
            className="inline-flex h-7 shrink-0 overflow-hidden rounded-lg border border-border bg-card"
            aria-label="Período das tendências"
          >
            {([1, 6, 24, 168] as const).map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => onTrendHoursChange(hours)}
                className={cn(
                  "px-2 text-[10px] font-bold transition-colors",
                  trendHours === hours
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {hours === 168 ? "7d" : `${hours}h`}
              </button>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-1.5",
            historyPanels.length > 4 ? "xl:grid-cols-3" : "xl:grid-cols-4",
          )}
        >
          {historyPanels.map((panel) => (
            <HistoryPanel
              key={panel.title}
              title={panel.title}
              series={panel.series}
              trends={trends}
              configuredTrendMetrics={configuredTrendMetrics}
              trendErrors={trendErrors}
              loading={trendsLoading}
              periodHours={trendHours}
              periodLabel={periodLabel}
            />
          ))}
        </div>
      </section>

      <div
        className="grid min-h-0 grid-cols-3 gap-1.5 xl:grid-cols-6"
        aria-label="Tendências do motor 24h"
      >
        <MiniTrendCard
          title="RPM"
          metric="rpm"
          unit="rpm"
          value={model.rpm}
          tone="var(--info)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
        <MiniTrendCard
          title="Pressão de óleo"
          metric="oil_pressure"
          unit={model.oilUnit}
          value={model.oil}
          digits={1}
          tone="var(--primary)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
        <MiniTrendCard
          title="Temp. motor"
          metric="coolant_temperature"
          unit={model.tempUnit}
          value={model.temp}
          tone="var(--chart-2)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
        <MiniTrendCard
          title="Combustível"
          metric="fuel_level"
          unit={model.fuelUnit}
          value={model.fuel}
          tone="var(--online)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
        <MiniTrendCard
          title="Bateria"
          metric="battery_voltage"
          unit="V"
          value={model.batt}
          digits={1}
          tone="var(--alert)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
        <MiniTrendCard
          title="Carga do motor"
          metric="engine_load"
          unit="%"
          value={model.engineLoad}
          tone="var(--online)"
          trends={trends}
          configuredTrendMetrics={configuredTrendMetrics}
          loading={trendsLoading}
          periodHours={trendHours}
        />
      </div>

      <div className="grid min-h-0 gap-1.5 xl:grid-cols-12">
        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-3">
          <div className="mb-0.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[11px] font-extrabold">
              <Bell className="size-3 text-primary" /> ALARMES
            </h2>
            {alarmsOk ? (
              <span className="rounded-sm border border-online/40 bg-online/15 px-1.5 py-0.5 text-[9px] font-bold text-online">
                OK
              </span>
            ) : null}
          </div>
          {eventError && !eventRows.length ? (
            <p className="text-[10px] text-offline">{eventError}</p>
          ) : null}
          {alarmsOk ? (
            <p className="text-[11px] text-muted-foreground">Sem alarmes ativos</p>
          ) : (
            <ul className="space-y-0.5 overflow-hidden">
              {eventRows.map((event) => (
                <li
                  key={event.time + "-" + event.message}
                  className="flex items-start gap-1 text-[10px]"
                >
                  <span
                    className={
                      event.tone === "err"
                        ? "mt-0.5 text-offline"
                        : event.tone === "warn"
                          ? "mt-0.5 text-alert"
                          : "mt-0.5 text-online"
                    }
                  >
                    {event.tone === "err" ? (
                      <CircleAlert className="size-3" />
                    ) : event.tone === "warn" ? (
                      <Info className="size-3" />
                    ) : (
                      <Bell className="size-3" />
                    )}
                  </span>
                  <span className="num shrink-0 text-muted-foreground">{event.time}</span>
                  <span className="min-w-0 flex-1 truncate">{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-3">
          <h2 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold">
            <Wrench className="size-3 text-primary" /> Manutenção
          </h2>
          {maintenanceError && !visiblePlans.length ? (
            <p className="text-[10px] text-offline">{maintenanceError}</p>
          ) : visiblePlans.length ? (
            <div className="space-y-0.5">
              {visiblePlans.map((plan) => (
                <div
                  key={plan.name}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate font-semibold">{plan.name}</span>
                  <span className="shrink-0 text-muted-foreground">{plan.next}</span>
                  <Pill tone={plan.ok ? "ok" : "warn"}>{plan.ok ? "OK" : "Próx."}</Pill>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nenhum plano vinculado.</p>
          )}
          <Link
            to="/p/$slug"
            params={{ slug: "manutencao" }}
            className="mt-0.5 inline-block text-[10px] font-semibold text-primary hover:underline"
          >
            Ver plano
          </Link>
        </section>

        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-6">
          <h2 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold">
            <Settings2 className="size-3 text-primary" /> Parâmetros e acumulados
          </h2>
          {uniqueParams.length ? (
            <div className="grid gap-x-3 overflow-hidden sm:grid-cols-3">
              {uniqueParams.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2 border-b border-border/45 py-0.5 text-[10px]"
                >
                  <span className="truncate text-muted-foreground">{label}</span>
                  <b className="num shrink-0 text-right">{value}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Nominal {unitText(model.nominalPower, "kW")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
