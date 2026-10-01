export function VerticalPowerGauge({
  powerKw,
  nominalKw,
  nominalSource,
}: {
  powerKw: number | null;
  nominalKw: number | null;
  nominalSource?: "telemetry" | "cadastral" | null;
}) {
  const hasPower = powerKw != null && Number.isFinite(powerKw);
  const hasNominal = nominalKw != null && Number.isFinite(nominalKw) && nominalKw > 0;
  const fraction = hasPower && hasNominal ? Math.min(1, Math.max(0, powerKw / nominalKw)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? Math.round(powerKw).toLocaleString("pt-BR") : "—";
  const cx = 110;
  const cy = 98;
  const r = 72;
  const maxLabel = hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") : "N/D";
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const nominalSourceAuditLabel =
    nominalSource === "telemetry"
      ? "CONTROLADORA"
      : nominalSource === "cadastral"
        ? "CADASTRO"
        : "N/D";

  return (
    <section
      className="vref-section vref-power"
      data-nominal-source={nominalSource ?? "unknown"}
      data-nominal-source-label={nominalSourceAuditLabel}
    >
      <div className="vref-section-heading">
        <h4>KW</h4>
      </div>
      <div className="vref-power-gauge" aria-label="Indicador de potência do gerador">
        <svg
          viewBox="0 0 220 168"
          className="kw-svg"
          aria-label="Indicador de potência do gerador"
          overflow="visible"
        >
          <path className="vref-gauge-base" pathLength="100" d={arc} />
          {hasNominal ? (
            <>
              <path
                className="vref-kw-zone vref-kw-zone-green"
                pathLength="100"
                strokeDasharray="70 30"
                d={arc}
              />
              <path
                className="vref-kw-zone vref-kw-zone-yellow"
                pathLength="100"
                strokeDasharray="20 80"
                strokeDashoffset="-70"
                d={arc}
              />
              <path
                className="vref-kw-zone vref-kw-zone-red"
                pathLength="100"
                strokeDasharray="10 90"
                strokeDashoffset="-90"
                d={arc}
              />
            </>
          ) : null}
          <text x={cx - r} y={cy + 28} textAnchor="middle" className="vref-gauge-scale">
            0
          </text>
          <text x={cx + r} y={cy + 28} textAnchor="middle" className="vref-gauge-scale">
            {maxLabel}
          </text>
          {hasPower && hasNominal ? (
            <g
              className="vref-kw-needle"
              style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${angle}deg)` }}
            >
              <path
                className="vref-kw-needle-floating"
                d={`M${cx} ${cy - r + 12} L${cx + 5} ${cy - 14} L${cx - 5} ${cy - 14} Z`}
              />
            </g>
          ) : null}
          <circle cx={cx} cy={cy} r="6" className="vref-gauge-hub" />
          <text x={cx} y={cy - 18} textAnchor="middle" className="vref-kw-unit">
            KW
          </text>
          <text x={cx} y={cy + 48} textAnchor="middle" className="vref-kw-value">
            {valueLabel}
          </text>
        </svg>
      </div>
    </section>
  );
}
