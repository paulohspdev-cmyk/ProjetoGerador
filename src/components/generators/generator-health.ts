import type { Generator } from "@/data/generators";

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

export function oilTone(value: number | null): MeterTone {
  if (value == null) return "neutral";
  if (value < 2 || value > 9) return "critical";
  if (value < 3.5 || value > 8) return "warning";
  return "good";
}

export function coolantTone(value: number | null): MeterTone {
  if (value == null) return "neutral";
  if (value > 105) return "critical";
  if (value > 95 || value < 30) return "warning";
  return "good";
}

export function fuelTone(percent: number | null): MeterTone {
  if (percent == null) return "neutral";
  if (percent <= 20) return "critical";
  if (percent <= 50) return "warning";
  return "good";
}

export function alternatorTone(value: number | null, running: boolean): MeterTone {
  if (value == null || !running) return "neutral";
  if (value < 24 || value > 32) return "critical";
  if (value < 26 || value > 30) return "warning";
  return "good";
}

export function maintenanceTone(value: number | null): MeterTone {
  if (value == null) return "neutral";
  if (value <= 50) return "critical";
  if (value <= 150) return "warning";
  return "good";
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

  const fuelUnit = gen.metricUnits?.["fuel_level"] || "%";
  const fuelCapacity =
    metricNumber(gen, "fuel_capacity_l", undefined) ?? metricNumber(gen, "fuel_capacity", undefined);
  const fuelMaximum =
    fuelUnit === "%" ? 100 : fuelCapacity != null && fuelCapacity > 0 ? fuelCapacity : 1000;
  const fuelPercent = progressPercent(fuel, fuelMaximum);
  const alternatorMaximum = battery != null && battery > 20 ? 32 : 16;

  const tones = {
    oil: oilTone(oil),
    coolant: coolantTone(coolant),
    fuel: fuelTone(fuelPercent),
    alternator: alternatorTone(alternator, running),
    maintenance: maintenanceTone(maintenance),
    runHours: "neutral" as MeterTone,
  };

  return {
    rpm,
    oil,
    coolant,
    fuel,
    fuelUnit,
    fuelPercent,
    battery,
    alternator,
    maintenance,
    runHours,
    frequency,
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
      oil: visibleMeterPercent(progressPercent(oil, 10), tones.oil),
      coolant: visibleMeterPercent(progressPercent(coolant, 120), tones.coolant),
      fuel: visibleMeterPercent(fuelPercent, tones.fuel),
      alternator: visibleMeterPercent(
        progressPercent(alternator, alternatorMaximum),
        tones.alternator,
      ),
      maintenance: visibleMeterPercent(progressPercent(maintenance, 1000), tones.maintenance),
      runHours: progressPercent(runHours, 10000),
    },
  };
}
