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

import { formatMetric } from "../generator-metrics";
import type { GeneratorDetailModel } from "./generator-detail-model";
import { NeedleGauge } from "./GeneratorDetailProfessionalPrimitives";

type Props = {
  model: GeneratorDetailModel;
  events: EventItemApi[];
  eventError: string;
  plans: MaintenancePlan[];
  maintenanceError: string;
};

const PHASE_TONE = {
  L1: "var(--info)",
  L2: "var(--online)",
  L3: "var(--primary)",
} as const;

function unitText(value: number | null | undefined, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatMetric(value, unit, digits);
}

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

function PhaseColumn({
  name,
  volts,
  amps,
  maxVolts,
  live,
}: {
  name: keyof typeof PHASE_TONE;
  volts: number | null;
  amps: number | null;
  maxVolts: number | null;
  live: boolean;
}) {
  const hasV = live && volts != null && volts > 0;
  const pct =
    hasV && maxVolts != null && maxVolts > 0
      ? Math.max(4, Math.min(100, (volts / maxVolts) * 100))
      : 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1">
      <span
        className="text-[11px] font-extrabold tracking-wide"
        style={{ color: PHASE_TONE[name] }}
      >
        {name}
      </span>
      <div className="relative flex min-h-0 w-full flex-1 justify-center">
        <div className="relative h-full w-7 overflow-hidden rounded-sm border border-border/60 bg-black/35">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300"
            style={{
              height: `${pct}%`,
              background: PHASE_TONE[name],
              opacity: hasV ? 0.85 : 0.2,
            }}
          />
        </div>
      </div>
      <b className="num text-[13px] font-black leading-none">{hasV ? unitText(volts, "V") : "—"}</b>
      <span className="num text-[10px] text-muted-foreground">
        {live ? unitText(amps, "A") : "—"}
      </span>
    </div>
  );
}

function SidePhaseCard({
  title,
  live,
  emptyHint,
  accent,
  l1,
  l2,
  l3,
  i1,
  i2,
  i3,
  ll,
  hz,
  kw,
  pf,
}: {
  title: string;
  live: boolean;
  emptyHint?: string;
  accent?: boolean;
  l1: number | null;
  l2: number | null;
  l3: number | null;
  i1: number | null;
  i2: number | null;
  i3: number | null;
  ll: number | null;
  hz: number | null;
  kw: number | null;
  pf: string;
}) {
  const measuredVoltages = [l1, l2, l3].filter(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  const phaseScaleMax = measuredVoltages.length > 0 ? Math.max(...measuredVoltages) * 1.05 : null;

  return (
    <section className="gen-detail-section flex min-h-0 flex-col overflow-hidden rounded-xl p-2">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <h2 className={cn("text-[12px] font-extrabold", accent && "text-online")}>{title}</h2>
        <span className="num truncate text-[10px] text-muted-foreground">
          {[
            unitText(live ? hz : null, "Hz", 1),
            unitText(live ? kw : null, "kW"),
            pf ? `FP ${pf}` : "",
          ]
            .filter((part) => part && part !== "—")
            .join(" · ") ||
            (emptyHint ?? "—")}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <PhaseColumn name="L1" volts={l1} amps={i1} maxVolts={phaseScaleMax} live={live} />
        <PhaseColumn name="L2" volts={l2} amps={i2} maxVolts={phaseScaleMax} live={live} />
        <PhaseColumn name="L3" volts={l3} amps={i3} maxVolts={phaseScaleMax} live={live} />
      </div>
      <div className="mt-1 flex shrink-0 justify-between border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
        <span>
          L-L <b className="num text-foreground">{unitText(live ? ll : null, "V")}</b>
        </span>
        <span>
          Hz <b className="num text-foreground">{unitText(live ? hz : null, "Hz", 1)}</b>
        </span>
        <span>
          kW <b className="num text-foreground">{unitText(live ? kw : null, "kW")}</b>
        </span>
      </div>
    </section>
  );
}

export function GeneratorDetailProfessionalLower({
  model,
  events,
  eventError,
  plans,
  maintenanceError,
}: Props) {
  const visiblePlans = plans.slice(0, 2).map((plan) => ({
    name: plan.name,
    next:
      [
        plan.hour_remaining != null ? `Em ${plan.hour_remaining.toFixed(0)} h` : "",
        plan.day_remaining != null ? `Em ${plan.day_remaining.toFixed(0)} d` : "",
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
    .slice(0, 4);

  const mainsLive = Boolean(model.mainsPresent && model.mainsKnown);
  const genLive = Boolean(model.generatorPresent);

  return (
    <div className="gen-detail-lower grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1.15fr)_auto] gap-1.5 overflow-hidden">
      <div className="grid min-h-0 gap-1.5 xl:grid-cols-12">
        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-7">
          <h2 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold">
            <Gauge className="size-3 text-primary" /> Relógios
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

      <div className="grid min-h-0 gap-1.5 xl:grid-cols-2">
        <SidePhaseCard
          title="Gráfico Rede — L1 L2 L3"
          live={mainsLive}
          emptyHint="Rede ausente"
          l1={model.mainsL1}
          l2={model.mainsL2}
          l3={model.mainsL3}
          i1={model.mainsI1}
          i2={model.mainsI2}
          i3={model.mainsI3}
          ll={model.mainsL12 ?? model.mainsL13}
          hz={model.mainsFrequency}
          kw={model.mainsPower}
          pf={model.mainsElectrical?.powerFactor || ""}
        />
        <SidePhaseCard
          title="Gráfico Gerador — L1 L2 L3"
          live={genLive}
          emptyHint="Gerador parado"
          accent
          l1={model.genL1}
          l2={model.genL2}
          l3={model.genL3}
          i1={model.genI1}
          i2={model.genI2}
          i3={model.genI3}
          ll={model.genL12 ?? model.genL13}
          hz={model.frequency}
          kw={model.load}
          pf={model.generatorElectrical?.powerFactor || ""}
        />
      </div>

      <div className="grid min-h-0 gap-1.5 xl:grid-cols-12">
        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-3">
          <div className="mb-0.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[11px] font-extrabold">
              <Bell className="size-3 text-primary" /> ALARMS
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
                  key={`${event.time}-${event.message}`}
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

        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-4">
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

        <section className="gen-detail-section min-h-0 overflow-hidden rounded-xl p-1.5 xl:col-span-5">
          <h2 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold">
            <Settings2 className="size-3 text-primary" /> Parâmetros
          </h2>
          {uniqueParams.length ? (
            <div className="grid gap-x-3 overflow-hidden sm:grid-cols-2">
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
