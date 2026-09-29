import type { Generator } from "@/data/generators";
import type { IndustrialCommandAction } from "@/lib/api";

import { readGeneratorTelemetry } from "../generator-health";
import {
  displayGeneratorName,
  hasFreshMetric,
  metricNumber,
  nominalPowerNumber,
} from "../generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "../generator-presence";

export type ControllerFamily = "COMAP" | "DSE" | "UNKNOWN";
export type BusEnergySource =
  "mains" | "generator" | "generators_parallel" | "mains_and_generators" | "unknown";

export type ModeControl = {
  key: string;
  label: string;
  active: boolean;
  action: IndustrialCommandAction | null;
};

export type DetailParameter = { label: string; value: string };
export type DetailSensor = {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number | null;
  digits: number;
  color: string;
};
export type ElectricalReadings = {
  title: string;
  voltages: string;
  currents: string;
  frequency: string;
  power: string;
  powerFactor: string;
};
export type PhaseChart = {
  title: string;
  phases: { name: string; value: number }[];
  caption: string;
};

export type GeneratorDetailModel = ReturnType<typeof buildGeneratorDetailModel>;

function controllerFamily(gen: Generator): ControllerFamily {
  const text = `${gen.controllerType ?? ""} ${gen.controller ?? ""}`.toLowerCase();
  if (/\bdse\b|deep sea/.test(text)) return "DSE";
  if (/comap|inteli/.test(text)) return "COMAP";
  return "UNKNOWN";
}

function sourceLabel(source: BusEnergySource) {
  if (source === "mains") return "Rede";
  if (source === "generator") return "Gerador";
  if (source === "generators_parallel") return "Geradores em paralelo";
  if (source === "mains_and_generators") return "Rede e geradores";
  return "N/D";
}

function breakerLabel(known: boolean, closed: boolean) {
  if (!known) return "Desconhecido";
  return closed ? "Fechado" : "Aberto";
}

