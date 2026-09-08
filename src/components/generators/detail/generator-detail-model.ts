import type { Generator } from "@/data/generators";

import { displayGeneratorName, hasMetric, metricNumber } from "../generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "../generator-presence";

export type GeneratorDetailModel = ReturnType<typeof buildGeneratorDetailModel>;

function statusText(gen: Generator, rotating: boolean | null) {
  if (gen.status === "nao_configurado") return "Não configurado";
  if (gen.status === "offline") return "Offline";
  if (gen.status === "alerta") return "Alerta";
  if (rotating === true) return "Running";
  if (rotating === false) return "Off - Ready";
  return "Online";
}

export function buildGeneratorDetailModel(gen: Generator) {
  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genL12 = metricNumber(gen, "voltage_l1_l2", gen.gen.l12);
  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const load = metricNumber(gen, "power_kw", gen.load);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const temp = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const batt = metricNumber(gen, "battery_voltage", gen.battery);
  const alt = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const alarms = metricNumber(gen, "alarm_count", gen.alarms);

  const runningKnown = rpm != null;
  const running = runningKnown ? isPositiveMeasurement(rpm) : null;
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const mcb = mcbKnown && gen.mcb;
  const gcb = gcbKnown && gen.gcb;
  const mainsKnown = [mainsL1, mainsL2, mainsL3, mainsL12].some((value) => value != null);
  const mainsOk = mainsKnown && hasPositiveMeasurement([mainsL1, mainsL2, mainsL3, mainsL12]);
  const modeLabel = modeKnown ? gen.mode : "N/D";

  return {
    available: new Set(gen.availableMetrics ?? []),
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
    mainsOk,
    modeLabel,
    ready: statusText(gen, running),
    name: displayGeneratorName(gen),
    comm: gen.telemetrySource === "rapid_scada" && gen.status !== "offline",
  };
}
