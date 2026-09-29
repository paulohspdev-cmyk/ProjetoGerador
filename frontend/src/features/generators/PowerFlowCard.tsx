import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { useCommandGuard } from "@/features/scada/ScadaOpsProvider";
import { generatorDisplayStatus, isGeneratorConnected, type Generator } from "@/data/generators";
import { rcApi, type IndustrialCommandAction } from "@/lib/api";
import type { IndustrialAlarm } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";

import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, hasFreshMetric, metricNumber } from "./generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "./generator-presence";
import { useActiveIndustrialAlarms } from "./use-active-alarms";
import { VerticalControls, headerMode } from "./vertical-card/VerticalControls";
import {
  VerticalEngine,
  VerticalTables,
  type GeneratorAlarmRow,
} from "./vertical-card/VerticalTelemetrySections";
import { VerticalPowerFlow } from "./vertical-card/VerticalPowerFlow";
import { VerticalPowerGauge } from "./vertical-card/VerticalPowerGauge";
import { RpmGauge } from "./RpmGauge";
import "./vertical-card/vertical-reference-card.css";

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUnit(value: number | null | undefined, unit: string, digits = 0) {
  const text = formatNumber(value, digits);
  return text === "—" ? text : text + " " + unit;
}

function controllerVendor(gen: Generator) {
  const text = (
    String(gen.controllerType ?? "") +
    " " +
    String(gen.controller ?? "")
  ).toLowerCase();
  if (text.includes("dse") || text.includes("deep sea")) return "dse";
  if (text.includes("comap") || text.includes("inteli")) return "comap";
  return "generic";
}

