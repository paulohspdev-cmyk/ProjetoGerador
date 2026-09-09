import type { Generator, MetricLimit } from "@/data/generators";

import { metricNumber } from "./generator-metrics";

export type MeterTone = "good" | "warning" | "critical" | "neutral";

type VisualScale = MetricLimit & {
  direction?: "higher_worse" | "lower_worse" | "neutral";
};

// Escalas sem setpoint de proteção são apenas geométricas e ficam neutras.
// Verde/laranja/vermelho só é usado quando existe threshold real da controladora
// ou uma regra de produto explícita (manutenção 300 h).
const VISUAL_SCALES: Record<string, VisualScale> = {
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

function mergedScale(
  fallback: VisualScale | undefined,
  configured?: MetricLimit,
): VisualScale | undefined {
  if (!fallback && !configured) return undefined;
  return { ...(fallback ?? {}), ...(configured ?? {}) } as VisualScale;
}

function positiveThreshold(value: number | null) {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function visualTone(percent: number | null, scale?: VisualScale): MeterTone {
  if (percent == null || !scale || scale.direction === "neutral") return "neutral";
  const risk = scale.direction === "lower_worse" ? 100 - percent : percent;
  if (risk >= 90) return "critical";
  if (risk >= 70) return "warning";
  return "good";
}

function meterState(value: number | null, scale?: VisualScale) {
  const percent = percentFromLimit(value, scale);
  const thresholdTone = toneFromLimit(value, scale);
  return {
    percent,
    tone: thresholdTone === "neutral" ? visualTone(percent, scale) : thresholdTone,
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
  const rawPowerFactor = metricNumber(gen, "power_factor", undefined);
  const powerFactor =
    rawPowerFactor != null &&
    Math.abs(rawPowerFactor) <= 1.001 &&
    powerKw != null &&
    Math.abs(powerKw) > 0.1
      ? rawPowerFactor
      : null;
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
  const oilWarning = metricNumber(gen, "oil_warning_bar", undefined);
  const oilShutdown = metricNumber(gen, "oil_shutdown_bar", undefined);
  const coolantWarning = metricNumber(gen, "coolant_warning_c", undefined);
  const fuelWarning = metricNumber(gen, "fuel_warning_l", undefined);
  const fuelShutdown = metricNumber(gen, "fuel_shutdown_l", undefined);
  const fuelPercent =
    fuelUnit === "%"
      ? progressPercent(fuel, 100)
      : fuelCapacity != null && fuelCapacity > 0
        ? progressPercent(fuel, fuelCapacity)
        : null;

  const limits = gen.metricLimits ?? {};
  const oilDisplay: VisualScale | undefined =
    oilUnit === "bar" ? { displayMin: 0, displayMax: 10, direction: "neutral" } : undefined;
  const oilScale = mergedScale(oilDisplay, limits["oil_pressure"]);
  if (oilScale) {
    const warning = positiveThreshold(oilWarning);
    const shutdown = positiveThreshold(oilShutdown);
    if (warning != null) oilScale.warningLow = warning;
    if (shutdown != null) oilScale.criticalLow = shutdown;
  }

  const coolantScale = mergedScale(
    { displayMin: -40, displayMax: 120, direction: "neutral" },
    limits["coolant_temperature"],
  );
  if (coolantScale) {
    const warning = positiveThreshold(coolantWarning);
    if (warning != null) coolantScale.warningHigh = warning;
  }

  const fuelDisplay: VisualScale =
    fuelUnit === "%"
      ? { displayMin: 0, displayMax: 100, direction: "neutral" }
      : {
          displayMin: 0,
          displayMax: fuelCapacity != null && fuelCapacity > 0 ? fuelCapacity : 682,
          direction: "neutral",
        };
  const fuelScale = mergedScale(fuelDisplay, limits["fuel_level"]);
  if (fuelScale && fuelUnit === "L") {
    const warning = positiveThreshold(fuelWarning);
    const shutdown = positiveThreshold(fuelShutdown);
    if (warning != null) fuelScale.warningLow = warning;
    if (shutdown != null) fuelScale.criticalLow = shutdown;
  }

  const oilMeter = meterState(oil, oilScale);
  const coolantMeter = meterState(coolant, coolantScale);
  const fuelMeter = meterState(fuel, fuelScale);
  const alternatorMeter = meterState(
    alternator,
    mergedScale(VISUAL_SCALES["alternator_voltage"], limits["alternator_voltage"]),
  );
  const maintenanceMeter = meterState(
    maintenance,
    mergedScale(VISUAL_SCALES["maintenance_hours"], limits["maintenance_hours"]),
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
