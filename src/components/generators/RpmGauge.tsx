type Props = { value: number; max?: number };

function point(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

export function RpmGauge({ value, max = 4000 }: Props) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0;
  const pct = safeValue / Math.max(1, max);
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 106;

  return (
    <svg viewBox="0 0 220 158" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path
        className="gauge-bg"
        pathLength="100"
        strokeWidth="14"
        d={`M28 ${cy} A82 82 0 0 1 192 ${cy}`}
      />
      <path
        className="gauge-zone gauge-green"
        pathLength="100"
        strokeWidth="14"
        strokeDasharray="70 30"
        d={`M28 ${cy} A82 82 0 0 1 192 ${cy}`}
      />
      <path
        className="gauge-zone gauge-yellow"
        pathLength="100"
        strokeWidth="14"
        strokeDasharray="15 85"
        strokeDashoffset="-70"
        d={`M28 ${cy} A82 82 0 0 1 192 ${cy}`}
      />
      <path
        className="gauge-zone gauge-red"
        pathLength="100"
        strokeWidth="14"
        strokeDasharray="15 85"
        strokeDashoffset="-85"
        d={`M28 ${cy} A82 82 0 0 1 192 ${cy}`}
      />

      {Array.from({ length: 9 }, (_, index) => {
        const fraction = index / 8;
        const outer = point(cx, cy, 86, fraction);
        const inner = point(cx, cy, index === 4 ? 69 : 73, fraction);
        return (
          <line
            key={index}
            className="rpm-gauge-tick"
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
          />
        );
      })}

      <text x="19" y={cy + 16} className="rpm-scale-label">
        0
      </text>
      <text x="110" y="20" textAnchor="middle" className="rpm-scale-label">
        2000
      </text>
      <text x="201" y={cy + 16} textAnchor="end" className="rpm-scale-label">
        4000
      </text>

      <g
        className="needle"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: `rotate(${angle}deg)`,
        }}
      >
        <path className="rpm-needle-floating" d={`M110 35 L114.5 88 L105.5 88 Z`} />
      </g>

      <circle cx={cx} cy={cy} r="8" className="rpm-gauge-hub" />
      <circle cx={cx} cy={cy} r="3.5" className="rpm-gauge-hub-core" />

      <text x={cx} y={cy + 31} textAnchor="middle" className="rpm-percent">
        {Math.round(safeValue)}
      </text>
      <text x={cx} y={cy + 46} textAnchor="middle" className="rpm-unit">
        RPM
      </text>
    </svg>
  );
}
