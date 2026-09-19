import { cn } from "@/lib/utils";
import { Battery, Clock3, Fuel, Gauge, Thermometer, Zap } from "lucide-react";

import { RpmGauge } from "../RpmGauge";

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
  rpm,
  oilPercent,
  coolantPercent,
  fuelPercent,
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
  rpm: number | null;
  oilPercent: number | null;
  coolantPercent: number | null;
  fuelPercent: number | null;
  runningKnown: boolean;
  running: boolean;
}) {
  return (
    <div className="vref-engine-rpm">
      <section className="vref-section vref-engine">
        <div className="vref-engine-heading">
          <h4>ENGINE STATUS</h4>
          <span
            className={cn(!runningKnown ? "is-unknown" : running ? "is-running" : "is-stopped")}
          >
            {!runningKnown ? "N/D" : running ? "RUNNING" : "STOPPED"}
          </span>
        </div>
        <div className="vref-engine-row">
          <Gauge />
          <span>Oil Pressure</span>
          <MiniBar percent={oilPercent} />
          <b>{valueText(oil, oilUnit, 1)}</b>
        </div>
        <div className="vref-engine-row">
          <Thermometer />
          <span>Coolant Temp.</span>
          <MiniBar percent={coolantPercent} />
          <b>{valueText(coolant, coolantUnit, 0)}</b>
        </div>
        <div className="vref-engine-row">
          <Fuel />
          <span>Fuel Level</span>
          <MiniBar percent={fuelPercent} />
          <b>{valueText(fuel, fuelUnit, 0)}</b>
        </div>
        <div className="vref-engine-row">
          <Battery />
          <span>Battery Voltage</span>
          <MiniBar percent={null} />
          <b>{valueText(battery, "V", 1)}</b>
        </div>
      </section>

      <section className="vref-section vref-rpm">
        <h4>RPM</h4>
        <RpmGauge value={rpm} max={4000} />
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
  battery: Battery,
};

export function VerticalTables({
  electricalRows,
  valueRows,
}: {
  electricalRows: ElectricalRow[];
  valueRows: ValueRow[];
}) {
  return (
    <section className="vref-section vref-measurements">
      <div className="vref-table-heading">
        <h4>MAINS / GENERATOR</h4>
        <span>MAINS</span>
        <span>GEN</span>
      </div>

      <div className="vref-data-table">
        {electricalRows.map((row) => (
          <div key={row.label} className="vref-data-row">
            <span>{row.label}</span>
            <b>{row.mains}</b>
            <b className="generator">{row.generator}</b>
          </div>
        ))}
      </div>

      <div className="vref-summary-grid" aria-label="Generator values">
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
