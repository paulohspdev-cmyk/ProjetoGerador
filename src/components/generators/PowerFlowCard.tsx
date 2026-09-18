import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi, type EventItemApi } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, hasFreshMetric, metricNumber } from "./generator-metrics";
import { isPositiveMeasurement } from "./generator-presence";
import { VerticalModeStrip } from "./vertical-card/VerticalControls";
import {
  VerticalAlarmList,
  VerticalEngineAndRpm,
  VerticalTables,
} from "./vertical-card/VerticalTelemetrySections";
import { VerticalPowerFlow } from "./vertical-card/VerticalPowerFlow";
import { VerticalPowerGauge } from "./vertical-card/VerticalPowerGauge";
import "./vertical-card/vertical-reference-card.css";

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUnit(value: number | null | undefined, unit: string, digits = 0) {
  const text = formatNumber(value, digits);
  return text === "N/D" ? text : text + " " + unit;
}

function controllerVendor(gen: Generator) {
  const text = (
    String(gen.controllerType ?? "") +
    " " +
    String(gen.controller ?? "")
  ).toLowerCase();
  if (text.includes("dse") || text.includes("deep sea")) return "dse";
  if (text.includes("comap") || text.includes("inteli")) return "comap";
  return "generic";
}

function useAlarmEvents(gen: Generator, shouldLoad: boolean) {
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!shouldLoad) {
      setEvents([]);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    rcApi.events
      .list(12, gen.id)
      .then((rows) => {
        if (!active) return;
        setEvents(rows);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Falha ao consultar alarmes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [gen.id, shouldLoad]);

  return { events, loading, error };
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const telemetry = readGeneratorTelemetry(gen);
  const {
    rpm,
    oil,
    oilUnit,
    coolant,
    fuel,
    fuelUnit,
    battery,
    runHours,
    frequency,
    mainsFrequency,
    powerKw,
    powerFactor,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
  } = telemetry;

  const vendor = controllerVendor(gen);
  const dse = vendor === "dse";
  const runningKnown = rpm != null && hasFreshMetric(gen, "rpm");
  const running = runningKnown && isPositiveMeasurement(rpm);
  const mcbKnown = hasFreshMetric(gen, "mcb_closed");
  const gcbKnown = hasFreshMetric(gen, "gcb_closed");
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");
  const alarmCountKnown = hasFreshMetric(gen, "alarm_count");
  const alarmActiveKnown = hasFreshMetric(gen, "alarm_active");
  const alarmActive = metricNumber(gen, "alarm_active", undefined) === 1;
  const alarmCount = alarmCountKnown ? gen.alarms : null;
  const shouldLoadAlarms =
    (alarmCount != null && alarmCount > 0) || (alarmActiveKnown && alarmActive);
  const alarms = useAlarmEvents(gen, shouldLoadAlarms);

  const breakerState = metricNumber(gen, "breaker_state_raw", undefined);
  const isComap = vendor === "comap";
  const comapIslanded = isComap && (breakerState === 2 || breakerState === 10);

  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsPf = metricNumber(gen, "mains_power_factor", undefined);
  const mainsCurrent = metricNumber(gen, "mains_current_l1", undefined);
  const mainsVoltageKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const mainsFrequencyKnown = hasFreshMetric(gen, "mains_frequency");
  const mainsKnown = !comapIslanded && (mainsVoltageKnown || mainsFrequencyKnown || mcbKnown);
  const mainsPeak = Math.max(
    0,
    ...[mainsL1, mainsL2, mainsL3].filter((value): value is number => value != null),
  );
  const mainsPresent =
    mainsKnown &&
    (mainsPeak >= 80 ||
      (mainsFrequencyKnown && mainsFrequency != null && mainsFrequency >= 20) ||
      (mcbKnown && gen.mcb));

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const energyKwh = metricNumber(gen, "genset_kwh", undefined);
  const requiredPower = metricNumber(gen, "required_power_kw", undefined);
  const batteryVoltage = metricNumber(gen, "battery_voltage", battery);
  const genCurrent =
    [currentL1, currentL2, currentL3]
      .filter((value): value is number => value != null)
      .reduce((sum, value) => sum + value, 0) /
    Math.max(1, [currentL1, currentL2, currentL3].filter((value) => value != null).length);
  const currentKnown = [currentL1, currentL2, currentL3].some((value) => value != null);

  const electricalRows = useMemo(
    () => [
      {
        label: "L1-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL1 : null, "V"),
        generator: formatUnit(genL1, "V"),
      },
      {
        label: "L2-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL2 : null, "V"),
        generator: formatUnit(genL2, "V"),
      },
      {
        label: "L3-N Voltage",
        mains: formatUnit(mainsKnown ? mainsL3 : null, "V"),
        generator: formatUnit(genL3, "V"),
      },
      {
        label: "Frequency",
        mains: formatUnit(mainsKnown ? mainsFrequency : null, "Hz", 1),
        generator: formatUnit(frequency, "Hz", 1),
      },
      {
        label: "Power Factor",
        mains: formatNumber(mainsPf, 2),
        generator: formatNumber(powerFactor, 2),
      },
      {
        label: "Current (A)",
        mains: formatUnit(mainsCurrent, "A", 0),
        generator: formatUnit(currentKnown ? genCurrent : null, "A", 0),
      },
    ],
    [
      currentKnown,
      frequency,
      genCurrent,
      genL1,
      genL2,
      genL3,
      mainsCurrent,
      mainsFrequency,
      mainsKnown,
      mainsL1,
      mainsL2,
      mainsL3,
      mainsPf,
      powerFactor,
    ],
  );

  const valueRows = [
    { icon: "clock" as const, label: "Run Hours", value: formatUnit(runHours, "h", 1) },
    { icon: "zap" as const, label: "Energy", value: formatUnit(energyKwh, "kWh", 0) },
    { icon: "gauge" as const, label: "Required Power", value: formatUnit(requiredPower, "kW", 0) },
  ];

  const canStart = can("operate") && gen.capabilities?.start === true;
  const canStop = can("operate") && gen.capabilities?.stop === true;

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    const allowed = action === "start" ? canStart : canStop;
    if (!allowed || commandBusy || !confirmCmd(label)) return;

    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setCommandMessage(result.reason || label + " aceito pelo controlador");
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : "Falha no comando " + label);
    } finally {
      setCommandBusy(null);
    }
  };

  const online = gen.status === "online" || gen.status === "alerta";

  return (
    <article
      className={cn(
        "vref-card",
        dse ? "is-dse" : "is-comap",
        mainsPresent ? "has-mains" : "no-mains",
        gen.status === "alerta" && "has-alert",
      )}
      data-controller-vendor={vendor}
      data-mains-state={!mainsKnown ? "unknown" : mainsPresent ? "present" : "absent"}
    >
      <header className="vref-header">
        <span className={cn("vref-generator-badge", online ? "is-online" : "is-offline")}>G</span>
        <div className="vref-header-title">
          <Link to="/p/geradores/$id" params={{ id: gen.id }} title={gen.controller}>
            {displayGeneratorName(gen)}
          </Link>
          <span className={cn(online ? "is-online" : "is-offline")}>
            <i /> {gen.status === "alerta" ? "ALERT" : online ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </header>

      <VerticalModeStrip gen={gen} dse={dse} modeKnown={modeKnown} />

      <VerticalPowerGauge powerKw={powerKw} nominalKw={nominalPower} />

      <VerticalPowerFlow
        mainsPresent={mainsPresent}
        mainsKnown={mainsKnown}
        mcb={gen.mcb}
        mcbKnown={mcbKnown}
        gcb={gen.gcb}
        gcbKnown={gcbKnown}
        running={running}
        canStart={canStart}
        canStop={canStop}
        busy={commandBusy}
        onStart={() => void runCommand("start")}
        onStop={() => void runCommand("stop")}
      />
      {commandMessage && <p className="vref-command-message">{commandMessage}</p>}

      <VerticalEngineAndRpm
        oil={oil}
        oilUnit={oilUnit}
        coolant={coolant}
        fuel={fuel}
        fuelUnit={fuelUnit}
        battery={batteryVoltage}
        rpm={rpm}
      />

      <VerticalTables electricalRows={electricalRows} valueRows={valueRows} />

      <VerticalAlarmList
        alarmCount={alarmCount}
        events={alarms.events}
        loading={alarms.loading}
        error={alarms.error}
      />
    </article>
  );
}
