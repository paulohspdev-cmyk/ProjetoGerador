import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import { generatorDisplayStatus, isGeneratorConnected, type Generator } from "@/data/generators";
import { rcApi, type IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, hasFreshMetric, metricNumber } from "./generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "./generator-presence";
import { VerticalControls, headerMode } from "./vertical-card/VerticalControls";
import { VerticalEngineAndRpm, VerticalTables } from "./vertical-card/VerticalTelemetrySections";
import { VerticalPowerFlow } from "./vertical-card/VerticalPowerFlow";
import { VerticalPowerGauge } from "./vertical-card/VerticalPowerGauge";
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

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
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
    battery,
    runHours,
    frequency,
    mainsFrequency,
    powerKw,
    powerFactor,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
    percents,
  } = telemetry;

  const vendor = controllerVendor(gen);
  const dse = vendor === "dse";
  // UNKNOWN preserva o card completo. Só escondemos a rede quando a topologia
  // estável foi resolvida explicitamente como genset_only.
  const hasMainsSource = gen.powerTopology !== "genset_only";
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

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
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
        label: "Tensão L1-N",
        mains: formatUnit(mainsKnown ? mainsL1 : null, "V"),
        generator: formatUnit(genL1, "V"),
      },
      {
        label: "Tensão L2-N",
        mains: formatUnit(mainsKnown ? mainsL2 : null, "V"),
        generator: formatUnit(genL2, "V"),
      },
      {
        label: "Tensão L3-N",
        mains: formatUnit(mainsKnown ? mainsL3 : null, "V"),
        generator: formatUnit(genL3, "V"),
      },
      {
        label: "Frequência",
        mains: formatUnit(mainsKnown ? mainsFrequency : null, "Hz", 1),
        generator: formatUnit(frequency, "Hz", 1),
      },
      {
        label: "Fator de potência",
        mains: formatNumber(mainsPf, 2),
        generator: formatNumber(powerFactor, 2),
      },
      {
        label: "Corrente",
        mains: formatUnit(mainsCurrent, "A", 0),
        generator: formatUnit(currentKnown ? genCurrent : null, "A", 0),
      },
    ],
    [
      currentKnown,
      frequency,
      genCurrent,
      genL1,
      genL2,
      genL3,
      mainsCurrent,
      mainsFrequency,
      mainsKnown,
      mainsL1,
      mainsL2,
      mainsL3,
      mainsPf,
      powerFactor,
    ],
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
        gen.telemetryStale && "has-stale-telemetry",
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
        <span className="vref-header-mode">MODO: {modeLabel}</span>
      </header>

      <VerticalPowerGauge
        powerKw={powerKw}
        nominalKw={nominalPower}
        nominalSource={gen.nominalPowerSource ?? null}
        rpm={rpm}
        rpmMax={gen.metricLimits?.["rpm"]?.displayMax ?? null}
      />

      <VerticalPowerFlow
        hasMainsSource={hasMainsSource}
        mainsPresent={mainsPresent}
        mainsKnown={mainsKnown}
        mainsFrequency={mainsFrequency}
        generatorFrequency={frequency}
        generatorPowerKw={powerKw}
        generatorKnown={generatorKnown}
        generatorPresent={generatorPresent}
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
        controls={
          <VerticalControls
            gen={gen}
            dse={dse}
            modeKnown={modeKnown}
            canOperate={canOperate}
            busy={commandBusy}
            onCommand={(action) => void runCommand(action)}
          />
        }
      />
      {commandMessage && <p className="vref-command-message">{commandMessage}</p>}

      <VerticalEngineAndRpm
        oil={oil}
        oilUnit={oilUnit}
        coolant={coolant}
        coolantUnit={coolantUnit}
        fuel={fuel}
        fuelUnit={fuelUnit}
        battery={batteryVoltage}
        batteryPercent={percents.battery}
        oilPercent={percents.oil}
        coolantPercent={percents.coolant}
        fuelPercent={percents.fuel}
        fuelOutOfRange={fuelOutOfRange}
      />

      <VerticalTables
        hasMainsSource={hasMainsSource}
        electricalRows={electricalRows}
        valueRows={valueRows}
      />
    </article>
  );
}
