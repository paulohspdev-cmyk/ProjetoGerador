type Props = { value: number; max?: number };

export function RpmGauge({ value, max = 4000 }: Props) {
  const pct = Math.min(Math.max(value, 0), max) / Math.max(1, max);
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 114;

  return (
    <svg viewBox="0 2 220 172" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path
        className="gauge-bg"
        pathLength="100"
        strokeWidth="16"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-green"
        pathLength="100"
        strokeWidth="16"
        strokeDasharray="70 30"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-yellow"
        pathLength="100"
        strokeWidth="16"
        strokeDasharray="15 85"
        strokeDashoffset="-70"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <path
        className="gauge-zone gauge-red"
        pathLength="100"
        strokeWidth="16"
        strokeDasharray="15 85"
        strokeDashoffset="-85"
        d={`M25 ${cy} A85 85 0 0 1 195 ${cy}`}
      />
      <text x="15" y={cy + 18} className="rpm-scale-label">
        0
      </text>
      <text x="38" y="44" textAnchor="middle" className="rpm-scale-label">
        1000
      </text>
      <text x="110" y="18" textAnchor="middle" className="rpm-scale-label">
        2000
      </text>
      <text x="182" y="44" textAnchor="middle" className="rpm-scale-label">
        3000
      </text>
      <text x="205" y={cy + 18} textAnchor="end" className="rpm-scale-label">
        4000
      </text>
      <g className="gauge-inner-ticks" stroke="#000" strokeWidth="1.5" strokeLinecap="round">
        {Array.from({ length: 11 }, (_, i) => (
          <line
            key={i}
            x1="33"
            y1={cy}
            x2="17"
            y2={cy}
            transform={`rotate(${i * 18}, ${cx}, ${cy})`}
            strokeWidth={i === 5 ? 3 : 1.5}
          />
        ))}
      </g>
      <path
        d={`M84 ${cy} A26 26 0 0 1 136 ${cy}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        opacity="0.5"
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
          d={`M ${cx} ${cy - 74} L ${cx + 5} ${cy - 31} A 5 5 0 1 1 ${cx - 5} ${cy - 31} Z`}
        />
      </g>
      <g className="rpm-readout">
        <text x={cx} y={cy + 22} textAnchor="middle" className="rpm-unit">
          RPM
        </text>
        <text x={cx} y={cy + 52} textAnchor="middle" className="rpm-percent">
          {Math.round(value)}
        </text>
      </g>
    </svg>
  );
}
