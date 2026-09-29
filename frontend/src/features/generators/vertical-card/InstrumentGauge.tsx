type GaugeAccent = "cyan" | "green";

type Props = {
  value: number | null;
  max: number | null;
  unit: string;
  ariaLabel: string;
  accent: GaugeAccent;
  decimals?: number;
  showUnit?: boolean;
};

const START_ANGLE = 135;
const SWEEP_ANGLE = 270;
const CX = 110;
const CY = 79;
const FACE_RADIUS = 68;
const ARC_RADIUS = 55;

function point(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

function arcPath(startAngle: number, endAngle: number, radius = ARC_RADIUS) {
  const a = point(startAngle, radius);
  const b = point(endAngle, radius);
  const sweep = endAngle - startAngle;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function niceStep(raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function buildLabels(max: number | null) {
  if (max == null || !Number.isFinite(max) || max <= 0)
    return [
      { value: 0, fraction: 0 },
      { value: null, fraction: 1 },
    ];
  const step = niceStep(max / 5);
  const values: number[] = [0];
  for (let next = step; next < max; next += step) values.push(next);
  if (values.at(-1) !== max) values.push(max);
  return values.map((value) => ({ value, fraction: value / max }));
}

function formatScale(value: number | null) {
  if (value == null) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return value.toLocaleString("pt-BR", { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 });
}

export function InstrumentGauge({
  value,
  max,
  unit,
  ariaLabel,
  accent,
  decimals = 0,
  showUnit = true,
}: Props) {
  const known = value != null && Number.isFinite(value);
  const hasScale = max != null && Number.isFinite(max) && max > 0;
  const currentValue = known ? Number(value) : 0;
  const clamped = hasScale ? Math.min(max, Math.max(0, currentValue)) : 0;
  const fraction = known && hasScale ? clamped / max : 0;
  const needleAngle = START_ANGLE + fraction * SWEEP_ANGLE;
  const needleTip = point(needleAngle, 43);
  const labels = buildLabels(max);

  const minorTicks = Array.from({ length: 21 }, (_, index) => {
    const fraction = index / 20;
    const angle = START_ANGLE + fraction * SWEEP_ANGLE;
    const major = index % 4 === 0 || index === 20;
    return {
      index,
      outer: point(angle, 63),
      inner: point(angle, major ? 53 : 57),
      major,
    };
  });

  const valueText = known
    ? currentValue.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "—";

  return (
    <svg
      viewBox="0 0 220 154"
      className="vref-instrument-gauge"
      data-accent={accent}
      aria-label={ariaLabel}
    >
      <circle cx={CX} cy={CY} r={FACE_RADIUS} className="vref-dial-face" />
      <path className="vref-dial-track" d={arcPath(START_ANGLE, START_ANGLE + SWEEP_ANGLE)} />
      {known && hasScale && fraction > 0 && (
        <path className="vref-dial-active" d={arcPath(START_ANGLE, needleAngle)} />
      )}

      {minorTicks.map((tick) => (
        <line
          key={tick.index}
          className={tick.major ? "vref-dial-tick is-major" : "vref-dial-tick"}
          x1={tick.outer.x}
          y1={tick.outer.y}
          x2={tick.inner.x}
          y2={tick.inner.y}
        />
      ))}

      {labels.map((label, index) => {
        const angle = START_ANGLE + label.fraction * SWEEP_ANGLE;
        const at = point(angle, 76);
        return (
          <text
            key={`${label.value ?? "unknown"}-${index}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="vref-dial-scale-label"
          >
            {formatScale(label.value)}
          </text>
        );
      })}

      {known && hasScale && (
        <g className="vref-dial-needle">
          <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} />
          <circle cx={CX} cy={CY} r="7" />
          <circle cx={CX} cy={CY} r="2.5" className="vref-dial-needle-core" />
        </g>
      )}

      {!known && <circle cx={CX} cy={CY} r="6" className="vref-dial-idle-hub" />}

      <text x={CX} y="116" textAnchor="middle" className="vref-dial-value">
        {valueText}
      </text>
      {showUnit && (
        <text x={CX} y="133" textAnchor="middle" className="vref-dial-unit">
          {unit}
        </text>
      )}
    </svg>
  );
}
