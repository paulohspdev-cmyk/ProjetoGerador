import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useGenerators } from "./GeneratorsProvider";
import {
  displayGeneratorName,
  fmt,
  formatGeneratorMetric,
  hasMetric,
  metricNumber,
} from "./generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "./generator-presence";
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

function progressPercent(value: number | null, maximum: number) {
  if (value == null || !Number.isFinite(value) || maximum <= 0) return null;
  return Math.min(100, Math.max(0, (value / maximum) * 100));
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const temp = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const batt = metricNumber(gen, "battery_voltage", gen.battery);
  const alt = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const load = metricNumber(gen, "power_kw", gen.load);
  const powerFactor = metricNumber(gen, "power_factor", undefined);
  const mainsFrequency = metricNumber(gen, "mains_frequency", gen.mainsFrequency);
  const nominalPower =
    metricNumber(gen, "nominal_power_kw", gen.nominalPower) ??
    metricNumber(gen, "nominal_power", gen.nominalPower);

  const oilUnit = gen.metricUnits?.["oil_pressure"] || "bar";
  const fuelUnit = gen.metricUnits?.["fuel_level"] || "%";
  const fuelIsPercent = fuelUnit === "%";
  const fuelCapacity = metricNumber(gen, "fuel_capacity", undefined);
  const fuelDisplayMaximum =
    fuelIsPercent || fuel == null
      ? 100
      : fuelCapacity != null && fuelCapacity > 0
        ? fuelCapacity
        : 1000;
  const alternatorDisplayMaximum = batt != null && batt > 20 ? 32 : 16;

  const oilBarPct = progressPercent(oil, 10);
  const coolantBarPct = progressPercent(temp, 120);
  const fuelBarPct = progressPercent(fuel, fuelDisplayMaximum);
  const alternatorBarPct = progressPercent(alt, alternatorDisplayMaximum);
  const maintenanceBarPct = progressPercent(maintenance, 1000);
  const runHoursBarPct = progressPercent(runHours, 10000);

  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const alarmCountKnown = hasMetric(gen, "alarm_count");
  const runningKnown = rpm != null;
  const running = runningKnown && isPositiveMeasurement(rpm);

  const mainsKeys = [
    "mains_voltage_l1",
    "mains_voltage_l2",
    "mains_voltage_l3",
    "mains_voltage_l1_l2",
  ];
  const genKeys = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"];
  const mainsKnown = mainsKeys.some((key) => hasMetric(gen, key));
  const genVoltageKnown = genKeys.some((key) => hasMetric(gen, key));
  const mainsOk =
    mainsKnown &&
    hasPositiveMeasurement([
      metricNumber(gen, "mains_voltage_l1", gen.mains.l1),
      metricNumber(gen, "mains_voltage_l2", gen.mains.l2),
      metricNumber(gen, "mains_voltage_l3", gen.mains.l3),
      metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12),
    ]);

  const ig200Homologated =
    gen.controller.trim().toLowerCase() === "inteligen 200" && Number(gen.rapidDeviceNum) > 0;
  const canOperate = can("operate") && ig200Homologated && gen.status !== "nao_configurado";

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    if (!canOperate || commandBusy || !confirmCmd(label)) return;
    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setCommandMessage(result.reason || `${label} aceito pelo sistema.`);
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : `Falha no comando ${label}.`);
    } finally {
      setCommandBusy(null);
    }
  };

  const tableRows = [
    ["L1-N Voltage", "mains_voltage_l1", gen.mains.l1, "voltage_l1", gen.gen.l1],
    ["L2-N Voltage", "mains_voltage_l2", gen.mains.l2, "voltage_l2", gen.gen.l2],
    ["L3-N Voltage", "mains_voltage_l3", gen.mains.l3, "voltage_l3", gen.gen.l3],
    ["L1-L2 Voltage", "mains_voltage_l1_l2", gen.mains.l12, "voltage_l1_l2", gen.gen.l12],
  ] as const;

  return (
    <article className="comap-panel comap-panel-v2">
      <header className="comap-header">
        <span
          className={cn(
            "comap-logo",
            gen.status === "online" || gen.status === "alerta" ? "online" : "offline",
          )}
        >
          G
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="comap-name">{displayGeneratorName(gen.tag)}</h3>
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
            {alarmCountKnown ? gen.alarms : gen.status === "alerta" ? "!" : "—"}
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
          <h2 className="comap-title">Power Flow</h2>
          <span className="comap-mode">MODE: {modeKnown ? gen.mode : "N/D"}</span>
        </div>

        <div className="comap-sld">
          <div className="comap-sld-stage">
            <div className="absolute left-0 top-[23%] z-10">
              <BreakerControl label="MCB" known={mcbKnown} closed={gen.mcb} />
            </div>

            <div className="absolute left-0 top-[53%] z-10">
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
            />

            <div className="absolute bottom-[3%] right-0 z-10 flex flex-col gap-2">
              <button
                type="button"
                className="comap-start"
                disabled={!canOperate || commandBusy !== null}
                onClick={() => void runCommand("start")}
                aria-label="Partir gerador"
              >
                {commandBusy === "start" ? "..." : "START"}
              </button>
              <button
                type="button"
                className="comap-stop"
                disabled={!canOperate || commandBusy !== null}
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
          icon={<IconOilCan />}
          label="Oil Pressure"
          value={oil == null ? "N/D" : `${fmt(oil, 2)} ${oilUnit}`}
          pct={oilBarPct ?? 0}
          bar
          known={oil != null}
        />
        <EngineRow
          icon={<IconThermometer />}
          label="Coolant Temp."
          value={temp == null ? "N/D" : `${fmt(temp, 0)} °C`}
          pct={coolantBarPct ?? 0}
          bar
          known={temp != null}
        />
        <EngineRow
          icon={<IconFuelPump />}
          label="Fuel Level"
          value={fuel == null ? "N/D" : `${fmt(fuel, 0)} ${fuelUnit}`}
          pct={fuelBarPct ?? 0}
          bar={fuelIsPercent}
          known={fuel != null}
        />
        <EngineRow
          icon={<IconBolt />}
          label="Alternator Volt."
          value={alt == null ? "N/D" : `${fmt(alt)} V`}
          pct={alternatorBarPct ?? 0}
          bar
          known={alt != null}
        />
        <EngineRow
          icon={<IconClock />}
          label="Maintenance"
          value={maintenance == null ? "N/D" : `${fmt(maintenance, 0)} h`}
          pct={maintenanceBarPct ?? 0}
          bar
          known={maintenance != null}
        />
        <EngineRow
          icon={<IconRunHours />}
          label="Run Hours"
          value={runHours == null ? "N/D" : `${fmt(runHours)} h`}
          pct={runHoursBarPct ?? 0}
          bar
          known={runHours != null}
        />
      </section>

      <section className="comap-block comap-power-gauge-block">
        <div className="power-gauge-heading">
          <h2 className="comap-title">Generator P</h2>
          <span>{load == null ? "POTÊNCIA N/D" : "POTÊNCIA ATIVA"}</span>
        </div>
        <PowerGaugeKw
          value={load}
          nominal={nominalPower}
          rpm={rpm}
          battery={batt}
          powerFactor={powerFactor}
        />
      </section>

      <section className="comap-block mains-generator-block mb-1.5 shrink-0 px-2 py-1.5">
        <h2 className="comap-title">Mains / Generator</h2>
        <div className="comap-table-head">
          <span />
          <span>Mains</span>
          <span>Generator</span>
        </div>
        {tableRows.map(([label, mainsKey, mainsValue, genKey, genValue]) => (
          <div key={label} className="comap-table-row">
            <span className="label">{label}</span>
            <span className="mains">
              {formatGeneratorMetric(gen, mainsKey, mainsValue, "V", 0)}
            </span>
            <span className="gen">{formatGeneratorMetric(gen, genKey, genValue, "V", 0)}</span>
          </div>
        ))}
        {!mainsKnown && !genVoltageKnown && (
          <p className="py-1 text-[9px] text-muted-foreground">
            Tensões N/D para esta controladora.
          </p>
        )}
      </section>
    </article>
  );
}
