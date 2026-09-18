function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number, cx = 170, cy = 158, radius = 126) {
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
  const nominalLabel =
    nominalKw != null && Number.isFinite(nominalKw)
      ? Math.round(nominalKw).toLocaleString("pt-BR")
      : "N/D";

  return (
    <section className="vref-section vref-power">
      <div className="vref-section-heading">
        <h4>GENERATOR POWER</h4>
      </div>
      <div className="vref-power-gauge">
        <svg viewBox="0 0 340 195" aria-label="Generator power gauge">
          <path className="vref-gauge-base" d={arcPath(0, 1)} />
          <path className="vref-gauge-zone vref-zone-green" d={arcPath(0, 0.75)} />
          <path className="vref-gauge-zone vref-zone-amber" d={arcPath(0.75, 0.9)} />
          <path className="vref-gauge-zone vref-zone-red" d={arcPath(0.9, 1)} />
          <text x="38" y="116" className="vref-gauge-scale">
            0
          </text>
          {known && (
            <text x="282" y="116" className="vref-gauge-scale" textAnchor="end">
              {nominalLabel}
            </text>
          )}
          {known && (
            <g
              className="vref-kw-needle"
              style={{
                transformOrigin: "170px 158px",
                transform: `rotate(${angle}deg)`,
              }}
            >
              <path className="vref-kw-needle-floating" d="M170 50 L176 126 A6 6 0 1 1 164 126 Z" />
            </g>
          )}
        </svg>
        <div className="vref-power-readout">
          <b>{powerKw == null ? "N/D" : Math.round(powerKw).toLocaleString("pt-BR") + " kW"}</b>
          {known && <span>{"NOMINAL " + nominalLabel + " kW"}</span>}
        </div>
      </div>
    </section>
  );
}
