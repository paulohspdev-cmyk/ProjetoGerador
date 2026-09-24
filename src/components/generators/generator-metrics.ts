import type { Generator } from "@/data/generators";

export function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "N/D";
}

export function displayGeneratorName(generator: Generator | string) {
  const name = typeof generator === "string" ? "" : generator.name?.trim();
  if (name) return name;
  const tag = typeof generator === "string" ? generator : generator.tag;
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
}

export function hasMetric(gen: Generator, key: string) {
  if (gen.telemetryStale) return false;
  const defined = gen.definedMetrics ?? gen.availableMetrics;
  if (defined) return defined.includes(key);
  return Object.prototype.hasOwnProperty.call(gen.metrics ?? {}, key);
}

export function hasFreshMetric(gen: Generator, key: string) {
  return !gen.telemetryStale && (gen.definedMetrics ?? gen.availableMetrics ?? []).includes(key);
}

export function metricNumber(gen: Generator, key: string, value: number | null | undefined) {
  if (gen.telemetryStale) return null;

  const defined = gen.definedMetrics ?? gen.availableMetrics;
  if (defined && !defined.includes(key)) return null;

  if (gen.metrics) {
    const metric = gen.metrics[key];
    return metric != null && Number.isFinite(Number(metric)) ? Number(metric) : null;
  }

  return hasMetric(gen, key) && value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

export function nominalPowerNumber(gen: Generator) {
  const live =
    metricNumber(gen, "nominal_power_kw", undefined) ??
    metricNumber(gen, "nominal_power", undefined);
  if (live != null && Number.isFinite(live) && live > 0) return live;

  const effective = gen.nominalPower;
  return effective != null && Number.isFinite(Number(effective)) && Number(effective) > 0
    ? Number(effective)
    : null;
}

export function formatMetric(value: number | null, unit = "", digits = 1) {
  if (value == null) return "N/D";
  const text = fmt(value, digits);
  return unit ? `${text} ${unit}` : text;
}

export function formatGeneratorMetric(
  gen: Generator,
  key: string,
  value: number | null | undefined,
  unit: string,
  digits = 1,
) {
  return formatMetric(metricNumber(gen, key, value), unit, digits);
}
