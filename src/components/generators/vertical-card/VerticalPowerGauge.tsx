import { RpmGauge } from "../RpmGauge";

const SCALE_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number, cx = 110, cy = 112, radius = 72) {
  const a = polar(cx, cy, radius, start);
  const b = polar(cx, cy, radius, end);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
}

function scaleAnchor(fraction: number): "start" | "middle" | "end" {
  if (fraction === 0) return "start";
  if (fraction === 1) return "end";
  return "middle";
}

export function VerticalPowerGauge({
  powerKw,
  nominalKw,
  nominalSource,
  rpm,
}: {
  powerKw: number | null;
  nominalKw: number | null;
  nominalSource?: "telemetry" | "cadastral" | null;
  rpm: number | null;
}) {
  const hasPower = powerKw != null && Number.isFinite(powerKw);
  const hasNominal = nominalKw != null && Number.isFinite(nominalKw) && nominalKw > 0;
  const fraction = hasPower && hasNominal ? Math.min(1, Math.max(0, powerKw / nominalKw)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? `${Math.round(powerKw).toLocaleString("pt-BR")} kW` : "—";
  const nominalLabel = hasNominal ? `${Math.round(nominalKw).toLocaleString("pt-BR")} kW` : "—";
  const nominalSourceLabel =
    nominalSource === "telemetry"
      ? "CONTROLADORA"
      : nominalSource === "cadastral"
        ? "CADASTRO"
        : "";
  const scaleLabel = hasNominal
    ? `NOMINAL ${nominalLabel}${nominalSourceLabel ? ` · ${nominalSourceLabel}` : ""}`
    : "ESCALA N/D";

  return (
    <section
      className={`vref-section vref-power vref-dual-gauges ${hasNominal ? "has-nominal" : "has-no-nominal"}`}
      data-power-scale={hasNominal ? "known" : "unknown"}
    >
      <div className="vref-gauge-panel vref-gauge-panel-power">
        <h4>GERADOR</h4>
        <div className="vref-power-gauge">
          <svg
            viewBox="0 0 220 170"
            aria-label="Indicador de potência do gerador"
            overflow="visible"
          >
            <path className="vref-gauge-base" d={arcPath(0, 1)} />
            <path className="vref-gauge-range" d={arcPath(0, 1)} />

            {SCALE_TICKS.map((tick) => {
              const outer = polar(110, 112, 77, tick);
              const inner = polar(110, 112, tick === 0.5 ? 64 : 67, tick);
              const label = polar(110, 112, 97, tick);
              const scaleValue = hasNominal
                ? Math.round(nominalKw * tick).toLocaleString("pt-BR")
                : tick === 0
                  ? "0"
                  : "—";
              return (
                <g key={tick}>
                  <line
                    className="vref-gauge-tick"
                    x1={outer.x}
                    y1={outer.y}
                    x2={inner.x}
                    y2={inner.y}
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    className="vref-gauge-scale"
                    textAnchor={scaleAnchor(tick)}
                    dominantBaseline="middle"
                  >
                    {scaleValue}
                  </text>
                </g>
              );
            })}

            {hasPower && hasNominal && (
              <g
                className="vref-kw-needle"
                style={{
                  transformOrigin: "110px 112px",
                  transform: `rotate(${angle}deg)`,
                }}
              >
                <path className="vref-kw-needle-floating" d="M110 44 L114 98 L106 98 Z" />
              </g>
            )}

            <circle cx="110" cy="112" r="8" className="vref-gauge-hub" />
            <circle cx="110" cy="112" r="3.5" className="vref-gauge-hub-core" />

            <text x="110" y="140" textAnchor="middle" className="vref-kw-value">
              {valueLabel}
            </text>
            <text x="110" y="157" textAnchor="middle" className="vref-kw-nominal">
              {scaleLabel}
            </text>
          </svg>
        </div>
      </div>

      <div className="vref-gauge-panel vref-gauge-panel-rpm">
        <h4>RPM</h4>
        <div className="vref-rpm-gauge">
          <RpmGauge value={rpm} max={4000} />
        </div>
      </div>
    </section>
  );
}
