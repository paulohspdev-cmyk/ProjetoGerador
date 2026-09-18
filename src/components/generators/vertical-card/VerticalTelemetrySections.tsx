import type { EventItemApi } from "@/lib/api";
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

function MiniBar({
  value,
  max,
  className,
}: {
  value: number | null;
  max: number;
  className?: string;
}) {
  const pct =
    value == null || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <span className={cn("vref-mini-bar", className, value == null && "is-unknown")}>
      <i style={{ width: pct + "%" }} />
    </span>
  );
}

export function VerticalEngineAndRpm({
  oil,
  oilUnit,
  coolant,
  fuel,
  fuelUnit,
  battery,
  rpm,
}: {
  oil: number | null;
  oilUnit: string;
  coolant: number | null;
  fuel: number | null;
  fuelUnit: string;
  battery: number | null;
  rpm: number | null;
}) {
  return (
    <div className="vref-two-col">
      <section className="vref-section vref-engine">
        <h4>ENGINE STATUS</h4>
        <div className="vref-engine-row">
          <Gauge />
          <span>Oil Pressure</span>
          <MiniBar value={oil} max={10} />
          <b>{valueText(oil, oilUnit, 1)}</b>
        </div>
        <div className="vref-engine-row">
          <Thermometer />
          <span>Coolant Temp.</span>
          <MiniBar value={coolant} max={120} />
          <b>{valueText(coolant, "°C", 0)}</b>
        </div>
        <div className="vref-engine-row">
          <Fuel />
          <span>Fuel Level</span>
          <MiniBar value={fuel} max={fuelUnit === "%" ? 100 : 700} />
          <b>{valueText(fuel, fuelUnit, 0)}</b>
        </div>
        <div className="vref-engine-row">
          <Battery />
          <span>Battery Voltage</span>
          <MiniBar value={battery} max={30} />
          <b>{valueText(battery, "V", 1)}</b>
        </div>
      </section>

      <section className="vref-section vref-rpm">
        <h4>RPM</h4>
        <RpmGauge value={rpm ?? 0} max={4000} />
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
    <div className="vref-two-col vref-tables">
      <section className="vref-section">
        <div className="vref-table-heading">
          <h4>MAINS / GENERATOR</h4>
          <span>MAINS</span>
          <span>GENERATOR</span>
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
      </section>

      <section className="vref-section">
        <h4>VALUES</h4>
        <div className="vref-value-list">
          {valueRows.map((row) => {
            const Icon = valueIcons[row.icon];
            return (
              <div key={row.label} className="vref-value-row">
                <Icon />
                <span>{row.label}</span>
                <b className={cn(row.active && "is-active")}>{row.value}</b>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function VerticalAlarmList({
  alarmCount,
  events,
  loading,
  error,
}: {
  alarmCount: number | null;
  events: EventItemApi[];
  loading: boolean;
  error: string;
}) {
  const alarmEvents = events
    .filter((event) =>
      ["FAULT", "ERROR", "WARN", "WARNING"].includes(String(event.level).toUpperCase()),
    )
    .slice(0, 2);

  return (
    <section className="vref-section vref-alarms">
      <h4>ALARM LIST ({alarmCount == null ? "N/D" : alarmCount})</h4>
      {loading && <p className="vref-alarm-empty">Loading alarms…</p>}
      {!loading && error && <p className="vref-alarm-empty">Alarm history unavailable</p>}
      {!loading &&
        !error &&
        alarmEvents.map((event) => {
          const fault = ["FAULT", "ERROR"].includes(String(event.level).toUpperCase());
          return (
            <div key={event.id} className={cn("vref-alarm-row", fault ? "fault" : "warning")}>
              <time>
                {new Date(event.created_at * 1000).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              <i />
              <div>
                <b>{event.message}</b>
                <span>{String(event.level).toUpperCase()}</span>
              </div>
              <strong>{fault ? "ACTIVE" : "WARNING"}</strong>
            </div>
          );
        })}
      {!loading && !error && alarmEvents.length === 0 && (
        <p className="vref-alarm-empty">No active alarms ✓</p>
      )}
    </section>
  );
}
