import type { Generator, MetricLimit } from "@/data/generators";

import { metricNumber } from "./generator-metrics";

export type MeterTone = "good" | "warning" | "critical" | "neutral";

type VisualScale = MetricLimit & {
  direction?: "higher_worse" | "lower_worse" | "neutral";
};

// Escalas de apresentação usadas somente quando o pack não fornece displayMin/displayMax.
// Elas não geram alarmes nem substituem setpoints da controladora. A manutenção de 300 h é
// o intervalo visual definido pelo produto; instalações com outro plano devem sobrescrevê-lo
// no metricLimits do pack homologado.
const VISUAL_SCALES: Record<string, VisualScale> = {
  oil_pressure: { displayMin: 0, displayMax: 10, direction: "lower_worse" },
  coolant_temperature: { displayMin: 0, displayMax: 120, direction: "higher_worse" },
  fuel_level: { displayMin: 0, displayMax: 100, direction: "lower_worse" },
  alternator_voltage: { displayMin: 0, displayMax: 30, direction: "neutral" },
  maintenance_hours: { displayMin: 0, displayMax: 300, direction: "higher_worse" },
};

export function progressPercent(value: number | null, maximum: number) {
  if (value == null || !Number.isFinite(value) || maximum <= 0) return null;
  return Math.min(100, Math.max(0, (value / maximum) * 100));
}

export function visibleMeterPercent(percent: number | null, tone: MeterTone) {
  if (percent == null) return null;
  if (percent === 0 && tone === "critical") return 4;
  return percent;
}

export function toneFromLimit(value: number | null, limit?: MetricLimit): MeterTone {
  if (value == null || !limit) return "neutral";
  if (
    (limit.criticalLow != null && value <= limit.criticalLow) ||
    (limit.criticalHigh != null && value >= limit.criticalHigh)
  )
    return "critical";
  if (
    (limit.warningLow != null && value <= limit.warningLow) ||
    (limit.warningHigh != null && value >= limit.warningHigh)
  )
    return "warning";
  const hasAnyThreshold =
    limit.criticalLow != null ||
    limit.criticalHigh != null ||
    limit.warningLow != null ||
    limit.warningHigh != null;
  return hasAnyThreshold ? "good" : "neutral";
}

export function percentFromLimit(value: number | null, limit?: MetricLimit) {
  if (value == null || !limit || limit.displayMax == null || limit.displayMax <= 0) return null;
  const minimum = limit.displayMin ?? 0;
  const span = limit.displayMax - minimum;
  if (span <= 0) return null;
  return Math.min(100, Math.max(0, ((value - minimum) / span) * 100));
}

function effectiveScale(key: string, configured?: MetricLimit): VisualScale | undefined {
  const fallback = VISUAL_SCALES[key];
  if (!configured) return fallback;
  return {
    ...fallback,
    ...configured,
  };
}

function visualTone(percent: number | null, scale?: VisualScale): MeterTone {
  if (percent == null || !scale || scale.direction === "neutral") return "neutral";
  const risk = scale.direction === "lower_worse" ? 100 - percent : percent;
  if (risk >= 90) return "critical";
  if (risk >= 70) return "warning";
  return "good";
}

function meterState(key: string, value: number | null, configured?: MetricLimit) {
  const scale = effectiveScale(key, configured);
  const percent = percentFromLimit(value, scale);
  const configuredTone = toneFromLimit(value, configured);
  return {
    percent,
    tone: configuredTone === "neutral" ? visualTone(percent, scale) : configuredTone,
  };
}

export function toneTextClass(tone: MeterTone) {
  if (tone === "good") return "text-online";
  if (tone === "warning") return "text-alert";
  if (tone === "critical") return "text-offline";
  return "text-muted-foreground";
}

export function readGeneratorTelemetry(gen: Generator) {
  const rpm = metricNumber(gen, "rpm", gen.rpm);
  const oil = metricNumber(gen, "oil_pressure", gen.oilPressure);
  const coolant = metricNumber(gen, "coolant_temperature", gen.coolantTemp);
  const fuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const battery = metricNumber(gen, "battery_voltage", gen.battery);
  const alternator = metricNumber(gen, "alternator_voltage", gen.alternatorVoltage);
  const maintenance = metricNumber(gen, "maintenance_hours", gen.maintenance);
  const runHours = metricNumber(gen, "run_hours", gen.runHours);
  const frequency = metricNumber(gen, "frequency", gen.frequency);
  const mainsFrequency = metricNumber(gen, "mains_frequency", gen.mainsFrequency);
  const powerKw = metricNumber(gen, "power_kw", gen.load);
  const powerFactor = metricNumber(gen, "power_factor", undefined);
  const nominalPower =
    metricNumber(gen, "nominal_power_kw", gen.nominalPower) ??
    metricNumber(gen, "nominal_power", gen.nominalPower);
  const engineLoad = metricNumber(gen, "engine_load", undefined);
  const currentL1 = metricNumber(gen, "current_l1", undefined);
  const currentL2 = metricNumber(gen, "current_l2", undefined);
  const currentL3 = metricNumber(gen, "current_l3", undefined);
  const running = rpm != null && rpm > 0;

  const oilUnit = gen.metricUnits?.["oil_pressure"] || "bar";
  const fuelUnit = gen.metricUnits?.["fuel_level"] || "%";
  const fuelCapacity =
    metricNumber(gen, "fuel_capacity_l", undefined) ??
    metricNumber(gen, "fuel_capacity", undefined);
  const fuelPercent =
    fuelUnit === "%"
      ? progressPercent(fuel, 100)
      : fuelCapacity != null && fuelCapacity > 0
        ? progressPercent(fuel, fuelCapacity)
        : null;

  const limits = gen.metricLimits ?? {};
  const oilMeter = meterState("oil_pressure", oil, limits["oil_pressure"]);
  const coolantMeter = meterState("coolant_temperature", coolant, limits["coolant_temperature"]);
  const fuelMeter = meterState("fuel_level", fuel, limits["fuel_level"]);
  const alternatorMeter = meterState(
    "alternator_voltage",
    alternator,
    limits["alternator_voltage"],
  );
  const maintenanceMeter = meterState(
    "maintenance_hours",
    maintenance,
    limits["maintenance_hours"],
  );
  const tones = {
    oil: oilMeter.tone,
    coolant: coolantMeter.tone,
    fuel: fuelMeter.tone,
    alternator: alternatorMeter.tone,
    maintenance: maintenanceMeter.tone,
    runHours: toneFromLimit(runHours, limits["run_hours"]),
  };

  return {
    rpm,
    oil,
    oilUnit,
    coolant,
    fuel,
    fuelUnit,
    fuelPercent,
    battery,
    alternator,
    maintenance,
    runHours,
    frequency,
    mainsFrequency,
    powerKw,
    powerFactor,
    nominalPower,
    engineLoad,
    currentL1,
    currentL2,
    currentL3,
    running,
    tones,
    percents: {
      oil: visibleMeterPercent(oilMeter.percent, tones.oil),
      coolant: visibleMeterPercent(coolantMeter.percent, tones.coolant),
      fuel: visibleMeterPercent(fuelMeter.percent ?? fuelPercent, tones.fuel),
      alternator: visibleMeterPercent(alternatorMeter.percent, tones.alternator),
      maintenance: visibleMeterPercent(maintenanceMeter.percent, tones.maintenance),
      runHours: percentFromLimit(runHours, limits["run_hours"]),
    },
  };
}
