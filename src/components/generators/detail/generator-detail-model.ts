import type { Generator } from "@/data/generators";

import { displayGeneratorName, hasFreshMetric, metricNumber } from "../generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "../generator-presence";

export type GeneratorDetailModel = ReturnType<typeof buildGeneratorDetailModel>;

function statusText(gen: Generator, rotating: boolean | null) {
  if (gen.status === "nao_configurado") return "Não configurado";
  if (gen.status === "offline") return "Offline";
  if (gen.status === "alerta") return "Alerta";
  if (rotating === true) return "Running";
  if (rotating === false) return "Parado";
  return "Online";
}

export function buildGeneratorDetailModel(gen: Generator) {
  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const mainsFrequency = metricNumber(gen, "mains_frequency", gen.mainsFrequency);
  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genL12 = metricNumber(gen, "voltage_l1_l2", gen.gen.l12);
  const generatorVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const generatorFrequencyKnown = hasFreshMetric(gen, "frequency");
  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const load = metricNumber(gen, "power_kw", gen.load);
  const nominalPower =
    metricNumber(gen, "nominal_power_kw", gen.nominalPower) ??
    metricNumber(gen, "nominal_power", gen.nominalPower);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const temp = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const batt = metricNumber(gen, "battery_voltage", gen.battery);
  const alt = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const alarms = metricNumber(gen, "alarm_count", gen.alarms);

  const runningKnown = rpm != null && hasFreshMetric(gen, "rpm");
  const running = runningKnown ? isPositiveMeasurement(rpm) : null;
  const mcbKnown = hasFreshMetric(gen, "mcb_closed");
  const gcbKnown = hasFreshMetric(gen, "gcb_closed");
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");
  const mcb = mcbKnown && gen.mcb;
  const gcb = gcbKnown && gen.gcb;
  const mainsKnown =
    ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"].some(
      (key) => hasFreshMetric(gen, key),
    ) || hasFreshMetric(gen, "mains_frequency");
  const mainsPresent =
    mainsKnown &&
    hasPositiveMeasurement([
      mainsL1,
      mainsL2,
      mainsL3,
      mainsL12,
      hasFreshMetric(gen, "mains_frequency") ? mainsFrequency : null,
    ]);
  const generatorKnown = runningKnown || generatorVoltageKnown || generatorFrequencyKnown;
  const generatorPresent =
    generatorKnown &&
    ((runningKnown && running === true) ||
      hasPositiveMeasurement([
        genL1,
        genL2,
        genL3,
        genL12,
        generatorFrequencyKnown ? frequency : null,
      ]));
  const mainsToBus = mainsKnown && mainsPresent && mcbKnown && mcb;
  const generatorToBus = generatorKnown && generatorPresent && gcbKnown && gcb;
  const busLive = mainsToBus || generatorToBus;
  const busLoadKw = generatorToBus && !mainsToBus ? load : null;
  const mainsOk = mainsPresent;
  const modeLabel = modeKnown ? gen.mode : "N/D";

  return {
    available: new Set(gen.definedMetrics ?? gen.availableMetrics ?? []),
    rpm,
    frequency,
    genL1,
    genL2,
    genL3,
    genL12,
    mainsL1,
    mainsL2,
    mainsL3,
    mainsL12,
    load,
    nominalPower,
    oil,
    temp,
    fuel,
    batt,
    alt,
    maintenance,
    runHours,
    alarms,
    runningKnown,
    running,
    mcbKnown,
    gcbKnown,
    modeKnown,
    mcb,
    gcb,
    mainsKnown,
    mainsPresent,
    mainsToBus,
    generatorKnown,
    generatorPresent,
    generatorToBus,
    busLive,
    busLoadKw,
    mainsOk,
    modeLabel,
    ready: statusText(gen, running),
    name: displayGeneratorName(gen),
    comm:
      gen.telemetrySource === "rapid_scada" &&
      !gen.telemetryStale &&
      (gen.status === "online" || gen.status === "alerta"),
  };
}
