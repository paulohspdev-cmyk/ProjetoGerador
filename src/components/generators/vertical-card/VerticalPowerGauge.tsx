function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number, cx = 170, cy = 140, radius = 118) {
  const a = polar(cx, cy, radius, start);
  const b = polar(cx, cy, radius, end);
  return "M " + a.x + " " + a.y + " A " + radius + " " + radius + " 0 0 1 " + b.x + " " + b.y;
}

export function VerticalPowerGauge({
  powerKw,
  nominalKw,
}: {
  powerKw: number | null;
  nominalKw: number | null;
}) {
  const known =
    powerKw != null &&
    Number.isFinite(powerKw) &&
    nominalKw != null &&
    Number.isFinite(nominalKw) &&
    nominalKw > 0;
  const fraction = known ? Math.min(1, Math.max(0, powerKw / nominalKw)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel =
    powerKw == null || !Number.isFinite(powerKw)
      ? "N/D"
      : Math.round(powerKw).toLocaleString("pt-BR") + " kW";
  const nominalLabel =
    nominalKw != null && Number.isFinite(nominalKw)
      ? Math.round(nominalKw).toLocaleString("pt-BR")
      : "";

  return (
    <section className="vref-section vref-power">
      <div className="vref-section-heading">
        <h4>GENERATOR POWER</h4>
      </div>
      <div className="vref-power-gauge">
        <svg viewBox="0 0 340 205" aria-label="Generator power gauge">
          <path className="vref-gauge-base" d={arcPath(0, 1)} />
          <path className="vref-gauge-zone vref-zone-green" d={arcPath(0, 0.75)} />
          <path className="vref-gauge-zone vref-zone-amber" d={arcPath(0.75, 0.9)} />
          <path className="vref-gauge-zone vref-zone-red" d={arcPath(0.9, 1)} />

          <text x="42" y="104" className="vref-gauge-scale">
            0
          </text>
          {known && (
            <text x="278" y="104" className="vref-gauge-scale" textAnchor="end">
              {nominalLabel}
            </text>
          )}

          <path
            d="M142 140 A28 28 0 0 1 198 140"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            opacity="0.45"
          />

          {known && (
            <g
              className="vref-kw-needle"
              style={{
                transformOrigin: "170px 140px",
                transform: `rotate(${angle}deg)`,
              }}
            >
              <path className="vref-kw-needle-floating" d="M170 58 L175 109 A5 5 0 1 1 165 109 Z" />
            </g>
          )}

          <g className="vref-kw-readout">
            <text x="170" y="171" textAnchor="middle" className="vref-kw-value">
              {valueLabel}
            </text>
            {known && (
              <text x="170" y="190" textAnchor="middle" className="vref-kw-nominal">
                {"NOMINAL " + nominalLabel + " kW"}
              </text>
            )}
          </g>
        </svg>
      </div>
    </section>
  );
}
