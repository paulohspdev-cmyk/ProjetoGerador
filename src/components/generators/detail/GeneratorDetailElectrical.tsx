import type { Generator } from "@/data/generators";

import { formatMetric } from "../generator-metrics";
import type { GeneratorDetailModel } from "./generator-detail-model";
import { MetricCell, Readout } from "./GeneratorDetailPrimitives";

export function GeneratorDetailElectrical({
  gen,
  model,
}: {
  gen: Generator;
  model: GeneratorDetailModel;
}) {
  const {
    genL1,
    genL2,
    genL3,
    genL12,
    frequency,
    load,
    gcbKnown,
    rpm,
    batt,
    runHours,
    maintenance,
  } = model;

  return (
    <div className="gen-data">
      <section className="gen-card gen-elec">
        <header className="gen-card-head">
          <h2>Elétrica do gerador</h2>
          <span className="num text-[11px] font-bold">{formatMetric(frequency, "Hz", 2)}</span>
        </header>
        <div className="gen-metrics gen-metrics-3">
          <MetricCell label="L1-N" value={formatMetric(genL1, "V", 0)} />
          <MetricCell label="L2-N" value={formatMetric(genL2, "V", 0)} />
          <MetricCell label="L3-N" value={formatMetric(genL3, "V", 0)} />
          <MetricCell label="L1-L2" value={formatMetric(genL12, "V", 0)} />
          <MetricCell label="Frequência" value={formatMetric(frequency, "Hz", 2)} />
          <MetricCell label="Potência" value={formatMetric(load, "kW", 0)} />
          <MetricCell label="GCB" value={gcbKnown ? (gen.gcb ? "FECHADO" : "ABERTO") : "N/D"} />
          <MetricCell label="RPM" value={formatMetric(rpm, "rpm", 0)} />
          <MetricCell
            label="Fonte"
            value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"}
          />
        </div>
      </section>

      <div className="gen-dials" aria-label="Instrumentos reais">
        <Readout label="RPM" value={rpm} unit="RPM" />
        <Readout label="Frequência" value={frequency} unit="Hz" />
        <Readout label="Tensão L1-L2" value={genL12} unit="V" />
        <Readout label="Tensão L1-N" value={genL1} unit="V" />
        <Readout label="Tensão L2-N" value={genL2} unit="V" />
        <Readout label="Tensão L3-N" value={genL3} unit="V" />
        <Readout label="Potência" value={load} unit="kW" />
        <Readout label="Bateria" value={batt} unit="V" />
        <Readout label="Horímetro" value={runHours} unit="h" />
      </div>

      <section className="maint-bar">
        <header>
          <h3>Horas para manutenção</h3>
          <strong className="num">{formatMetric(maintenance, "h", 0)}</strong>
        </header>
        <div className="maint-track is-unscaled" aria-label="Sem escala percentual homologada" />
        <p>
          {maintenance == null
            ? "Canal não homologado neste Controller Pack"
            : "Valor real recebido do Rapid SCADA; sem escala percentual presumida"}
        </p>
      </section>
    </div>
  );
}
