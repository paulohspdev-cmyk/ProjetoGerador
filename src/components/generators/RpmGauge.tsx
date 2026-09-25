import { InstrumentGauge } from "./vertical-card/InstrumentGauge";

type Props = { value: number | null; max: number | null };

export function RpmGauge({ value, max }: Props) {
  return (
    <InstrumentGauge
      value={value}
      max={max}
      unit="RPM"
      ariaLabel="RPM"
      accent="green"
      showUnit={false}
    />
  );
}
