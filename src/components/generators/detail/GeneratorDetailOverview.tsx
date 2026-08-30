import { AlertTriangle } from "lucide-react";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

import { StatusPill } from "../StatusPill";
import { fmt, formatMetric } from "../generator-metrics";
import {
  IconBattery,
  IconClock,
  IconFuelPump,
  IconOilCan,
  IconRunHours,
  IconThermometer,
} from "../scada-icons";
import type { GeneratorDetailModel } from "./generator-detail-model";
import { BoolFlag, FlowChip, MetricCell } from "./GeneratorDetailPrimitives";

export function GeneratorDetailOverview({
  gen,
  model,
}: {
  gen: Generator;
  model: GeneratorDetailModel;
}) {
  const {
    fuel,
    temp,
    oil,
    batt,
    maintenance,
    runHours,
    alarms,
    comm,
    running,
    mcbKnown,
    gcbKnown,
    modeKnown,
    mainsL1,
    mainsL2,
    mainsL3,
    mainsL12,
    mainsKnown,
    rpm,
    alt,
    modeLabel,
    ready,
  } = model;

  return (
    <>
      <aside className="flow-icons">
        <FlowChip
          icon={<IconFuelPump size={34} />}
          label="Combustível"
          value={formatMetric(fuel, "%", 0)}
        />
        <FlowChip
          icon={<IconThermometer size={34} />}
          label="Temperatura"
          value={formatMetric(temp, "°C", 0)}
        />
        <FlowChip
          icon={<IconOilCan size={34} />}
          label="Óleo"
          value={formatMetric(oil, "bar", 1)}
        />
        <FlowChip
          icon={<IconBattery size={34} />}
          label="Bateria"
          value={formatMetric(batt, "V", 1)}
        />
        <FlowChip
          icon={<IconClock size={34} />}
          label="Manutenção"
          value={formatMetric(maintenance, "h", 0)}
        />
        <FlowChip
          icon={<IconRunHours size={34} />}
          label="Horímetro"
          value={formatMetric(runHours, "h", 1)}
        />
      </aside>

      <div className="gen-mid">
        <section className="gen-card">
          <header className="gen-card-head">
            <h2>Alarmes / Estado</h2>
            <span className="gen-badge">{alarms == null ? "—" : fmt(alarms, 0)}</span>
          </header>
          <div className="gen-alarm-compact">
            <b className={alarms != null && alarms > 0 ? "text-offline" : "text-online"}>
              <AlertTriangle className="size-4" />
            </b>
            <p
              className={cn(
                "text-[11px] font-bold",
                alarms != null && alarms > 0 ? "text-offline" : "text-online",
              )}
            >
              {alarms == null
                ? "Canal de alarmes não homologado"
                : alarms > 0
                  ? `${fmt(alarms, 0)} alarme(s) reportado(s)`
                  : "Sem alarmes reportados"}
            </p>
          </div>
          <div className="gen-flags">
            <BoolFlag label="Comunicação Rapid" value={comm} goodWhenTrue />
            <BoolFlag label="Rotação detectada" value={running} goodWhenTrue />
            <BoolFlag label="MCB fechado" value={mcbKnown ? gen.mcb : null} goodWhenTrue />
            <BoolFlag label="GCB fechado" value={gcbKnown ? gen.gcb : null} goodWhenTrue />
            <BoolFlag label="Modo conhecido" value={modeKnown ? true : null} goodWhenTrue />
            <BoolFlag label="Falha comunicação" value={gen.status === "offline"} />
          </div>
        </section>

        <section className="gen-card min-h-0">
          <header className="gen-card-head">
            <h2>Rede elétrica</h2>
            <span className="num text-[12px] font-bold text-muted-foreground">Hz N/D</span>
          </header>
          <div className="gen-metrics gen-metrics-3">
            <MetricCell label="L1-N" value={formatMetric(mainsL1, "V", 0)} />
            <MetricCell label="L2-N" value={formatMetric(mainsL2, "V", 0)} />
            <MetricCell label="L3-N" value={formatMetric(mainsL3, "V", 0)} />
            <MetricCell label="L1-L2" value={formatMetric(mainsL12, "V", 0)} />
            <MetricCell label="MCB" value={mcbKnown ? (gen.mcb ? "FECHADO" : "ABERTO") : "N/D"} />
            <MetricCell label="Fonte" value={mainsKnown ? "Rapid SCADA" : "N/D"} />
          </div>
          <div className="gen-phase">
            <span>
              L1-N <b>{formatMetric(mainsL1, "V", 0)}</b>
            </span>
            <span>
              L1-L2 <b>{formatMetric(mainsL12, "V", 0)}</b>
            </span>
            <span>
              L2-N <b>{formatMetric(mainsL2, "V", 0)}</b>
            </span>
            <span>
              L3-N <b>{formatMetric(mainsL3, "V", 0)}</b>
            </span>
          </div>
        </section>

        <section className="gen-card gen-motor">
          <header className="gen-card-head">
            <h2>Motor / ECU</h2>
            <StatusPill status={gen.status} />
          </header>
          <div className="gen-metrics gen-metrics-4">
            <MetricCell label="RPM" value={formatMetric(rpm, "rpm", 0)} />
            <MetricCell label="Óleo" value={formatMetric(oil, "bar", 1)} />
            <MetricCell label="Temp. água" value={formatMetric(temp, "°C", 0)} />
            <MetricCell label="Combustível" value={formatMetric(fuel, "%", 0)} />
            <MetricCell label="Bateria" value={formatMetric(batt, "V", 1)} />
            <MetricCell label="Alternador" value={formatMetric(alt, "V", 1)} />
            <MetricCell label="Horímetro" value={formatMetric(runHours, "h", 1)} />
            <MetricCell label="Manutenção" value={formatMetric(maintenance, "h", 0)} />
            <MetricCell label="Modo" value={modeLabel} />
            <MetricCell
              label="Fonte"
              value={gen.telemetrySource === "rapid_scada" ? "Rapid SCADA" : "N/D"}
            />
            <MetricCell
              label="Device"
              value={gen.rapidDeviceNum == null ? "N/D" : String(gen.rapidDeviceNum)}
            />
            <MetricCell label="Estado" value={ready} />
          </div>
        </section>
      </div>
    </>
  );
}
