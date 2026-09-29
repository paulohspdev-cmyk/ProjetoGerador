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

export function reading(value: number | null, unit: string, digits: number) {
  if (value == null || !Number.isFinite(value)) return "";
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function joinReadings(parts: string[]) {
  const text = parts.filter(Boolean).join(" · ");
  return text || "N/D";
}

export function livePhases(pairs: [string, number | null][]) {
  return pairs
    .filter((pair): pair is [string, number] => pair[1] != null && pair[1] > 0)
    .map(([name, value]) => ({ name, value }));
}

export function captionOf(...parts: Array<string | false>) {
  return parts.filter((part): part is string => Boolean(part) && part !== "N/D").join(" · ");
}
