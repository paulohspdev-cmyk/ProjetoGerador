import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, fmt, hasFreshMetric, metricNumber } from "./generator-metrics";
import { isPositiveMeasurement } from "./generator-presence";
import { PowerFlowSld } from "./power-flow/PowerFlowDiagram";
import {
  BreakerControl,
  ControllerModeBar,
  EngineRow,
  PowerGaugeKw,
} from "./power-flow/PowerFlowPrimitives";
import {
  IconBolt,
  IconClock,
  IconFuelPump,
  IconHouse,
  IconOilCan,
  IconRunHours,
  IconThermometer,
} from "./scada-icons";
import "./comap-panel.css";
import "./powerflow-card-v2.css";

export { fmt } from "./generator-metrics";
export { IoBtn, PowerFlowSld } from "./power-flow/PowerFlowDiagram";

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const telemetry = readGeneratorTelemetry(gen);
  const {
    rpm,
    oil,
    oilUnit,
    coolant: temp,
    fuel,
    fuelUnit,
    autonomyHours,
    battery: batt,
    alternator: alt,
    maintenance,
    runHours,
    frequency,
    mainsFrequency,
    powerKw: load,
    powerFactor,
    nominalPower,
    percents,
    tones,
  } = telemetry;

  const runningKnown = rpm != null && hasFreshMetric(gen, "rpm");
  const running = runningKnown && isPositiveMeasurement(rpm);

  const mcbKnown = hasFreshMetric(gen, "mcb_closed");
  const gcbKnown = hasFreshMetric(gen, "gcb_closed");
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");
  const alarmCountKnown = hasFreshMetric(gen, "alarm_count");
  const unavailableLabel = (_key: string) => "N/D";
  const statusClass =
    gen.status === "online"
      ? "online"
      : gen.status === "alerta"
        ? "alert"
        : gen.status === "nao_configurado"
          ? "not-configured"
          : "offline";
  const mainsKeys = [
    "mains_voltage_l1",
    "mains_voltage_l2",
    "mains_voltage_l3",
    "mains_voltage_l1_l2",
  ];
  const genKeys = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"];
  const mainsVoltageValues = [
    metricNumber(gen, "mains_voltage_l1", gen.mains.l1),
    metricNumber(gen, "mains_voltage_l2", gen.mains.l2),
    metricNumber(gen, "mains_voltage_l3", gen.mains.l3),
    metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12),
  ];
  const mainsVoltageKnown = mainsKeys.some((key) => hasFreshMetric(gen, key));
  const mainsFrequencyKnown = hasFreshMetric(gen, "mains_frequency");
  const mainsKnown = mainsVoltageKnown || mainsFrequencyKnown;
  const mainsPeakVoltage = Math.max(
    0,
    ...mainsVoltageValues.filter((value): value is number => value != null),
  );
  const mainsPresent =
    mainsKnown &&
    (mainsPeakVoltage >= 80 ||
      (mainsFrequencyKnown && mainsFrequency != null && mainsFrequency >= 20) ||
      (mcbKnown && gen.mcb));
  const genVoltageKnown = genKeys.some((key) => hasFreshMetric(gen, key));
  const mainsOk = mainsPresent;

  const cardMetric = (key: string, value: number | null | undefined, unit: string, digits = 1) => {
    const actual = metricNumber(gen, key, value);
    if (actual == null) return "N/D";
    const text = unit ? `${fmt(actual, digits)} ${unit}` : fmt(actual, digits);
    return hasFreshMetric(gen, key) ? text : `${text} · últ.`;
  };

  const canStart = can("operate") && gen.capabilities?.start === true;
  const canStop = can("operate") && gen.capabilities?.stop === true;
  const autonomyKnown =
    autonomyHours != null && hasFreshMetric(gen, "fuel_level") && hasFreshMetric(gen, "fuel_rate");

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    const allowed = action === "start" ? canStart : canStop;
    if (!allowed || commandBusy || !confirmCmd(label)) return;
    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      const rpmConfirmation =
        result.rpm_after != null
          ? ` · RPM após comando: ${fmt(result.rpm_after, 0)} · sincronizando telemetria`
          : " · aguardando sincronização da telemetria";
      setCommandMessage(`${result.reason || `${label} aceito pelo controlador`}${rpmConfirmation}`);
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : `Falha no comando ${label}.`);
    } finally {
      setCommandBusy(null);
    }
  };

  const tableRows = [
    ["Tensão L1-N", "mains_voltage_l1", gen.mains.l1, "voltage_l1", gen.gen.l1],
    ["Tensão L2-N", "mains_voltage_l2", gen.mains.l2, "voltage_l2", gen.gen.l2],
    ["Tensão L3-N", "mains_voltage_l3", gen.mains.l3, "voltage_l3", gen.gen.l3],
    ["Tensão L1-L2", "mains_voltage_l1_l2", gen.mains.l12, "voltage_l1_l2", gen.gen.l12],
  ] as const;

  return (
    <article className="comap-panel comap-panel-v2">
      <header className="comap-header">
        <span className={cn("comap-logo", statusClass)}>G</span>
        <div className="min-w-0 flex-1">
          <h3 className="comap-name">{displayGeneratorName(gen)}</h3>
          <p className="controller-model-line">{gen.controller}</p>
        </div>
        <span
          className="comap-alarm"
          title={alarmCountKnown ? "Contagem de alarmes" : "Alarmes N/D"}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 3 2.8 20h18.4L12 3Z" />
            <path d="M12 8.5v5.8m0 2.7h.01" />
          </svg>
          <span className="comap-alarm-count">
            {alarmCountKnown ? gen.alarms : gen.status === "alerta" ? "!" : "N/D"}
          </span>
        </span>
        <Link
          to="/p/geradores/$id"
          params={{ id: gen.id }}
          aria-label="Abrir detalhes do gerador"
          className="grid size-5 place-items-center"
        >
          <IconHouse size={14} />
        </Link>
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-5" />
      </header>

      <section className="comap-block controller-mode-section">
        <ControllerModeBar gen={gen} known={modeKnown} />
      </section>

      <section className="comap-block comap-flow comap-flow-v2">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="comap-title">Fluxo de potência</h2>
          <span className="comap-mode">MODO: {modeKnown ? gen.mode : "N/D"}</span>
        </div>

        <div className="comap-sld">
          <div className="comap-sld-stage">
            {mainsPresent && (
              <div className="absolute left-0 top-[23%] z-10">
                <BreakerControl label="MCB" known={mcbKnown} closed={gen.mcb} />
              </div>
            )}

            <div
              className={cn(
                "generator-gcb-control absolute z-10",
                mainsPresent && "with-mains",
                mainsPresent ? "top-[53%]" : "top-[38%]",
              )}
            >
              <BreakerControl label="GCB" known={gcbKnown} closed={gen.gcb} />
            </div>

            <PowerFlowSld
              mcb={gen.mcb}
              gcb={gen.gcb}
              running={running}
              mainsOk={mainsOk}
              gridHz={mainsFrequency ?? 0}
              genHz={frequency ?? 0}
              loadKw={load ?? 0}
              mcbKnown={mcbKnown}
              gcbKnown={gcbKnown}
              runningKnown={runningKnown}
              mainsKnown={mainsKnown}
              gridHzKnown={mainsFrequency != null}
              genHzKnown={frequency != null}
              loadKnown={load != null}
              showMainsSource={mainsPresent}
            />

            <div className={cn("generator-command-stack", mainsPresent && "with-mains")}>
              <button
                type="button"
                className="comap-start"
                disabled={!canStart || commandBusy !== null}
                onClick={() => void runCommand("start")}
                aria-label="Partir gerador"
              >
                {commandBusy === "start" ? "..." : "START"}
              </button>
              <button
                type="button"
                className="comap-stop"
                disabled={!canStop || commandBusy !== null}
                onClick={() => void runCommand("stop")}
                aria-label="Parar gerador"
              >
                {commandBusy === "stop" ? "..." : "STOP"}
              </button>
            </div>
          </div>
        </div>
        {commandMessage && (
          <p className="px-2 pb-1 text-[10px] text-muted-foreground">{commandMessage}</p>
        )}
      </section>

      <section className="comap-block engine-status-block shrink-0 px-2 py-1.5">
        <h2 className="comap-title mb-1">Engine Status</h2>
        <EngineRow
          icon={<IconClock />}
          label="Autonomy"
          value={autonomyKnown ? `${fmt(autonomyHours, 1)} h` : "N/D"}
          known={autonomyKnown}
          unknownLabel="N/D"
          lastKnown={false}
        />
        <EngineRow
          icon={<IconOilCan />}
          label="Oil Pres"
          value={oil == null ? "N/D" : `${fmt(oil, 2)} ${oilUnit}`}
          pct={percents.oil}
          bar
          known={oil != null}
          unknownLabel={unavailableLabel("oil_pressure")}
          lastKnown={false}
          tone={hasFreshMetric(gen, "oil_pressure") ? tones.oil : "neutral"}
        />
        <EngineRow
          icon={<IconThermometer />}
          label="Temp"
          value={temp == null ? "N/D" : `${fmt(temp, 0)} °C`}
          pct={percents.coolant}
          bar
          known={temp != null}
          unknownLabel={unavailableLabel("coolant_temperature")}
          lastKnown={false}
          tone={hasFreshMetric(gen, "coolant_temperature") ? tones.coolant : "neutral"}
        />
        <EngineRow
          icon={<IconFuelPump />}
          label="Fuel"
          value={fuel == null ? "N/D" : `${fmt(fuel, 0)} ${fuelUnit}`}
          pct={percents.fuel}
          bar
          known={fuel != null}
          unknownLabel={unavailableLabel("fuel_level")}
          lastKnown={fuel != null && !hasFreshMetric(gen, "fuel_level")}
          tone={hasFreshMetric(gen, "fuel_level") ? tones.fuel : "neutral"}
        />
        <EngineRow
          icon={<IconBolt />}
          label="Alternator"
          value={alt == null ? "N/D" : `${fmt(alt)} V`}
          pct={percents.alternator}
          bar
          known={alt != null}
          unknownLabel={unavailableLabel("alternator_voltage")}
          lastKnown={false}
          tone={hasFreshMetric(gen, "alternator_voltage") ? tones.alternator : "neutral"}
        />
        <EngineRow
          icon={<IconRunHours />}
          label="RPM"
          value={rpm == null ? "N/D" : fmt(rpm, 0)}
          known={rpm != null}
          unknownLabel={unavailableLabel("rpm")}
          lastKnown={false}
        />
        <EngineRow
          icon={<IconBolt />}
          label="PF"
          value={powerFactor == null ? "N/D" : fmt(powerFactor, 2)}
          known={powerFactor != null}
          unknownLabel={unavailableLabel("power_factor")}
          lastKnown={false}
        />
        <EngineRow
          icon={<IconClock />}
          label="Maintenance"
          value={maintenance == null ? "N/D" : `${fmt(maintenance, 0)} h`}
          pct={percents.maintenance}
          bar
          known={maintenance != null}
          unknownLabel={unavailableLabel("maintenance_hours")}
          lastKnown={maintenance != null && !hasFreshMetric(gen, "maintenance_hours")}
          tone={hasFreshMetric(gen, "maintenance_hours") ? tones.maintenance : "neutral"}
        />
        <EngineRow
          icon={<IconRunHours />}
          label="Run Hours"
          value={runHours == null ? "N/D" : `${fmt(runHours)} h`}
          pct={percents.runHours}
          bar
          known={runHours != null}
          unknownLabel={unavailableLabel("run_hours")}
          lastKnown={runHours != null && !hasFreshMetric(gen, "run_hours")}
          tone={hasFreshMetric(gen, "run_hours") ? tones.runHours : "neutral"}
        />
      </section>

      <section className="comap-block comap-power-gauge-block">
        <div className="power-gauge-heading">
          <h2 className="comap-title">KW</h2>
        </div>
        <PowerGaugeKw
          value={load}
          nominal={nominalPower}
          battery={batt}
          powerFactor={powerFactor}
        />
      </section>

      <section className="comap-block mains-generator-block mb-1.5 shrink-0 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="comap-title">{mainsPresent ? "Rede / Gerador" : "Gerador"}</h2>
          <span className={cn("mains-presence", mainsPresent ? "is-present" : "is-absent")}>
            {mainsPresent ? "REDE PRESENTE" : mainsKnown ? "SEM REDE" : "REDE N/D"}
          </span>
        </div>
        <div className={cn("comap-table-head", !mainsPresent && "is-generator-only")}>
          <span />
          {mainsPresent && <span>Rede</span>}
          <span>Gerador</span>
        </div>
        {tableRows.map(([label, mainsKey, mainsValue, genKey, genValue]) => (
          <div key={label} className={cn("comap-table-row", !mainsPresent && "is-generator-only")}>
            <span className="label">{label}</span>
            {mainsPresent && (
              <span className="mains">{cardMetric(mainsKey, mainsValue, "V", 0)}</span>
            )}
            <span className="gen">{cardMetric(genKey, genValue, "V", 0)}</span>
          </div>
        ))}
        {!mainsPresent && !genVoltageKnown && (
          <p className="py-1 text-[9px] text-muted-foreground">
            Tensões do gerador N/D para esta controladora.
          </p>
        )}
      </section>
    </article>
  );
}
