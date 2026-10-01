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
  const safePower = hasPower ? Math.max(0, powerKw) : 0;
  const fallbackMax = hasPower
    ? safePower <= 50
      ? 50
      : safePower <= 100
        ? 100
        : safePower <= 250
          ? 250
          : safePower <= 500
            ? 500
            : safePower <= 1000
              ? 1000
              : Math.ceil(safePower / 500) * 500
    : null;
  const effectiveMax = hasNominal ? nominalKw : fallbackMax;
  const fraction =
    hasPower && effectiveMax != null ? Math.min(1, Math.max(0, safePower / effectiveMax)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? Math.round(powerKw).toLocaleString("pt-BR") : "—";
  const cx = 70;
  const cy = 62;
  const r = 48;
  const maxLabel = effectiveMax != null ? Math.round(effectiveMax).toLocaleString("pt-BR") : "N/D";
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
          viewBox="0 0 140 108"
          className="kw-svg"
          aria-label="Indicador de potência do gerador"
          overflow="visible"
        >
          <path className="vref-gauge-base" pathLength="100" d={arc} />
          {effectiveMax != null ? (
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
          <text x={cx - r} y={cy + 22} textAnchor="middle" className="vref-gauge-scale">
            0
          </text>
          <text x={cx + r} y={cy + 22} textAnchor="middle" className="vref-gauge-scale">
            {maxLabel}
          </text>
          {hasPower && effectiveMax != null ? (
            <g className="vref-kw-needle" transform={`rotate(${angle} ${cx} ${cy})`}>
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
          <circle cx={cx} cy={cy} r="5" className="vref-gauge-hub" />
          <text x={cx} y={cy - 14} textAnchor="middle" className="vref-kw-unit">
            KW
          </text>
          <text x={cx} y={cy + 36} textAnchor="middle" className="vref-kw-value">
            {valueLabel}
          </text>
        </svg>
      </div>
    </section>
  );
}
