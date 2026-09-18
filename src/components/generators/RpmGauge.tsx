type Props = { value: number; max?: number };

export function RpmGauge({ value, max = 4000 }: Props) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0;
  const pct = safeValue / Math.max(1, max);
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 108;

  return (
    <svg viewBox="0 0 220 158" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path
        className="gauge-bg"
        pathLength="100"
        strokeWidth="15"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-green"
        pathLength="100"
        strokeWidth="15"
        strokeDasharray="70 30"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-yellow"
        pathLength="100"
        strokeWidth="15"
        strokeDasharray="15 85"
        strokeDashoffset="-70"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-red"
        pathLength="100"
        strokeWidth="15"
        strokeDasharray="15 85"
        strokeDashoffset="-85"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />

      <text x="16" y={cy + 16} className="rpm-scale-label">
        0
      </text>
      <text x="110" y="18" textAnchor="middle" className="rpm-scale-label">
        2000
      </text>
      <text x="204" y={cy + 16} textAnchor="end" className="rpm-scale-label">
        4000
      </text>

      <path
        d={`M88 ${cy} A22 22 0 0 1 132 ${cy}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.38"
      />

      <g
        className="needle"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: `rotate(${angle}deg)`,
        }}
      >
        <path
          className="rpm-needle-floating"
          d={`M ${cx} ${cy - 69} L ${cx + 5} ${cy - 27} A 5 5 0 1 1 ${cx - 5} ${cy - 27} Z`}
        />
      </g>

      <text x={cx} y={cy + 31} textAnchor="middle" className="rpm-percent">
        {Math.round(safeValue)}
      </text>
      <text x={cx} y={cy + 48} textAnchor="middle" className="rpm-unit">
        RPM
      </text>
    </svg>
  );
}
