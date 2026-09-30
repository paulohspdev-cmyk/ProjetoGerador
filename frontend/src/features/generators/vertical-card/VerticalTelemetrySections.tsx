import { cn } from "@/lib/utils";
import {
  Battery,
  Bell,
  Clock3,
  Fuel,
  Gauge,
  Thermometer,
  TriangleAlert,
  Wrench,
  Zap,
} from "lucide-react";

function valueText(value: number | null, unit: string, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + (unit ? " " + unit : "")
  );
}

function autonomyText(hours: number | null) {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return "N/D";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function VerticalEngine({
  oil,
  oilUnit,
  coolant,
  coolantUnit,
  fuel,
  fuelUnit,
  battery,
  alternator,
  maintenance,
  runHours,
  autonomyHours,
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
  alternator: number | null;
  maintenance: number | null;
  runHours: number | null;
  autonomyHours: number | null;
  fuelOutOfRange: boolean;
  runningKnown: boolean;
  running: boolean;
}) {
  return (
    <section className="vref-section vref-engine">
      <div className="vref-engine-heading">
        <h4>ENGINE STATUS</h4>
        <span className={cn(!runningKnown ? "is-unknown" : running ? "is-running" : "is-stopped")}>
          {!runningKnown ? "N/D" : running ? "RUNNING" : "STOPPED"}
        </span>
      </div>
      <div className="vref-engine-row">
        <Gauge />
        <span>Oil Pressure</span>
        <b>{valueText(oil, oilUnit, 1)}</b>
      </div>
      <div className="vref-engine-row">
        <Thermometer />
        <span>Coolant Temp.</span>
        <b>{valueText(coolant, coolantUnit, 0)}</b>
      </div>
      <div className="vref-engine-row" data-quality={fuelOutOfRange ? "out-of-range" : "normal"}>
        <Fuel />
        <span>Fuel Level</span>
        <b>{valueText(fuel, fuelUnit, 0)}</b>
      </div>
      <div className="vref-engine-row">
        <Battery />
        <span>Battery Voltage</span>
        <b>{valueText(battery, "V", 1)}</b>
      </div>
      <div className="vref-engine-row">
        <Zap />
        <span>Alternator</span>
        <b>{valueText(alternator, "V", 1)}</b>
      </div>
      <div className="vref-engine-row">
        <Clock3 />
        <span>Run Hours</span>
        <b>{valueText(runHours, "h", 1)}</b>
      </div>
      <div className="vref-engine-row">
        <Wrench />
        <span>Maintenance</span>
        <b>{valueText(maintenance, "h", 0)}</b>
      </div>
      <div className="vref-engine-row">
        <Fuel />
        <span>Autonomy</span>
        <b>{autonomyText(autonomyHours)}</b>
      </div>
    </section>
  );
}

export type ElectricalRow = {
  label: string;
  mains: string;
  generator: string;
};

export type GeneratorAlarmRow = {
  key: string;
  severity: "fault" | "alarm" | "warning" | "info" | string;
  message: string;
  code?: string;
};

export function VerticalTables({
  electricalRows,
  alarms,
}: {
  electricalRows: ElectricalRow[];
  alarms: GeneratorAlarmRow[];
}) {
  const visible = alarms.slice(0, 3);
  const extra = Math.max(0, alarms.length - visible.length);

  return (
    <div className="vref-measurements">
      <div className="vref-table-heading">
        <h4>ELECTRICAL</h4>
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
      <div className="vref-alarms" aria-label="Alarmes do gerador">
        <div className="vref-alarms-heading">
          <h4>ALARMS</h4>
          <span className={alarms.length ? "is-active" : "is-clear"}>
            {alarms.length ? String(alarms.length) : "OK"}
          </span>
        </div>
        {visible.length === 0 ? (
          <div className="vref-alarm-empty">Sem alarmes ativos</div>
        ) : (
          visible.map((alarm) => (
            <div
              key={alarm.key}
              className={cn(
                "vref-alarm-row",
                alarm.severity === "fault" || alarm.severity === "alarm"
                  ? "is-fault"
                  : alarm.severity === "warning"
                    ? "is-warn"
                    : "is-info",
              )}
            >
              <TriangleAlert />
              <span title={alarm.message}>{alarm.message}</span>
              <b>{(alarm.code || alarm.severity || "ALM").toUpperCase()}</b>
            </div>
          ))
        )}
        {extra > 0 ? (
          <div className="vref-alarm-more">
            <Bell />
            <span>+{extra} alarme(s)</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
