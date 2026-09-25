import { InstrumentGauge } from "./InstrumentGauge";

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
  const valueLabel = hasPower ? powerKw : "—";
  const gaugePower = valueLabel === "—" ? null : valueLabel;

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

  return (
    <section
      className={`vref-section vref-power vref-dual-gauges ${hasNominal ? "has-nominal" : "has-no-nominal"}`}
      data-power-scale={hasNominal ? "known" : "unknown"}
      data-nominal-source={nominalSource ?? "unknown"}
      data-nominal-source-label={nominalSourceLabel}
    >
      <div className="vref-gauge-panel vref-gauge-panel-power">
        <h4>GERADOR</h4>
        <div className="vref-power-gauge" aria-label="Indicador de potência do gerador">
          <InstrumentGauge
            value={gaugePower}
            max={hasNominal ? nominalKw : null}
            unit="kW"
            ariaLabel="Indicador de potência do gerador"
            accent="cyan"
          />
        </div>
      </div>

      <div className="vref-gauge-panel vref-gauge-panel-rpm">
        <h4>RPM</h4>
        <div className="vref-rpm-gauge">
          <InstrumentGauge
            value={rpm}
            max={rpmMax}
            unit="RPM"
            ariaLabel="Indicador de RPM"
            accent="green"
            showUnit={false}
          />
        </div>
      </div>
    </section>
  );
}
