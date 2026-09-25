import { RpmGauge } from "../RpmGauge";

const START_ANGLE = 150;
const SWEEP_ANGLE = 240;
const GAUGE_CX = 110;
const GAUGE_CY = 80;
const GAUGE_RADIUS = 57;

function polar(angleDeg: number, radius: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CX + radius * Math.cos(angle),
    y: GAUGE_CY + radius * Math.sin(angle),
  };
}

function arcPath(startAngle: number, endAngle: number, radius = GAUGE_RADIUS) {
  const a = polar(startAngle, radius);
  const b = polar(endAngle, radius);
  const sweep = endAngle - startAngle;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
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
  const currentAngle = START_ANGLE + fraction * SWEEP_ANGLE;
  const needle = polar(currentAngle, 45);
  const startLabel = polar(START_ANGLE, 75);
  const endLabel = polar(START_ANGLE + SWEEP_ANGLE, 75);
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
          <svg viewBox="0 0 220 150" aria-label="Indicador de potência do gerador">
            <path className="vref-gauge-base" d={arcPath(START_ANGLE, START_ANGLE + SWEEP_ANGLE)} />
            {hasPower && hasNominal && fraction > 0 && (
              <path className="vref-gauge-range" d={arcPath(START_ANGLE, currentAngle)} />
            )}

            <text
              x={startLabel.x}
              y={startLabel.y}
              className="vref-gauge-scale"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              0
            </text>
            <text
              x={endLabel.x}
              y={endLabel.y}
              className="vref-gauge-scale"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {hasNominal ? Math.round(nominalKw).toLocaleString("pt-BR") : "—"}
            </text>

            {hasPower && hasNominal && (
              <line
                className="vref-kw-needle-line"
                x1={GAUGE_CX}
                y1={GAUGE_CY}
                x2={needle.x}
                y2={needle.y}
              />
            )}
            <circle cx={GAUGE_CX} cy={GAUGE_CY} r="4.5" className="vref-gauge-hub" />
            <text x={GAUGE_CX} y="126" textAnchor="middle" className="vref-kw-value">
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
