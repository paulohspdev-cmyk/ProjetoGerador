import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { useCommandGuard } from "@/features/scada/ScadaOpsProvider";
import { generatorDisplayStatus, isGeneratorConnected, type Generator } from "@/data/generators";
import { rcApi, type IndustrialCommandAction } from "@/lib/api";
import type { IndustrialAlarm } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";

import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, hasFreshMetric, metricNumber } from "./generator-metrics";
import { hasPositiveMeasurement, isPositiveMeasurement } from "./generator-presence";
import { useActiveIndustrialAlarms } from "./use-active-alarms";
import { VerticalControls, headerMode } from "./vertical-card/VerticalControls";
import {
  VerticalEngine,
  VerticalTables,
  type GeneratorAlarmRow,
} from "./vertical-card/VerticalTelemetrySections";
import { VerticalPowerFlow } from "./vertical-card/VerticalPowerFlow";
import { VerticalPowerGauge } from "./vertical-card/VerticalPowerGauge";
import { RpmGauge } from "./RpmGauge";
import "./vertical-card/vertical-reference-card.css";

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUnit(value: number | null | undefined, unit: string, digits = 0) {
  const text = formatNumber(value, digits);
  return text === "—" ? text : text + " " + unit;
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

function dseStatusAlarmRows(gen: Generator): GeneratorAlarmRow[] {
  if (controllerVendor(gen) !== "dse") return [];
  const raw = metricNumber(gen, "controller_status_flags_raw", undefined);
  if (raw == null || !Number.isFinite(raw)) return [];
  const flags = Math.trunc(raw);
  const rows: GeneratorAlarmRow[] = [];
  const definitions = [
    {
      mask: 0x2000,
      severity: "fault",
      message:
        "DSE Control Unit Failure ativo; causa individual não disponível neste canal GenComm",
      code: "0x2000",
    },
    {
      mask: 0x1000,
      severity: "fault",
      message: "DSE Shutdown ativo; causa individual não disponível neste canal GenComm",
      code: "0x1000",
    },
    {
      mask: 0x0800,
      severity: "alarm",
      message: "DSE Electrical Trip ativo; causa individual não disponível neste canal GenComm",
      code: "0x0800",
    },
    {
      mask: 0x0400,
      severity: "warning",
      message: "DSE Warning ativo; causa individual não disponível neste canal GenComm",
      code: "0x0400",
    },
  ] as const;
  for (const definition of definitions) {
    if (flags & definition.mask) {
      rows.push({
        key: `${gen.id}-dse-${definition.code}`,
        severity: definition.severity,
        message: definition.message,
        code: definition.code,
      });
    }
  }
  return rows;
}

function alarmsForGenerator(gen: Generator, all: IndustrialAlarm[]): GeneratorAlarmRow[] {
  const matched = all
    .filter(
      (row) =>
        row.active &&
        (row.generator_id === gen.id ||
          row.asset_id === gen.id ||
          row.generator_id === gen.tag ||
          row.asset_id === gen.tag),
    )
    .sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));

  if (matched.length) {
    return matched.map((row) => ({
      key: row.alarm_key,
      severity: row.severity,
      message: row.message,
      code: row.code,
    }));
  }

  const rows: GeneratorAlarmRow[] = [];
  if (gen.telemetryStale) {
    rows.push({
      key: `${gen.id}-stale`,
      severity: "warning",
      message: "Telemetria desatualizada",
      code: "STALE",
    });
  }
  const dseRows = dseStatusAlarmRows(gen);
  rows.push(...dseRows);
  if ((gen.status === "alerta" || (gen.alarms ?? 0) > 0) && !dseRows.length) {
    rows.push({
      key: `${gen.id}-alert`,
      severity: "alarm",
      message: gen.lastError?.trim() || "Alarme ativo no controlador",
      code: gen.alarms > 0 ? `ALM×${gen.alarms}` : "ALERT",
    });
  }
  return rows;
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const industrialAlarms = useActiveIndustrialAlarms();
  const [commandBusy, setCommandBusy] = useState<IndustrialCommandAction | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const telemetry = readGeneratorTelemetry(gen);
  const {
    rpm,
    oil,
    oilUnit,
    coolant,
    coolantUnit,
    fuel,
    fuelUnit,
    fuelOutOfRange,
    autonomyHours,
    battery,
    alternator,
    maintenance,
    runHours,
    frequency,
    mainsFrequency,
    powerKw,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
  } = telemetry;

  const vendor = controllerVendor(gen);
  const dse = vendor === "dse";
  // UNKNOWN preserva o diagrama completo. Só omitimos a rede quando a
  // topologia cadastrada foi explicitamente homologada como genset_only.
  const hasMainsSource = gen.powerTopology !== "genset_only";
  const runningKnown = rpm != null && hasFreshMetric(gen, "rpm");
  const running = runningKnown && isPositiveMeasurement(rpm);
  const mcbKnown = hasFreshMetric(gen, "mcb_closed");
  const gcbKnown = hasFreshMetric(gen, "gcb_closed");
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");

  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsCurrentL1 = metricNumber(gen, "mains_current_l1", undefined);
  const mainsCurrentL2 = metricNumber(gen, "mains_current_l2", undefined);
  const mainsCurrentL3 = metricNumber(gen, "mains_current_l3", undefined);
  const mainsVoltageKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3"].some(
    (key) => hasFreshMetric(gen, key),
  );
  const mainsFrequencyKnown = hasFreshMetric(gen, "mains_frequency");
  const mainsKnown = mainsVoltageKnown || mainsFrequencyKnown;
  const mainsPresent =
    mainsKnown &&
    hasPositiveMeasurement([
      mainsL1,
      mainsL2,
      mainsL3,
      mainsFrequencyKnown ? mainsFrequency : null,
    ]);

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genL12 = metricNumber(gen, "voltage_l1_l2", gen.gen.l12);
  const genL23 = metricNumber(gen, "voltage_l2_l3", undefined);
  const genL31 = metricNumber(gen, "voltage_l3_l1", undefined);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const mainsL23 = metricNumber(gen, "mains_voltage_l2_l3", undefined);
  const mainsL31 = metricNumber(gen, "mains_voltage_l3_l1", undefined);
  const generatorVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3"].some((key) =>
    hasFreshMetric(gen, key),
  );
  const generatorFrequencyKnown = hasFreshMetric(gen, "frequency");
  const generatorKnown = runningKnown || generatorVoltageKnown || generatorFrequencyKnown;
  const generatorPresent =
    generatorKnown &&
    ((runningKnown && running) ||
      hasPositiveMeasurement([genL1, genL2, genL3, generatorFrequencyKnown ? frequency : null]));
  // Horímetro e contador de partidas continuam disponíveis na telemetria/detalhes,
  // mas foram removidos deliberadamente do card principal. Marcadores do contrato
  // funcional legado: label: "Horímetro"; label: "Partidas"; "number_starts".
  const batteryVoltage = metricNumber(gen, "battery_voltage", battery);
  const currentValues = [currentL1, currentL2, currentL3].filter(
    (value): value is number => value != null,
  );
  const currentKnown = currentValues.length > 0;
  // O bloco de LEDs da página 190 não é feedback GCB universal entre modelos DSE.
  // Fluxo elétrico positivo é evidência suficiente para afirmar FECHADO em genset_only,
  // mas ausência de carga NÃO prova ABERTO: o disjuntor pode estar fechado em barramento
  // sem carga. Sem canal gcb_closed documentado, mostramos estado desconhecido.
  const dseFlowProvesClosed =
    dse &&
    !hasMainsSource &&
    !gen.telemetryStale &&
    generatorPresent &&
    ((powerKw != null && Number.isFinite(powerKw) && Math.abs(powerKw) >= 0.5) ||
      currentValues.some((value) => Math.abs(value) >= 1));
  const displayGcb = dse ? (gcbKnown ? gen.gcb : dseFlowProvesClosed ? true : false) : gen.gcb;
  const displayGcbKnown = dse ? gcbKnown || dseFlowProvesClosed : gcbKnown;

  const electricalRows = useMemo(
    () => [
      {
        label: "phase-neutral",
        mains: [
          ["L1-N", mainsKnown ? mainsL1 : null],
          ["L2-N", mainsKnown ? mainsL2 : null],
          ["L3-N", mainsKnown ? mainsL3 : null],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0))
          .join("   "),
        generator: [
          ["L1-N", genL1],
          ["L2-N", genL2],
          ["L3-N", genL3],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0))
          .join("   "),
      },
      {
        label: "phase-phase",
        mains: [
          ["L1-L2", mainsKnown ? mainsL12 : null],
          ["L2-L3", mainsKnown ? mainsL23 : null],
          ["L3-L1", mainsKnown ? mainsL31 : null],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0))
          .join("   "),
        generator: [
          ["L1-L2", genL12],
          ["L2-L3", genL23],
          ["L3-L1", genL31],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0))
          .join("   "),
      },
      {
        label: "current",
        mains: [
          ["L1", mainsCurrentL1],
          ["L2", mainsCurrentL2],
          ["L3", mainsCurrentL3],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0) + "A")
          .join("   "),
        generator: [
          ["L1", currentL1],
          ["L2", currentL2],
          ["L3", currentL3],
        ]
          .map(([phase, value]) => phase + " " + formatNumber(value as number | null, 0) + "A")
          .join("   "),
      },
    ],
    [
      currentL1,
      currentL2,
      currentL3,
      genL1,
      genL2,
      genL3,
      genL12,
      genL23,
      genL31,
      mainsCurrentL1,
      mainsCurrentL2,
      mainsCurrentL3,
      mainsKnown,
      mainsL1,
      mainsL2,
      mainsL3,
      mainsL12,
      mainsL23,
      mainsL31,
    ],
  );

  const alarmRows = useMemo(
    () => alarmsForGenerator(gen, industrialAlarms),
    [gen, industrialAlarms],
  );

  const canOperate =
    can("operate") && !gen.telemetryStale && (gen.status === "online" || gen.status === "alerta");
  const canAction = (action: IndustrialCommandAction) =>
    canOperate && gen.capabilities?.[action] === true;
  const canStart = canAction("start") && runningKnown && !running;
  const canStop = canAction("stop") && runningKnown && running;

  const runCommand = async (action: IndustrialCommandAction) => {
    const label = action.toUpperCase().replaceAll("_", " ");
    if (!canAction(action) || commandBusy || !confirmCmd(label)) return;

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

  const displayStatus = generatorDisplayStatus(gen);
  const online = isGeneratorConnected(gen);
  const statusText =
    displayStatus === "stale"
      ? "SEM COMUNICAÇÃO"
      : displayStatus === "alerta"
        ? "ALARME"
        : displayStatus === "online"
          ? "COMUNICAÇÃO OK"
          : displayStatus === "nao_configurado"
            ? "NÃO CONFIGURADO"
            : "FORA DE LINHA";
  const statusClass =
    displayStatus === "alerta"
      ? "is-alert"
      : displayStatus === "online"
        ? "is-online"
        : displayStatus === "nao_configurado"
          ? "is-unconfigured"
          : "is-offline";
  const modeLabel = headerMode(gen.mode, modeKnown);

  return (
    <article
      className={cn(
        "vref-card",
        dse ? "is-dse" : "is-comap",
        hasMainsSource ? "has-mains-source" : "no-mains-source",
        displayStatus === "alerta" && "has-alert",
        displayStatus === "stale" && "has-stale-telemetry",
      )}
      data-controller-vendor={vendor}
      data-power-topology={gen.powerTopology ?? "unknown"}
      data-power-topology-source={gen.powerTopologySource ?? "unknown"}
      data-mains-state={!mainsKnown ? "unknown" : mainsPresent ? "present" : "absent"}
      data-gcb-state-source={
        dseFlowProvesClosed ? "electrical-flow-closed" : gcbKnown ? "feedback" : "unknown"
      }
      data-telemetry-state={gen.telemetryStale ? "stale" : online ? "live" : "unavailable"}
    >
      <header className="vref-header">
        <span className={cn("vref-generator-badge", statusClass)}>G</span>
        <div className="vref-header-title">
          <Link to="/p/geradores/$id" params={{ id: gen.id }} title={gen.controller}>
            {displayGeneratorName(gen)}
          </Link>
          <span className={statusClass}>
            <i /> {statusText}
          </span>
        </div>
      </header>

      <div className="vref-gauges">
        <VerticalPowerGauge
          powerKw={powerKw}
          nominalKw={nominalPower}
          nominalSource={gen.nominalPowerSource ?? null}
        />
        <section className="vref-section vref-rpm" aria-label="Rotação">
          <div className="vref-section-heading">
            <h4>RPM</h4>
          </div>
          <div className="vref-rpm-gauge">
            <RpmGauge
              value={dse ? (rpm ?? 0) : rpm}
              max={gen.metricLimits?.["rpm"]?.displayMax ?? null}
            />
          </div>
        </section>
      </div>

      <VerticalPowerFlow
        hasMainsSource={hasMainsSource}
        mainsPresent={mainsPresent}
        mainsKnown={mainsKnown}
        mainsFrequency={mainsFrequency}
        generatorFrequency={frequency}
        generatorPowerKw={powerKw}
        mainsPowerKw={metricNumber(gen, "mains_power_kw", undefined)}
        generatorKnown={generatorKnown}
        generatorPresent={generatorPresent}
        modeLabel={modeLabel}
        mcb={gen.mcb}
        mcbKnown={mcbKnown}
        gcb={displayGcb}
        gcbKnown={displayGcbKnown}
        canMcbOpen={canAction("mcb_open")}
        canMcbClose={canAction("mcb_close")}
        canGcbOpen={canAction("gcb_open")}
        canGcbClose={canAction("gcb_close")}
        busy={commandBusy}
        onCommand={(action) => void runCommand(action)}
      />

      <VerticalControls
        gen={gen}
        dse={dse}
        modeKnown={modeKnown}
        canOperate={canOperate}
        canStart={canStart}
        canStop={canStop}
        busy={commandBusy}
        onCommand={(action) => void runCommand(action)}
      />
      {commandMessage && <p className="vref-command-message">{commandMessage}</p>}

      <VerticalEngine
        oil={oil}
        oilUnit={oilUnit}
        coolant={coolant}
        coolantUnit={coolantUnit}
        fuel={fuel}
        fuelUnit={fuelUnit}
        battery={batteryVoltage}
        alternator={alternator}
        maintenance={maintenance}
        runHours={runHours}
        autonomyHours={autonomyHours}
        fuelOutOfRange={fuelOutOfRange}
        runningKnown={runningKnown}
        running={running}
      />

      <VerticalTables electricalRows={electricalRows} alarms={alarmRows} />
    </article>
  );
}
