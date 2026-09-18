function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number, cx = 160, cy = 116, radius = 112) {
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
  const hasPower = powerKw != null && Number.isFinite(powerKw);
  const hasNominal = nominalKw != null && Number.isFinite(nominalKw) && nominalKw > 0;
  const fraction = hasPower && hasNominal ? Math.min(1, Math.max(0, powerKw / nominalKw)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? Math.round(powerKw).toLocaleString("pt-BR") : "—";
  const nominalLabel = hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") : "—";

  return (
    <section className="vref-section vref-power">
      <div className="vref-section-heading">
        <h4>GENERATOR POWER</h4>
      </div>
      <div className="vref-power-gauge">
        <svg viewBox="0 0 320 165" aria-label="Generator power gauge">
          <path className="vref-gauge-base" d={arcPath(0, 1)} />
          <path className="vref-gauge-zone vref-zone-green" d={arcPath(0, 0.75)} />
          <path className="vref-gauge-zone vref-zone-amber" d={arcPath(0.75, 0.9)} />
          <path className="vref-gauge-zone vref-zone-red" d={arcPath(0.9, 1)} />

          <text x="35" y="101" className="vref-gauge-scale">
            0
          </text>
          <text x="285" y="101" className="vref-gauge-scale" textAnchor="end">
            {nominalLabel}
          </text>

          <path
            d="M137 116 A23 23 0 0 1 183 116"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            opacity="0.38"
          />

          {hasPower && hasNominal && (
            <g
              className="vref-kw-needle"
              style={{
                transformOrigin: "160px 116px",
                transform: `rotate(${angle}deg)`,
              }}
            >
              <path className="vref-kw-needle-floating" d="M160 35 L165 88 A5 5 0 1 1 155 88 Z" />
            </g>
          )}

          <text x="160" y="142" textAnchor="middle" className="vref-kw-value">
            {valueLabel} kW
          </text>
          <text x="160" y="158" textAnchor="middle" className="vref-kw-nominal">
            NOMINAL {nominalLabel} kW
          </text>
        </svg>
      </div>
    </section>
  );
}
