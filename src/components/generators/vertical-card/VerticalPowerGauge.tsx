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
  const needle = polar(170, 158, 108, fraction);
  const pct = known ? Math.round(fraction * 100) : null;

  return (
    <section className="vref-section vref-power">
      <div className="vref-section-heading">
        <h4>GENERATOR POWER</h4>
        <span>50%</span>
      </div>
      <div className="vref-power-gauge">
        <svg viewBox="0 0 340 195" aria-label="Generator power gauge">
          <path className="vref-gauge-base" d={arcPath(0, 1)} />
          <path className="vref-gauge-zone vref-zone-green" d={arcPath(0, 0.75)} />
          <path className="vref-gauge-zone vref-zone-amber" d={arcPath(0.75, 0.9)} />
          <path className="vref-gauge-zone vref-zone-red" d={arcPath(0.9, 1)} />
          <text x="35" y="112" className="vref-gauge-scale">
            0%
          </text>
          <text x="285" y="112" className="vref-gauge-scale" textAnchor="end">
            100%
          </text>
          <line
            x1="170"
            y1="158"
            x2={needle.x}
            y2={needle.y}
            className={known ? "vref-gauge-needle" : "vref-gauge-needle is-unknown"}
          />
          <circle cx="170" cy="158" r="6" className="vref-gauge-hub" />
        </svg>
        <div className="vref-power-readout">
          <strong>{pct == null ? "N/D" : pct + "%"}</strong>
          <b>{powerKw == null ? "N/D" : Math.round(powerKw).toLocaleString("pt-BR") + " kW"}</b>
          <span>
            {nominalKw == null
              ? "potência nominal N/D"
              : "of " + Math.round(nominalKw).toLocaleString("pt-BR") + " kW"}
          </span>
        </div>
      </div>
    </section>
  );
}