function formatAutonomy(minutes: number | null) {
  if (minutes == null) return "N/D";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function reading(value: number | null, unit: string, digits: number) {
  if (value == null || !Number.isFinite(value)) return "";
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function joinReadings(parts: string[]) {
  const text = parts.filter(Boolean).join(" · ");
  return text || "N/D";
}

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
  const genL13 = metricNumber(gen, "voltage_l3_l1", undefined);
  const genI1 = metricNumber(gen, "current_l1", undefined);
  const genI2 = metricNumber(gen, "current_l2", undefined);
  const genI3 = metricNumber(gen, "current_l3", undefined);
  const mainsPower = metricNumber(gen, "mains_power_kw", undefined);
  const mainsI1 = metricNumber(gen, "mains_current_l1", undefined);
  const mainsI2 = metricNumber(gen, "mains_current_l2", undefined);
  const mainsI3 = metricNumber(gen, "mains_current_l3", undefined);
  const generatorVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const generatorFrequencyKnown = hasFreshMetric(gen, "frequency");
  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const mainsL13 = metricNumber(gen, "mains_voltage_l3_l1", undefined);
  const load = metricNumber(gen, "power_kw", gen.load);
  const telemetry = readGeneratorTelemetry(gen);
  const nominalPower = nominalPowerNumber(gen);
  const oil = telemetry.oil;
  const temp = telemetry.coolant;
  const fuel = telemetry.fuel;
  const fuelCapacity = telemetry.fuelCapacity;
  const oilUnit = telemetry.oilUnit;
  const tempUnit = telemetry.coolantUnit;
  const fuelUnit = telemetry.fuelUnit;
  const alternatorTemp = metricNumber(gen, "alternator_temperature", undefined);
  const engineLoad = metricNumber(gen, "engine_load", undefined);
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
  const hasMainsSource = gen.powerTopology !== "genset_only";
  const mainsToBus = hasMainsSource && mainsKnown && mainsPresent && mcbKnown && mcb;
  const generatorToBus = generatorKnown && generatorPresent && gcbKnown && gcb;
  const busLive = mainsToBus || generatorToBus;
  const busLoadKw = generatorToBus ? load : mainsToBus ? mainsPower : null;
  const onUtility = mainsToBus && !generatorToBus;
  const mainsOk = mainsPresent;
  const modeLabel = modeKnown ? gen.mode : "N/D";
  const family = controllerFamily(gen);
  const parallelGenerators =
    metricNumber(gen, "parallel_generators", undefined) ??
    metricNumber(gen, "parallel_generator_count", undefined);
  const busEnergySource: BusEnergySource =
    mainsToBus && generatorToBus
      ? "mains_and_generators"
      : mainsToBus
        ? "mains"
        : generatorToBus && parallelGenerators != null && parallelGenerators > 1
          ? "generators_parallel"
          : generatorToBus
            ? "generator"
            : "unknown";
  const fuelRate = telemetry.fuelRate;
  const powerKva = metricNumber(gen, "power_kva", undefined);
  const powerFactor = metricNumber(gen, "power_factor", undefined);
  const mainsPowerFactor = metricNumber(gen, "mains_power_factor", undefined);
  const numberStarts = metricNumber(gen, "number_starts", undefined);
  const fuelLiters = fuelUnit === "L" ? fuel : null;
  const autonomyMinutes =
    telemetry.autonomyHours != null && telemetry.autonomyHours >= 0
      ? Math.round(telemetry.autonomyHours * 60)
      : null;
  const mode = modeKnown ? String(gen.mode) : "";
  const allowed = (action: IndustrialCommandAction) => gen.capabilities?.[action] === true;
  const commandAction = (action: IndustrialCommandAction): IndustrialCommandAction | null =>
    allowed(action) ? action : null;
  let modeControls: ModeControl[] = [];
  if (family === "COMAP") {
    modeControls = [
      {
        key: "off",
        label: "OFF",
        active: mode === "OFF" || mode === "STOP",
        action: commandAction("off"),
      },
      { key: "man", label: "MAN", active: mode === "MANUAL", action: commandAction("manual") },
      { key: "aut", label: "AUT", active: mode === "AUTO", action: commandAction("auto") },
      { key: "test", label: "TEST", active: mode === "TESTE", action: commandAction("test") },
    ];
  } else if (family === "DSE") {
    modeControls = [
      { key: "hand", label: "✋", active: mode === "MANUAL", action: commandAction("manual") },
      { key: "auto", label: "A", active: mode === "AUTO", action: commandAction("auto") },
    ];
    if (mode === "OFF" || mode === "STOP") {
      modeControls.push({
        key: "off",
        label: mode === "STOP" ? "STOP" : "OFF",
        active: true,
        action: null,
      });
    }
    if (mode === "TESTE" || allowed("test")) {
      modeControls.push({
        key: "test",
        label: "TEST",
        active: mode === "TESTE",
        action: commandAction("test"),
      });
    }
  }

  const limitMin = (key: string) => gen.metricLimits?.[key]?.displayMin ?? 0;
  const limitMax = (key: string) => gen.metricLimits?.[key]?.displayMax ?? null;
  const sensors: DetailSensor[] = [
    temp != null
      ? {
          label: "Temp. do motor",
          value: temp,
          unit: tempUnit,
          min: limitMin("coolant_temperature"),
          max: limitMax("coolant_temperature"),
          digits: 0,
          color: "var(--info)",
        }
      : null,
    oil != null
      ? {
          label: "Pressão de óleo",
          value: oil,
          unit: oilUnit,
          min: limitMin("oil_pressure"),
          max: limitMax("oil_pressure"),
          digits: 1,
          color: "var(--primary)",
        }
      : null,
    alternatorTemp != null
      ? {
          label: "Temp. do alternador",
          value: alternatorTemp,
          unit: gen.metricUnits?.["alternator_temperature"] ?? "",
          min: limitMin("alternator_temperature"),
          max: limitMax("alternator_temperature"),
          digits: 0,
          color: "var(--chart-2)",
        }
      : null,
    alt != null
      ? {
          label: "Tensão do alternador",
          value: alt,
          unit: gen.metricUnits?.["alternator_voltage"] ?? "V",
          min: limitMin("alternator_voltage"),
          max: limitMax("alternator_voltage"),
          digits: 1,
          color: "var(--chart-2)",
        }
      : null,
    engineLoad != null
      ? {
          label: "Carga do motor",
          value: engineLoad,
          unit: gen.metricUnits?.["engine_load"] ?? "%",
          min: limitMin("engine_load"),
          max: limitMax("engine_load"),
          digits: 0,
          color: "var(--online)",
        }
      : null,
  ].filter((item): item is DetailSensor => item != null);
  const livePhases = (pairs: [string, number | null][]) =>
    pairs
      .filter((pair): pair is [string, number] => pair[1] != null && pair[1] > 0)
      .map(([name, value]) => ({ name, value }));
  const captionOf = (...parts: Array<string | false>) =>
    parts.filter((part): part is string => Boolean(part) && part !== "N/D").join(" · ");
  const phaseCharts: PhaseChart[] = [];
  if (mainsPresent) {
    const phases = livePhases([
      ["L1", mainsL1],
      ["L2", mainsL2],
      ["L3", mainsL3],
    ]);
    if (phases.length) {
      phaseCharts.push({
        title: "Fases da concessionária",
        phases,
        caption: captionOf(
          reading(mainsFrequency, "Hz", 1),
          reading(mainsPower, "kW", 0),
          mainsI1 != null && mainsI1 > 0 && `I1 ${reading(mainsI1, "A", 0)}`,
          mainsI2 != null && mainsI2 > 0 && `I2 ${reading(mainsI2, "A", 0)}`,
          mainsI3 != null && mainsI3 > 0 && `I3 ${reading(mainsI3, "A", 0)}`,
        ),
      });
    }
  }
  if (generatorPresent) {
    const phases = livePhases([
      ["L1", genL1],
      ["L2", genL2],
      ["L3", genL3],
    ]);
    if (phases.length) {
      phaseCharts.push({
        title: "Fases do gerador",
        phases,
        caption: captionOf(
          reading(frequency, "Hz", 1),
          reading(load, "kW", 0),
          genI1 != null && genI1 > 0 && `I1 ${reading(genI1, "A", 0)}`,
          genI2 != null && genI2 > 0 && `I2 ${reading(genI2, "A", 0)}`,
          genI3 != null && genI3 > 0 && `I3 ${reading(genI3, "A", 0)}`,
          powerFactor != null && powerFactor > 0 && `FP ${reading(powerFactor, "", 2)}`,
        ),
      });
    }
  }
  const generatorElectrical: ElectricalReadings | null = generatorPresent
    ? {
        title: "Gerador",
        voltages: joinReadings([
          reading(genL1, "V", 0) && `L1 ${reading(genL1, "V", 0)}`,
          reading(genL2, "V", 0) && `L2 ${reading(genL2, "V", 0)}`,
          reading(genL3, "V", 0) && `L3 ${reading(genL3, "V", 0)}`,
        ]),
        currents: joinReadings([
          reading(genI1, "A", 0) && `I1 ${reading(genI1, "A", 0)}`,
          reading(genI2, "A", 0) && `I2 ${reading(genI2, "A", 0)}`,
          reading(genI3, "A", 0) && `I3 ${reading(genI3, "A", 0)}`,
        ]),
        frequency: reading(frequency, "Hz", 1) || "N/D",
        power: reading(load, "kW", 0) || "N/D",
        powerFactor: powerFactor == null ? "" : reading(powerFactor, "", 2),
      }
    : null;
  const mainsElectrical: ElectricalReadings | null = mainsPresent
    ? {
        title: "Rede",
        voltages: joinReadings([
          reading(mainsL1, "V", 0) && `L1 ${reading(mainsL1, "V", 0)}`,
          reading(mainsL2, "V", 0) && `L2 ${reading(mainsL2, "V", 0)}`,
          reading(mainsL3, "V", 0) && `L3 ${reading(mainsL3, "V", 0)}`,
        ]),
        currents: joinReadings([
          reading(mainsI1, "A", 0) && `I1 ${reading(mainsI1, "A", 0)}`,
          reading(mainsI2, "A", 0) && `I2 ${reading(mainsI2, "A", 0)}`,
          reading(mainsI3, "A", 0) && `I3 ${reading(mainsI3, "A", 0)}`,
        ]),
        frequency: reading(mainsFrequency, "Hz", 1) || "N/D",
        power: reading(mainsPower, "kW", 0) || "N/D",
        powerFactor: mainsPowerFactor == null ? "" : reading(mainsPowerFactor, "", 2),
      }
    : null;
  const parameters: DetailParameter[] = [
    {
      label: family === "DSE" ? "Modo atual" : "Modo de operação",
      value: modeKnown ? modeLabel : "N/D",
    },
    {
      label: family === "DSE" ? "Manual / Auto" : "Fonte selecionada",
      value:
        family === "DSE"
          ? mode === "MANUAL"
            ? "Manual"
            : mode === "AUTO"
              ? "Auto"
              : modeKnown
                ? modeLabel
                : "N/D"
          : sourceLabel(busEnergySource),
    },
  ];
  if (family === "DSE" && hasMainsSource) {
    parameters.push({
      label: "Estado da rede",
      value: mainsPresent ? "Presente" : mainsKnown ? "Ausente" : "N/D",
    });
  }
  if (family !== "COMAP")
    parameters.push({ label: "Origem do barramento", value: sourceLabel(busEnergySource) });
  parameters.push({ label: "GCB", value: breakerLabel(gcbKnown, gcb) });
  if (hasMainsSource) parameters.push({ label: "MCB", value: breakerLabel(mcbKnown, mcb) });
  const liveVoltage = generatorPresent
    ? (genL12 ?? genL1)
    : mainsPresent
      ? (mainsL12 ?? mainsL1)
      : (genL12 ?? genL1);
  if (liveVoltage != null)
    parameters.push({ label: "Tensão", value: reading(liveVoltage, "V", 0) });
  if (mainsPresent && mainsFrequency != null) {
    parameters.push({ label: "Frequência da rede", value: reading(mainsFrequency, "Hz", 1) });
  }
  if (generatorPresent && frequency != null) {
    parameters.push({ label: "Frequência do gerador", value: reading(frequency, "Hz", 1) });
  } else if (!mainsPresent && frequency != null) {
    parameters.push({ label: "Frequência", value: reading(frequency, "Hz", 1) });
  }
  if (nominalPower != null)
    parameters.push({ label: "Potência nominal", value: reading(nominalPower, "kW", 0) });
  if (powerKva != null)
    parameters.push({ label: "Potência aparente", value: reading(powerKva, "kVA", 0) });
  if (numberStarts != null)
    parameters.push({ label: "Partidas totais", value: String(Math.round(numberStarts)) });

  return {
    available: new Set(gen.definedMetrics ?? gen.availableMetrics ?? []),
    rpm,
    frequency,
    mainsFrequency,
    genL1,
    genL2,
    genL3,
    genL12,
    genL13,
    genI1,
    genI2,
    genI3,
    mainsPower,
    mainsI1,
    mainsI2,
    mainsI3,
    onUtility,
    mainsL1,
    mainsL2,
    mainsL3,
    mainsL12,
    mainsL13,
    load,
    nominalPower,
    nominalPowerSource: gen.nominalPowerSource ?? null,
    rpmGaugeMax: gen.metricLimits?.["rpm"]?.displayMax ?? null,
    oilGaugeMax: gen.metricLimits?.["oil_pressure"]?.displayMax ?? null,
    tempGaugeMax: gen.metricLimits?.["coolant_temperature"]?.displayMax ?? null,
    oil,
    oilUnit,
    temp,
    tempUnit,
    fuel,
    fuelUnit,
    fuelCapacity,
    fuelOutOfRange: telemetry.fuelOutOfRange,
    alternatorTemp,
    engineLoad,
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
    family,
    hasMainsSource,
    busEnergySource,
    fuelRate,
    fuelLiters,
    autonomyLabel: formatAutonomy(autonomyMinutes),
    powerKva,
    numberStarts,
    modeControls,
    sensors,
    generatorElectrical,
    mainsElectrical,
    phaseCharts,
    parameters,
    ready: statusText(gen, running),
    name: displayGeneratorName(gen),
    comm:
      gen.telemetrySource === "rapid_scada" &&
      !gen.telemetryStale &&
      (gen.status === "online" || gen.status === "alerta"),
  };
}
