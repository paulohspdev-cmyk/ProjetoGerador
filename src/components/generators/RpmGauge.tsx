type Props = { value: number | null; max: number | null };

const START_ANGLE = 150;
const SWEEP_ANGLE = 240;
const CX = 110;
const CY = 80;
const RADIUS = 57;

function point(angleDeg: number, radius: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

function arcPath(startAngle: number, endAngle: number, radius = RADIUS) {
  const a = point(startAngle, radius);
  const b = point(endAngle, radius);
  const sweep = endAngle - startAngle;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function RpmGauge({ value, max }: Props) {
  const known = value != null && Number.isFinite(value);
  const hasScale = max != null && Number.isFinite(max) && max > 0;
  const currentValue = known ? Number(value) : 0;
  const safeValue = hasScale ? Math.max(0, Math.min(currentValue, max)) : currentValue;
  const fraction = known && hasScale ? safeValue / max : 0;
  const currentAngle = START_ANGLE + fraction * SWEEP_ANGLE;
  const needle = point(currentAngle, 45);
  const startLabel = point(START_ANGLE, 75);
  const endLabel = point(START_ANGLE + SWEEP_ANGLE, 75);

  return (
    <svg viewBox="0 0 220 150" className="rpm-svg" aria-label="RPM">
      <path className="gauge-bg" d={arcPath(START_ANGLE, START_ANGLE + SWEEP_ANGLE)} />
      {known && hasScale && fraction > 0 && (
        <path className="gauge-active" d={arcPath(START_ANGLE, currentAngle)} />
      )}

      <text
        x={startLabel.x}
        y={startLabel.y}
        className="rpm-scale-label"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        0
      </text>
      <text
        x={endLabel.x}
        y={endLabel.y}
        className="rpm-scale-label"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {hasScale ? Math.round(max).toLocaleString("pt-BR") : "—"}
      </text>

      {known && hasScale && (
        <line className="rpm-needle-line" x1={CX} y1={CY} x2={needle.x} y2={needle.y} />
      )}
      <circle cx={CX} cy={CY} r="4.5" className="rpm-gauge-hub" />
      <text x={CX} y="126" textAnchor="middle" className="rpm-percent">
        {known ? Math.round(currentValue).toLocaleString("pt-BR") : "—"}
      </text>
    </svg>
  );
}
