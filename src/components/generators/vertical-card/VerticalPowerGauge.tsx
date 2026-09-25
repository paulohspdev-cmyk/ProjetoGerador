import { RpmGauge } from "../RpmGauge";

const SCALE_TICKS = [0, 1] as const;
const GAUGE_CX = 110;
const GAUGE_CY = 102;
const GAUGE_RADIUS = 72;

function polar(cx: number, cy: number, radius: number, fraction: number) {
  const angle = Math.PI - Math.PI * fraction;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function arcPath(start: number, end: number) {
  const a = polar(GAUGE_CX, GAUGE_CY, GAUGE_RADIUS, start);
  const b = polar(GAUGE_CX, GAUGE_CY, GAUGE_RADIUS, end);
  return `M ${a.x} ${a.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${b.x} ${b.y}`;
}

function scaleAnchor(fraction: number): "start" | "end" {
  return fraction === 0 ? "start" : "end";
}

export function VerticalPowerGauge({
  powerKw,
  nominalKw,
  nominalSource,
  rpm,
  rpmMax,
}: {
  powerKw: number | null;
  nominalKw: number | null;
  nominalSource?: "telemetry" | "cadastral" | null;
  rpm: number | null;
  rpmMax: number | null;
}) {
  const hasPower = powerKw != null && Number.isFinite(powerKw);
  const hasNominal =
    nominalSource === "telemetry" &&
    nominalKw != null &&
    Number.isFinite(nominalKw) &&
    nominalKw > 0;
  const nominalSourceLabel =
    nominalSource === "telemetry"
      ? "CONTROLADORA"
      : nominalSource === "cadastral"
        ? "CADASTRO"
        : "";
  const fraction = hasPower && hasNominal ? Math.min(1, Math.max(0, powerKw / nominalKw)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? `${Math.round(powerKw).toLocaleString("pt-BR")} kW` : "—";

  return (
    <section
      className={`vref-section vref-power vref-dual-gauges ${hasNominal ? "has-nominal" : "has-no-nominal"}`}
      data-power-scale={hasNominal ? "known" : "unknown"}
      data-nominal-source={nominalSource ?? "unknown"}
      data-nominal-source-label={nominalSourceLabel}
    >
      <div className="vref-gauge-panel vref-gauge-panel-power">
        <h4>GERADOR</h4>
        <div className="vref-power-gauge">
          <svg
            viewBox="0 0 220 148"
            aria-label="Indicador de potência do gerador"
            overflow="visible"
          >
            <path className="vref-gauge-base" d={arcPath(0, 1)} />
            <path className="vref-gauge-range" d={arcPath(0, 1)} />

            {SCALE_TICKS.map((tick) => {
              const outer = polar(GAUGE_CX, GAUGE_CY, 77, tick);
              const inner = polar(GAUGE_CX, GAUGE_CY, 67, tick);
              const label = polar(GAUGE_CX, GAUGE_CY, 97, tick);
              const scaleValue =
                tick === 0 ? "0" : hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") : "—";
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
                  transformOrigin: `${GAUGE_CX}px ${GAUGE_CY}px`,
                  transform: `rotate(${angle}deg)`,
                }}
              >
                <path className="vref-kw-needle-floating" d="M110 34 L114 88 L106 88 Z" />
              </g>
            )}

            <circle cx={GAUGE_CX} cy={GAUGE_CY} r="8" className="vref-gauge-hub" />
            <circle cx={GAUGE_CX} cy={GAUGE_CY} r="3.5" className="vref-gauge-hub-core" />

            <text x="110" y="136" textAnchor="middle" className="vref-kw-value">
              {valueLabel}
            </text>
          </svg>
        </div>
      </div>

      <div className="vref-gauge-panel vref-gauge-panel-rpm">
        <h4>RPM</h4>
        <div className="vref-rpm-gauge">
          <RpmGauge value={rpm} max={rpmMax} />
        </div>
      </div>
    </section>
  );
}
