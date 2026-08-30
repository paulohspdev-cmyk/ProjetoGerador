import type { Generator } from "@/data/generators";

export function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "N/D";
}

export function displayGeneratorName(tag: string) {
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
}

export function hasMetric(gen: Generator, key: string) {
  return (gen.availableMetrics ?? []).includes(key);
}

export function metricNumber(
  gen: Generator,
  key: string,
  value: number | null | undefined,
) {
  return hasMetric(gen, key) && value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

export function formatMetric(
  value: number | null,
  unit = "",
  digits = 1,
) {
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
