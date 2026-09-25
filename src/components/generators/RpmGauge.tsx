type Props = { value: number | null; max: number | null };

const SCALE_TICKS = [0, 1] as const;

function point(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function scaleAnchor(fraction: number): "start" | "end" {
  return fraction === 0 ? "start" : "end";
}

export function RpmGauge({ value, max }: Props) {
  const known = value != null && Number.isFinite(value);
  const hasScale = max != null && Number.isFinite(max) && max > 0;
  const currentValue = known ? Number(value) : 0;
  const safeValue = hasScale ? Math.max(0, Math.min(currentValue, max)) : currentValue;
  const pct = known && hasScale ? safeValue / max : 0;
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 102;
  const radius = 72;
  const arc = `M${cx - radius} ${cy} A${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <svg viewBox="0 0 220 148" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path className="gauge-bg" pathLength="100" strokeWidth="12" d={arc} />
      <path
        className="gauge-zone gauge-green"
        pathLength="100"
        strokeWidth="12"
        strokeDasharray="70 30"
        d={arc}
      />
      <path
        className="gauge-zone gauge-yellow"
        pathLength="100"
        strokeWidth="12"
        strokeDasharray="15 85"
        strokeDashoffset="-70"
        d={arc}
      />
      <path
        className="gauge-zone gauge-red"
        pathLength="100"
        strokeWidth="12"
        strokeDasharray="15 85"
        strokeDashoffset="-85"
        d={arc}
      />

      {SCALE_TICKS.map((fraction) => {
        const outer = point(cx, cy, 77, fraction);
        const inner = point(cx, cy, 67, fraction);
        const label = point(cx, cy, 97, fraction);
        const scaleValue =
          fraction === 0 ? "0" : hasScale ? Math.round(max).toLocaleString("pt-BR") : "—";
        return (
          <g key={fraction}>
            <line className="rpm-gauge-tick" x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />
            <text
              x={label.x}
              y={label.y}
              className="rpm-scale-label"
              textAnchor={scaleAnchor(fraction)}
              dominantBaseline="middle"
            >
              {scaleValue}
            </text>
          </g>
        );
      })}

      {known && hasScale && (
        <g
          className="needle"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
          }}
        >
          <path className="rpm-needle-floating" d="M110 34 L114 88 L106 88 Z" />
        </g>
      )}

      <circle cx={cx} cy={cy} r="8" className="rpm-gauge-hub" />
      <circle cx={cx} cy={cy} r="3.5" className="rpm-gauge-hub-core" />

      <text x={cx} y="136" textAnchor="middle" className="rpm-percent">
        {known ? Math.round(currentValue).toLocaleString("pt-BR") : "—"}
      </text>
    </svg>
  );
}
