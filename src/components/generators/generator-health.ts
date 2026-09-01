import type { Generator, MetricLimit } from "@/data/generators";

import { metricNumber } from "./generator-metrics";

export type MeterTone = "good" | "warning" | "critical" | "neutral";

export function progressPercent(value: number | null, maximum: number) {
  if (value == null || !Number.isFinite(value) || maximum <= 0) return null;
  return Math.min(100, Math.max(0, (value / maximum) * 100));
}

export function visibleMeterPercent(percent: number | null, tone: MeterTone) {
  if (percent == null) return null;
  if (percent === 0 && tone === "critical") return 4;
  return percent;
}

function toneFromLimit(value: number | null, limit?: MetricLimit): MeterTone {
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

function percentFromLimit(value: number | null, limit?: MetricLimit) {
  if (value == null || !limit || limit.displayMax == null || limit.displayMax <= 0) return null;
  const minimum = limit.displayMin ?? 0;
  const span = limit.displayMax - minimum;
  if (span <= 0) return null;
  return Math.min(100, Math.max(0, ((value - minimum) / span) * 100));
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
  const tones = {
    oil: toneFromLimit(oil, limits.oil_pressure),
    coolant: toneFromLimit(coolant, limits.coolant_temperature),
    fuel: toneFromLimit(fuel, limits.fuel_level),
    alternator: toneFromLimit(alternator, limits.alternator_voltage),
    maintenance: toneFromLimit(maintenance, limits.maintenance_hours),
    runHours: toneFromLimit(runHours, limits.run_hours),
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
      oil: visibleMeterPercent(percentFromLimit(oil, limits.oil_pressure), tones.oil),
      coolant: visibleMeterPercent(
        percentFromLimit(coolant, limits.coolant_temperature),
        tones.coolant,
      ),
      fuel: visibleMeterPercent(
        percentFromLimit(fuel, limits.fuel_level) ?? fuelPercent,
        tones.fuel,
      ),
      alternator: visibleMeterPercent(
        percentFromLimit(alternator, limits.alternator_voltage),
        tones.alternator,
      ),
      maintenance: visibleMeterPercent(
        percentFromLimit(maintenance, limits.maintenance_hours),
        tones.maintenance,
      ),
      runHours: percentFromLimit(runHours, limits.run_hours),
    },
  };
}