function alarmsForGenerator(gen: Generator, all: IndustrialAlarm[]): GeneratorAlarmRow[] {
  const matched = all
    .filter(
      (row) =>
        row.active &&
        (row.generator_id === gen.id ||
          row.asset_id === gen.id ||
          row.generator_id === gen.tag ||
          row.asset_id === gen.tag),
    )
    .sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));

  if (matched.length) {
    return matched.map((row) => ({
      key: row.alarm_key,
      severity: row.severity,
      message: row.message,
      code: row.code,
    }));
  }

  const rows: GeneratorAlarmRow[] = [];
  if (gen.telemetryStale) {
    rows.push({
      key: `${gen.id}-stale`,
      severity: "warning",
      message: "Telemetria desatualizada",
      code: "STALE",
    });
  }
  if (gen.status === "alerta" || (gen.alarms ?? 0) > 0) {
    rows.push({
      key: `${gen.id}-alert`,
      severity: "alarm",
      message: gen.lastError?.trim() || "Alarme ativo no controlador",
      code: gen.alarms > 0 ? `ALM×${gen.alarms}` : "ALERT",
    });
  }
  return rows;
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const industrialAlarms = useActiveIndustrialAlarms();
  const [commandBusy, setCommandBusy] = useState<IndustrialCommandAction | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const telemetry = readGeneratorTelemetry(gen);
  const {
    rpm,
    oil,
    oilUnit,
    coolant,
    coolantUnit,
    fuel,
    fuelUnit,
    fuelOutOfRange,
    autonomyHours,
    battery,
    alternator,
    maintenance,
    runHours,
    frequency,
    mainsFrequency,
    powerKw,
    powerFactor,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
  } = telemetry;

  const vendor = controllerVendor(gen);
  const dse = vendor === "dse";
  // Rede só é desenhada quando a topologia foi efetivamente identificada como mains_genset.
  // "unknown" nunca cria uma concessionária fictícia no card.
  const hasMainsSource = gen.powerTopology === "mains_genset";
  const runningKnown = rpm != null && hasFreshMetric(gen, "rpm");
  const running = runningKnown && isPositiveMeasurement(rpm);
  const mcbKnown = hasFreshMetric(gen, "mcb_closed");
  const gcbKnown = hasFreshMetric(gen, "gcb_closed");
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");

  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsPf = metricNumber(gen, "mains_power_factor", undefined);
  const mainsCurrent = metricNumber(gen, "mains_current_l1", undefined);
  const mainsVoltageKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const mainsFrequencyKnown = hasFreshMetric(gen, "mains_frequency");
  const mainsKnown = mainsVoltageKnown || mainsFrequencyKnown;
  const mainsPresent =
    mainsKnown &&
    hasPositiveMeasurement([
      mainsL1,
      mainsL2,
      mainsL3,
      mainsFrequencyKnown ? mainsFrequency : null,
    ]);

  const busFrequency = metricNumber(gen, "bus_frequency", gen.busFrequency);
  const busL1 = metricNumber(gen, "bus_voltage_l1", gen.bus?.l1);
  const busL2 = metricNumber(gen, "bus_voltage_l2", gen.bus?.l2);
  const busL3 = metricNumber(gen, "bus_voltage_l3", gen.bus?.l3);
  const busL13 = metricNumber(gen, "bus_voltage_l3_l1", undefined);
  const busVoltageKnown = ["bus_voltage_l1", "bus_voltage_l2", "bus_voltage_l3"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const busFrequencyKnown = hasFreshMetric(gen, "bus_frequency");
  const busKnown = busVoltageKnown || busFrequencyKnown;
  const busPresent =
    busKnown &&
    hasPositiveMeasurement([
      busL1,
      busL2,
      busL3,
      busFrequencyKnown ? busFrequency : null,
    ]);

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genL13 = metricNumber(gen, "voltage_l3_l1", undefined);
  const mainsL13 = metricNumber(gen, "mains_voltage_l3_l1", undefined);
  const generatorVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3"].some((key) =>
    hasFreshMetric(gen, key),
  );
  const generatorFrequencyKnown = hasFreshMetric(gen, "frequency");
  const generatorKnown = runningKnown || generatorVoltageKnown || generatorFrequencyKnown;
  const generatorPresent =
    generatorKnown &&
    ((runningKnown && running) ||
      hasPositiveMeasurement([genL1, genL2, genL3, generatorFrequencyKnown ? frequency : null]));
  const energyKwh = metricNumber(gen, "genset_kwh", undefined);
  const numberStarts = metricNumber(gen, "number_starts", undefined);
  const batteryVoltage = metricNumber(gen, "battery_voltage", battery);
  const currentValues = [currentL1, currentL2, currentL3].filter(
    (value): value is number => value != null,
  );
  const currentKnown = currentValues.length > 0;
  const genCurrent = currentKnown
    ? currentValues.reduce((sum, value) => sum + value, 0) / currentValues.length
    : null;

  const electricalRows = useMemo(
    () => [
      {
        label: "L1-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL1 : null, "V"),
        bus: formatUnit(busKnown ? busL1 : null, "V"),
        generator: formatUnit(genL1, "V"),
      },
      {
        label: "L2-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL2 : null, "V"),
        bus: formatUnit(busKnown ? busL2 : null, "V"),
        generator: formatUnit(genL2, "V"),
      },
      {
        label: "L3-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL3 : null, "V"),
        bus: formatUnit(busKnown ? busL3 : null, "V"),
        generator: formatUnit(genL3, "V"),
      },
      {
        label: "L1-L3 Voltage",
        mains: formatUnit(mainsKnown ? mainsL13 : null, "V"),
        bus: formatUnit(busKnown ? busL13 : null, "V"),
        generator: formatUnit(genL13, "V"),
      },
      {
        label: "Frequency",
        mains: formatUnit(mainsKnown ? mainsFrequency : null, "Hz", 1),
        bus: formatUnit(busKnown ? busFrequency : null, "Hz", 1),
        generator: formatUnit(frequency, "Hz", 1),
      },
      {
        label: "Power Factor",
        mains: formatNumber(mainsPf, 2),
        bus: "N/D",
        generator: formatNumber(powerFactor, 2),
      },
      {
        label: "Current (A)",
        mains: formatUnit(mainsCurrent, "A", 0),
        bus: "N/D",
        generator: formatUnit(currentKnown ? genCurrent : null, "A", 0),
      },
    ],
    [
      busFrequency,
      busKnown,
      busL1,
      busL2,
      busL3,
      busL13,
      currentKnown,
      frequency,
      genCurrent,
      genL1,
      genL2,
      genL3,
      genL13,
      mainsCurrent,
      mainsFrequency,
      mainsKnown,
      mainsL1,
      mainsL2,
      mainsL3,
      mainsL13,
      mainsPf,
      powerFactor,
    ],
  );

  const alarmRows = useMemo(
    () => alarmsForGenerator(gen, industrialAlarms),
    [gen, industrialAlarms],
  );

  const valueRows = [
    { icon: "clock" as const, label: "Horímetro", value: formatUnit(runHours, "h", 1) },
    { icon: "zap" as const, label: "Energia", value: formatUnit(energyKwh, "kWh", 0) },
    { icon: "gauge" as const, label: "Partidas", value: formatNumber(numberStarts, 0) },
  ];

  const canOperate =
    can("operate") && !gen.telemetryStale && (gen.status === "online" || gen.status === "alerta");
  const canAction = (action: IndustrialCommandAction) =>
    canOperate && gen.capabilities?.[action] === true;
  const canStart = canAction("start") && runningKnown && !running;
  const canStop = canAction("stop") && runningKnown && running;

  const runCommand = async (action: IndustrialCommandAction) => {
    const label = action.toUpperCase().replaceAll("_", " ");
    if (!canAction(action) || commandBusy || !confirmCmd(label)) return;

    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setCommandMessage(result.reason || label + " aceito pelo controlador");
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : "Falha no comando " + label);
    } finally {
      setCommandBusy(null);
    }
  };

  const displayStatus = generatorDisplayStatus(gen);
  const online = isGeneratorConnected(gen);
  const statusText =
    displayStatus === "stale"
      ? "SEM COMUNICAÇÃO"
      : displayStatus === "alerta"
        ? "ALARME"
        : displayStatus === "online"
          ? "COMUNICAÇÃO OK"
          : displayStatus === "nao_configurado"
            ? "NÃO CONFIGURADO"
            : "FORA DE LINHA";
  const statusClass =
    displayStatus === "alerta"
      ? "is-alert"
      : displayStatus === "online"
        ? "is-online"
        : displayStatus === "nao_configurado"
          ? "is-unconfigured"
          : "is-offline";
  const modeLabel = headerMode(gen.mode, modeKnown);

  return (
    <article
      className={cn(
        "vref-card",
        dse ? "is-dse" : "is-comap",
        hasMainsSource ? "has-mains-source" : "no-mains-source",
        displayStatus === "alerta" && "has-alert",
        displayStatus === "stale" && "has-stale-telemetry",
      )}
      data-controller-vendor={vendor}
      data-power-topology={gen.powerTopology ?? "unknown"}
      data-power-topology-source={gen.powerTopologySource ?? "unknown"}
      data-mains-state={!mainsKnown ? "unknown" : mainsPresent ? "present" : "absent"}
      data-telemetry-state={gen.telemetryStale ? "stale" : online ? "live" : "unavailable"}
    >
      <header className="vref-header">
        <span className={cn("vref-generator-badge", statusClass)}>G</span>
        <div className="vref-header-title">
          <Link to="/p/geradores/$id" params={{ id: gen.id }} title={gen.controller}>
            {displayGeneratorName(gen)}
          </Link>
          <span className={statusClass}>
            <i /> {statusText}
          </span>
        </div>
      </header>

      <div className="vref-gauges">
        <VerticalPowerGauge
          powerKw={powerKw}
          nominalKw={nominalPower}
          nominalSource={gen.nominalPowerSource ?? null}
        />
        <section className="vref-section vref-rpm" aria-label="Rotação">
          <div className="vref-section-heading">
            <h4>RPM</h4>
          </div>
          <div className="vref-rpm-gauge">
            <RpmGauge value={rpm} max={gen.metricLimits?.["rpm"]?.displayMax ?? null} />
          </div>
        </section>
      </div>

      <VerticalPowerFlow
        hasMainsSource={hasMainsSource}
        mainsPresent={mainsPresent}
        mainsKnown={mainsKnown}
        mainsFrequency={mainsFrequency}
        busKnown={busKnown}
        busPresent={busPresent}
        busFrequency={busFrequency}
        busVoltage={busL13 ?? busL1}
        generatorFrequency={frequency}
        generatorPowerKw={powerKw}
        mainsPowerKw={metricNumber(gen, "mains_power_kw", undefined)}
        generatorKnown={generatorKnown}
        generatorPresent={generatorPresent}
        modeLabel={modeLabel}
        mcb={gen.mcb}
        mcbKnown={mcbKnown}
        gcb={gen.gcb}
        gcbKnown={gcbKnown}
        canStart={canStart}
        canStop={canStop}
        canMcbOpen={canAction("mcb_open")}
        canMcbClose={canAction("mcb_close")}
        canGcbOpen={canAction("gcb_open")}
        canGcbClose={canAction("gcb_close")}
        busy={commandBusy}
        onCommand={(action) => void runCommand(action)}
      />

      <VerticalControls
        gen={gen}
        dse={dse}
        modeKnown={modeKnown}
        canOperate={canOperate}
        busy={commandBusy}
        onCommand={(action) => void runCommand(action)}
      />
      {commandMessage && <p className="vref-command-message">{commandMessage}</p>}

      <VerticalEngine
        oil={oil}
        oilUnit={oilUnit}
        coolant={coolant}
        coolantUnit={coolantUnit}
        fuel={fuel}
        fuelUnit={fuelUnit}
        battery={batteryVoltage}
        alternator={alternator}
        maintenance={maintenance}
        runHours={runHours}
        autonomyHours={autonomyHours}
        fuelOutOfRange={fuelOutOfRange}
        runningKnown={runningKnown}
        running={running}
      />

      <VerticalTables electricalRows={electricalRows} valueRows={valueRows} alarms={alarmRows} />
    </article>
  );
}
