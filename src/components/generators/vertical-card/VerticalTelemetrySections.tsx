import { cn } from "@/lib/utils";
import { Clock3, Gauge, Zap } from "lucide-react";

import { IconBattery, IconFuelPump, IconOilCan, IconThermometer } from "../scada-icons";

function valueText(value: number | null, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + (unit ? " " + unit : "")
  );
}

function MiniBar({ percent, className }: { percent: number | null; className?: string }) {
  const pct =
    percent == null || !Number.isFinite(percent) ? null : Math.min(100, Math.max(0, percent));
  return (
    <span className={cn("vref-mini-bar", className, pct == null && "is-unknown")}>
      {pct != null && <i style={{ width: pct + "%" }} />}
    </span>
  );
}

export function VerticalEngineAndRpm({
  oil,
  oilUnit,
  coolant,
  coolantUnit,
  fuel,
  fuelUnit,
  battery,
  oilPercent,
  coolantPercent,
  fuelPercent,
  fuelOutOfRange,
  runningKnown,
  running,
}: {
  oil: number | null;
  oilUnit: string;
  coolant: number | null;
  coolantUnit: string;
  fuel: number | null;
  fuelUnit: string;
  battery: number | null;
  oilPercent: number | null;
  coolantPercent: number | null;
  fuelPercent: number | null;
  fuelOutOfRange: boolean;
  runningKnown: boolean;
  running: boolean;
}) {
  return (
    <div className="vref-engine-rpm">
      <section className="vref-section vref-engine">
        <div className="vref-engine-heading">
          <h4>ESTADO DO MOTOR</h4>
          <span
            className={cn(!runningKnown ? "is-unknown" : running ? "is-running" : "is-stopped")}
          >
            {!runningKnown ? "N/D" : running ? "LIGADO" : "PARADO"}
          </span>
        </div>
        <div className="vref-engine-row">
          <IconOilCan />
          <span>Pressão do óleo</span>
          <MiniBar percent={oilPercent} />
          <b>{valueText(oil, oilUnit, 1)}</b>
        </div>
        <div className="vref-engine-row">
          <IconThermometer />
          <span>Temp. do motor</span>
          <MiniBar percent={coolantPercent} />
          <b>{valueText(coolant, coolantUnit, 0)}</b>
        </div>
        <div
          className={cn("vref-engine-row", fuelOutOfRange && "is-warning")}
          data-quality={fuelOutOfRange ? "out-of-range" : "normal"}
          title={
            fuelOutOfRange
              ? "Leitura de combustível acima da capacidade informada pela controladora"
              : undefined
          }
        >
          <IconFuelPump />
          <span>Combustível</span>
          <MiniBar percent={fuelPercent} />
          <b>{valueText(fuel, fuelUnit, 0)}</b>
        </div>
        <div className="vref-engine-row">
          <IconBattery />
          <span>Tensão da bateria</span>
          <MiniBar percent={null} />
          <b>{valueText(battery, "V", 1)}</b>
        </div>
      </section>
    </div>
  );
}

export type ElectricalRow = {
  label: string;
  mains: string;
  generator: string;
};

export type ValueRow = {
  icon: "clock" | "zap" | "gauge" | "battery";
  label: string;
  value: string;
  active?: boolean;
};

const valueIcons = {
  clock: Clock3,
  zap: Zap,
  gauge: Gauge,
  battery: IconBattery,
};

export function VerticalTables({
  hasMainsSource,
  electricalRows,
  valueRows,
}: {
  hasMainsSource: boolean;
  electricalRows: ElectricalRow[];
  valueRows: ValueRow[];
}) {
  return (
    <section className="vref-section vref-measurements">
      <div className={cn("vref-table-heading", !hasMainsSource && "is-generator-only")}>
        <h4>{hasMainsSource ? "REDE / GERADOR" : "GERADOR"}</h4>
        {hasMainsSource && <span>REDE</span>}
        <span>GEN</span>
      </div>

      <div className="vref-data-table">
        {electricalRows.map((row) => (
          <div
            key={row.label}
            className={cn("vref-data-row", !hasMainsSource && "is-generator-only")}
          >
            <span>{row.label}</span>
            {hasMainsSource && <b>{row.mains}</b>}
            <b className="generator">{row.generator}</b>
          </div>
        ))}
      </div>

      <div className="vref-summary-grid" aria-label="Valores do gerador">
        {valueRows.map((row) => {
          const Icon = valueIcons[row.icon];
          return (
            <div key={row.label} className="vref-summary-item">
              <Icon />
              <span>{row.label}</span>
              <b className={cn(row.active && "is-active")}>{row.value}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
