type Props = { value: number | null; max?: number };

export function RpmGauge({ value, max = 4000 }: Props) {
  const known = value != null && Number.isFinite(value);
  const safeValue = known ? Math.max(0, Math.min(value, max)) : 0;
  const pct = safeValue / Math.max(1, max);
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 98;
  const r = 72;
  const scaleMax = Math.max(1, Math.round(max / 1000));
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <svg viewBox="0 0 220 168" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path className="gauge-bg" pathLength="100" d={arc} />
      <path className="gauge-zone gauge-green" pathLength="100" strokeDasharray="70 30" d={arc} />
      <path
        className="gauge-zone gauge-yellow"
        pathLength="100"
        strokeDasharray="20 80"
        strokeDashoffset="-70"
        d={arc}
      />
      <path
        className="gauge-zone gauge-red"
        pathLength="100"
        strokeDasharray="10 90"
        strokeDashoffset="-90"
        d={arc}
      />

      <text x={cx - r} y={cy + 28} textAnchor="middle" className="rpm-scale-label">
        0
      </text>
      <text x={cx + r} y={cy + 28} textAnchor="middle" className="rpm-scale-label">
        {scaleMax}
      </text>

      <text x={cx} y={cy - 18} textAnchor="middle" className="rpm-unit">
        ×1000
      </text>

      {known ? (
        <g
          className="needle"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
          }}
        >
          <path
            className="rpm-needle-floating"
            d={`M${cx} ${cy - r + 12} L${cx + 5} ${cy - 14} L${cx - 5} ${cy - 14} Z`}
          />
        </g>
      ) : null}

      <circle cx={cx} cy={cy} r="6" className="rpm-gauge-hub" />

      <text x={cx} y={cy + 48} textAnchor="middle" className="rpm-percent">
        {known ? Math.round(safeValue) : "—"}
      </text>
    </svg>
  );
}
