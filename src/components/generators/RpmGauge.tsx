type Props = { value: number | null; max?: number };

const SCALE_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

function point(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function scaleAnchor(fraction: number): "start" | "middle" | "end" {
  if (fraction === 0) return "start";
  if (fraction === 1) return "end";
  return "middle";
}

export function RpmGauge({ value, max = 4000 }: Props) {
  const known = value != null && Number.isFinite(value);
  const safeValue = known ? Math.max(0, Math.min(value, max)) : 0;
  const pct = safeValue / Math.max(1, max);
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 112;
  const radius = 72;
  const arc = `M${cx - radius} ${cy} A${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <svg viewBox="0 0 220 170" className="rpm-svg" aria-label="RPM" overflow="visible">
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
        const inner = point(cx, cy, fraction === 0.5 ? 64 : 67, fraction);
        const label = point(cx, cy, 97, fraction);
        const scaleValue = Math.round(max * fraction).toLocaleString("pt-BR");
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

      {known && (
        <g
          className="needle"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
          }}
        >
          <path className="rpm-needle-floating" d="M110 44 L114 98 L106 98 Z" />
        </g>
      )}

      <circle cx={cx} cy={cy} r="8" className="rpm-gauge-hub" />
      <circle cx={cx} cy={cy} r="3.5" className="rpm-gauge-hub-core" />

      <text x={cx} y="140" textAnchor="middle" className="rpm-percent">
        {known ? Math.round(safeValue).toLocaleString("pt-BR") : "—"}
      </text>
      <text x={cx} y="157" textAnchor="middle" className="rpm-unit">
        RPM
      </text>
    </svg>
  );
}
