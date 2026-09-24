import type { Generator, MetricLimit } from "@/data/generators";

import { metricNumber, nominalPowerNumber } from "./generator-metrics";

export type MeterTone = "good" | "warning" | "critical" | "neutral";

type VisualScale = MetricLimit;

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

function meterState(value: number | null, scale?: VisualScale) {
  return {
    percent: percentFromLimit(value, scale),
    tone: toneFromLimit(value, scale),
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
  const rawFuel = metricNumber(gen, "fuel_level", gen.fuelLevel);
  const fuelRate = metricNumber(gen, "fuel_rate", undefined);
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
    Math.abs(powerKw) > 0
      ? rawPowerFactor
      : null;
  const nominalPower = nominalPowerNumber(gen);
  const engineLoad = metricNumber(gen, "engine_load", undefined);
  const currentL1 = metricNumber(gen, "current_l1", undefined);
  const currentL2 = metricNumber(gen, "current_l2", undefined);
  const currentL3 = metricNumber(gen, "current_l3", undefined);
  const running = rpm != null && rpm > 0;

  const oilUnit = gen.metricUnits?.["oil_pressure"] || "";
  const coolantUnit = gen.metricUnits?.["coolant_temperature"] || "";
  const rawFuelUnit = gen.metricUnits?.["fuel_level"] || "";
  const fuelCapacity =
    metricNumber(gen, "fuel_capacity_l", undefined) ??
    metricNumber(gen, "fuel_capacity", undefined) ??
    (gen.fuelCapacityLiters != null && Number.isFinite(Number(gen.fuelCapacityLiters))
      ? Number(gen.fuelCapacityLiters)
      : null);
  const fuelLiters =
    rawFuelUnit === "L"
      ? rawFuel
      : rawFuelUnit === "%" &&
          rawFuel != null &&
          rawFuel >= 0 &&
          rawFuel <= 100 &&
          fuelCapacity != null &&
          fuelCapacity > 0
        ? (rawFuel / 100) * fuelCapacity
        : null;
  const fuel = fuelLiters ?? rawFuel;
  const fuelUnit = fuelLiters != null ? "L" : rawFuelUnit;
  const oilWarning = metricNumber(gen, "oil_warning_bar", undefined);
  const oilShutdown = metricNumber(gen, "oil_shutdown_bar", undefined);
  const coolantWarning = metricNumber(gen, "coolant_warning_c", undefined);
  const fuelWarning = metricNumber(gen, "fuel_warning_l", undefined);
  const fuelShutdown = metricNumber(gen, "fuel_shutdown_l", undefined);
  const autonomyHours =
    fuelLiters != null && fuelLiters >= 0 && fuelRate != null && fuelRate > 0
      ? fuelLiters / fuelRate
      : null;
  const fuelWithinCapacity =
    fuelCapacity != null &&
    fuelCapacity > 0 &&
    rawFuel != null &&
    rawFuel >= 0 &&
    rawFuel <= fuelCapacity;
  const fuelOutOfRange =
    rawFuelUnit === "L" &&
    rawFuel != null &&
    rawFuel >= 0 &&
    fuelCapacity != null &&
    fuelCapacity > 0 &&
    rawFuel > fuelCapacity;
  const fuelPercent =
    rawFuelUnit === "%"
      ? progressPercent(rawFuel, 100)
      : fuelWithinCapacity
        ? progressPercent(rawFuel, fuelCapacity)
        : null;

  const limits = gen.metricLimits ?? {};
  const oilWarningThreshold = oilUnit === "bar" ? positiveThreshold(oilWarning) : undefined;
  const oilShutdownThreshold = oilUnit === "bar" ? positiveThreshold(oilShutdown) : undefined;
  const oilScale =
    mergedScale(undefined, limits["oil_pressure"]) ??
    (oilWarningThreshold != null || oilShutdownThreshold != null ? {} : undefined);
  if (oilScale) {
    if (oilWarningThreshold != null) oilScale.warningLow = oilWarningThreshold;
    if (oilShutdownThreshold != null) oilScale.criticalLow = oilShutdownThreshold;
  }

  const coolantWarningThreshold = positiveThreshold(coolantWarning);
  const coolantScale =
    mergedScale(undefined, limits["coolant_temperature"]) ??
    (coolantWarningThreshold != null ? {} : undefined);
  if (coolantScale && coolantWarningThreshold != null) {
    coolantScale.warningHigh = coolantWarningThreshold;
  }

  const fuelDisplay: VisualScale | undefined =
    rawFuelUnit === "%"
      ? { displayMin: 0, displayMax: 100 }
      : fuelCapacity != null && fuelCapacity > 0
        ? { displayMin: 0, displayMax: fuelCapacity }
        : undefined;
  const warning = positiveThreshold(fuelWarning);
  const shutdown = positiveThreshold(fuelShutdown);
  const fuelScale =
    mergedScale(fuelDisplay, limits["fuel_level"]) ??
    (warning != null || shutdown != null ? {} : undefined);
  if (fuelScale && rawFuelUnit === "L") {
    if (warning != null) fuelScale.warningLow = warning;
    if (shutdown != null) fuelScale.criticalLow = shutdown;
  }

  const oilMeter = meterState(oil, oilScale);
  const coolantMeter = meterState(coolant, coolantScale);
  const fuelMeter = meterState(rawFuel, fuelScale);
  const alternatorMeter = meterState(
    alternator,
    mergedScale(undefined, limits["alternator_voltage"]),
  );
  const maintenanceMeter = meterState(maintenance, limits["maintenance_hours"]);
  const tones = {
    oil: oilMeter.tone,
    coolant: coolantMeter.tone,
    fuel: fuelOutOfRange ? ("warning" as const) : fuelMeter.tone,
    alternator: alternatorMeter.tone,
    maintenance: maintenanceMeter.tone,
    runHours: toneFromLimit(runHours, limits["run_hours"]),
  };

  return {
    rpm,
    oil,
    oilUnit,
    coolant,
    coolantUnit,
    fuel,
    fuelRate,
    fuelUnit,
    fuelRaw: rawFuel,
    fuelRawUnit: rawFuelUnit,
    fuelCapacity,
    fuelCapacitySource: gen.fuelCapacitySource ?? null,
    fuelPercent,
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
    engineLoad,
    currentL1,
    currentL2,
    currentL3,
    running,
    tones,
    percents: {
      oil: visibleMeterPercent(oilMeter.percent, tones.oil),
      coolant: visibleMeterPercent(coolantMeter.percent, tones.coolant),
      fuel: visibleMeterPercent(fuelPercent, tones.fuel),
      alternator: visibleMeterPercent(alternatorMeter.percent, tones.alternator),
      maintenance: visibleMeterPercent(maintenanceMeter.percent, tones.maintenance),
      runHours: percentFromLimit(runHours, limits["run_hours"]),
    },
  };
}
