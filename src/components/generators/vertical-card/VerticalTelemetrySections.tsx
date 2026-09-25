import { cn } from "@/lib/utils";
import { Clock3, Gauge, Zap } from "lucide-react";

import { IconBattery } from "../scada-icons";

function valueText(value: number | null, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function MotorMiniGauge({
  label,
  value,
  unit,
  digits = 0,
  percent,
  warning = false,
  "data-quality": dataQuality,
}: {
  label: string;
  value: number | null;
  unit: string;
  digits?: number;
  percent: number | null;
  warning?: boolean;
  "data-quality"?: "out-of-range" | "normal";
}) {
  const known = value != null && Number.isFinite(value);
  const pct =
    percent == null || !Number.isFinite(percent) ? null : Math.min(100, Math.max(0, percent));
  const activeLength = pct == null ? 0 : 78 * (pct / 100);

  return (
    <div
      className={cn("vref-motor-gauge", !known && "is-unknown", warning && "is-warning")}
      data-motor-gauge={label.toLowerCase()}
      data-quality={dataQuality}
    >
      <span className="vref-motor-gauge-label">{label}</span>
      <svg
        viewBox="0 0 100 100"
        aria-label={`${label}: ${known ? valueText(value, unit, digits) : "N/D"}`}
      >
        <circle
          className="vref-motor-gauge-track"
          cx="50"
          cy="50"
          r="34"
          pathLength="100"
          strokeDasharray="78 22"
          transform="rotate(129 50 50)"
        />
        {pct != null && (
          <circle
            className="vref-motor-gauge-progress"
            cx="50"
            cy="50"
            r="34"
            pathLength="100"
            strokeDasharray={`${activeLength} ${100 - activeLength}`}
            transform="rotate(129 50 50)"
          />
        )}
        <text
          x="50"
          y={unit && known ? "48" : "54"}
          textAnchor="middle"
          className="vref-motor-gauge-value"
        >
          {known ? valueText(value, unit, digits) : "N/D"}
        </text>
        {known && unit && (
          <text x="50" y="62" textAnchor="middle" className="vref-motor-gauge-unit">
            {unit}
          </text>
        )}
      </svg>
    </div>
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
}) {
  return (
    <div className="vref-engine-rpm">
      <section className="vref-section vref-engine">
        <div className="vref-engine-heading">
          <h4>MOTOR</h4>
        </div>
        <div className="vref-motor-gauges">
          <MotorMiniGauge label="ÓLEO" value={oil} unit={oilUnit} digits={1} percent={oilPercent} />
          <MotorMiniGauge
            label="TEMP."
            value={coolant}
            unit={coolantUnit}
            percent={coolantPercent}
          />
          <MotorMiniGauge
            label="COMB."
            value={fuel}
            unit={fuelUnit}
            percent={fuelPercent}
            warning={fuelOutOfRange}
            data-quality={fuelOutOfRange ? "out-of-range" : "normal"}
          />
          <MotorMiniGauge label="BATERIA" value={battery} unit="V" digits={1} percent={null} />
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
