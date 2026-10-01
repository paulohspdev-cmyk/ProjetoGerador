type Props = { value: number | null; max?: number | null };

export function RpmGauge({ value, max = null }: Props) {
  const known = value != null && Number.isFinite(value);
  const safeValue = known ? Math.max(0, value) : 0;
  const configuredMax = max != null && Number.isFinite(max) && max > 0 ? max : null;
  const fallbackMax = known ? Math.max(3000, Math.ceil(Math.max(1, safeValue) / 500) * 500) : null;
  const effectiveMax = configuredMax ?? fallbackMax;
  const hasScale = effectiveMax != null && effectiveMax > 0;
  const pct = known && hasScale ? Math.min(1, safeValue / effectiveMax) : 0;
  const angle = pct * 180 - 90;
  const cx = 110;
  const cy = 98;
  const r = 72;
  const scaleMax = hasScale ? Math.max(1, Math.round(effectiveMax / 1000)) : null;
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <svg viewBox="0 0 220 168" className="rpm-svg" aria-label="RPM" overflow="visible">
      <path className="gauge-bg" pathLength="100" d={arc} />
      {hasScale ? (
        <>
          <path
            className="gauge-zone gauge-green"
            pathLength="100"
            strokeDasharray="70 30"
            d={arc}
          />
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
        </>
      ) : null}
      <text x={cx - r} y={cy + 28} textAnchor="middle" className="rpm-scale-label">
        0
      </text>
      <text x={cx + r} y={cy + 28} textAnchor="middle" className="rpm-scale-label">
        {scaleMax ?? "N/D"}
      </text>
      <text x={cx} y={cy - 18} textAnchor="middle" className="rpm-unit">
        ×1000
      </text>
      {known && hasScale ? (
        <g className="needle" transform={`rotate(${angle} ${cx} ${cy})`}>
          <line
            x1={cx}
            y1={cy - 6}
            x2={cx}
            y2={cy - r + 10}
            stroke="#fff"
            strokeWidth={3}
            strokeLinecap="round"
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
