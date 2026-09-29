export function isPositiveMeasurement(value: number | null | undefined) {
  return value != null && Number.isFinite(Number(value)) && Number(value) > 0;
}

export function hasPositiveMeasurement(values: Array<number | null | undefined>) {
  return values.some(isPositiveMeasurement);
}
