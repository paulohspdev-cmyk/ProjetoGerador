function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number, cx = 160, cy = 112, radius = 106) {
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
  const valueLabel = hasPower ? Math.round(powerKw).toLocaleString("pt-BR") + " kW" : "—";
  const nominalLabel = hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") + " kW" : "—";

  return (
    <section className="vref-section vref-power">
      <div className="vref-section-heading">
        <h4>GENERATOR POWER</h4>
      </div>
      <div className="vref-power-gauge">
        <svg viewBox="0 0 320 170" aria-label="Generator power gauge">
          <path className="vref-gauge-base" d={arcPath(0, 1)} />
          <path className="vref-gauge-zone vref-zone-green" d={arcPath(0, 0.75)} />
          <path className="vref-gauge-zone vref-zone-amber" d={arcPath(0.75, 0.9)} />
          <path className="vref-gauge-zone vref-zone-red" d={arcPath(0.9, 1)} />

          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const outer = polar(160, 112, 110, tick);
            const inner = polar(160, 112, tick === 0.5 ? 92 : 96, tick);
            return (
              <line
                key={tick}
                className="vref-gauge-tick"
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
              />
            );
          })}

          <text x="43" y="101" className="vref-gauge-scale">
            0
          </text>
          <text x="277" y="101" className="vref-gauge-scale" textAnchor="end">
            {hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") : "—"}
          </text>

          {hasPower && hasNominal && (
            <g
              className="vref-kw-needle"
              style={{
                transformOrigin: "160px 112px",
                transform: `rotate(${angle}deg)`,
              }}
            >
              <path className="vref-kw-needle-floating" d="M160 31 L164.5 92 L155.5 92 Z" />
            </g>
          )}

          <circle cx="160" cy="112" r="9" className="vref-gauge-hub" />
          <circle cx="160" cy="112" r="4" className="vref-gauge-hub-core" />

          <text x="160" y="143" textAnchor="middle" className="vref-kw-value">
            {valueLabel}
          </text>
          <text x="160" y="160" textAnchor="middle" className="vref-kw-nominal">
            NOMINAL {nominalLabel}
          </text>
        </svg>
      </div>
    </section>
  );
}
