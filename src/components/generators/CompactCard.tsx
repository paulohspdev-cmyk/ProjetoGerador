import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CompactPowerGauge } from "./CompactPowerGauge";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { useGenerators } from "./GeneratorsProvider";
import { readGeneratorTelemetry, toneTextClass } from "./generator-health";
import { fmt, hasMetric, metricNumber } from "./generator-metrics";
import { StatusPill } from "./StatusPill";
import "./compact-card.css";

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="compact-metric">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function stateText(known: boolean, closed: boolean) {
  if (!known) return "N/D";
  return closed ? "FECH" : "ABR";
}

export function CompactCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const configured = gen.status !== "nao_configurado";
  const telemetry = readGeneratorTelemetry(gen);
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const mainsFrequency = metricNumber(gen, "mains_frequency", gen.mainsFrequency);
  const mainsVoltage = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsLive = (mainsFrequency ?? 0) > 0 || (mainsVoltage ?? 0) > 0;
  const canOperate =
    can("operate") &&
    gen.controller.trim().toLowerCase() === "inteligen 200" &&
    Number(gen.rapidDeviceNum) > 0 &&
    configured;

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    if (!canOperate || busy || !confirmCmd(label)) return;
    setBusy(action);
    try {
      await rcApi.generators.command(gen.id, action);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const flowNodes = [
    { label: "REDE", live: mainsLive, open: false },
    {
      label: `MCB\n${stateText(mcbKnown, gen.mcb)}`,
      live: mcbKnown && gen.mcb,
      open: mcbKnown && !gen.mcb,
    },
    {
      label: `GCB\n${stateText(gcbKnown, gen.gcb)}`,
      live: gcbKnown && gen.gcb,
      open: gcbKnown && !gen.gcb,
    },
    { label: "G", live: telemetry.running, open: false },
    { label: "LOAD", live: (telemetry.powerKw ?? 0) > 0, open: false },
  ];

  return (
    <article
      className={cn(
        "compact-generator-card",
        (gen.status === "online" || gen.status === "alerta") && "is-online",
        gen.status === "alerta" && "is-alert",
        gen.status === "offline" && "is-offline",
      )}
    >
      <div className="compact-identity">
        <div className="compact-identity-title">
          <div className="min-w-0">
            <h3>{gen.tag}</h3>
            <p>{gen.controller}</p>
          </div>
          <div className="flex items-center gap-1">
            <StatusPill status={gen.status} />
            <DeleteGeneratorButton id={gen.id} tag={gen.tag} />
          </div>
        </div>
        <p className="compact-mode-line">
          Modo: <b>{modeKnown ? gen.mode : "N/D"}</b>
        </p>
        <p className="compact-mode-line">
          Site: <b>{gen.site || "N/D"}</b>
        </p>
      </div>

      <CompactPowerGauge value={telemetry.powerKw} nominal={telemetry.nominalPower} />

      <div className="compact-flow-wrap">
        <div className="compact-flow-title">
          <span>Fluxo</span>
          <strong>
            {telemetry.frequency == null ? "N/D" : `${fmt(telemetry.frequency, 1)} Hz`}
          </strong>
        </div>
        <div className="compact-flow-line" aria-label="Fluxo elétrico compacto">
          {flowNodes.map((node, index) => (
            <div key={node.label} className="contents">
              <span
                className={cn(
                  "compact-flow-node whitespace-pre-line",
                  node.live && "is-live",
                  node.open && "is-open",
                )}
              >
                {node.label}
              </span>
              {index < flowNodes.length - 1 && (
                <i
                  className={cn(
                    "compact-flow-segment",
                    index === 0 && mainsLive && "is-live",
                    index === 1 && mainsLive && gen.mcb && "is-live",
                    index === 2 && telemetry.running && gen.gcb && "is-live",
                    index === 3 && (telemetry.powerKw ?? 0) > 0 && "is-live",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="compact-telemetry">
        <Metric label="RPM" value={telemetry.rpm == null ? "N/D" : fmt(telemetry.rpm, 0)} />
        <Metric
          label="PF"
          value={telemetry.powerFactor == null ? "N/D" : fmt(telemetry.powerFactor, 2)}
        />
        <Metric
          label="BAT"
          value={telemetry.battery == null ? "N/D" : `${fmt(telemetry.battery)} V`}
        />
        <Metric
          label="Óleo"
          value={telemetry.oil == null ? "N/D" : `${fmt(telemetry.oil, 2)} bar`}
          tone={toneTextClass(telemetry.tones.oil)}
        />
        <Metric
          label="Temp."
          value={telemetry.coolant == null ? "N/D" : `${fmt(telemetry.coolant, 0)} °C`}
          tone={toneTextClass(telemetry.tones.coolant)}
        />
        <Metric
          label="Comb."
          value={telemetry.fuel == null ? "N/D" : `${fmt(telemetry.fuel, 0)} ${telemetry.fuelUnit}`}
          tone={toneTextClass(telemetry.tones.fuel)}
        />
        <Metric
          label="Alt."
          value={telemetry.alternator == null ? "N/D" : `${fmt(telemetry.alternator)} V`}
          tone={toneTextClass(telemetry.tones.alternator)}
        />
        <Metric
          label="Manut."
          value={telemetry.maintenance == null ? "N/D" : `${fmt(telemetry.maintenance, 0)} h`}
          tone={toneTextClass(telemetry.tones.maintenance)}
        />
        <Metric
          label="Horas"
          value={telemetry.runHours == null ? "N/D" : `${fmt(telemetry.runHours)} h`}
        />
        <Metric
          label="L1-N"
          value={
            hasMetric(gen, "voltage_l1")
              ? `${fmt(gen.metrics?.["voltage_l1"] ?? gen.gen.l1, 0)} V`
              : "N/D"
          }
        />
      </div>

      <div className="compact-actions">
        <button
          type="button"
          className="compact-command start"
          disabled={!canOperate || busy !== null}
          onClick={() => void runCommand("start")}
        >
          {busy === "start" ? "..." : "START"}
        </button>
        <button
          type="button"
          className="compact-command stop"
          disabled={!canOperate || busy !== null}
          onClick={() => void runCommand("stop")}
        >
          {busy === "stop" ? "..." : "STOP"}
        </button>
        <Link to="/p/geradores/$id" params={{ id: gen.id }} className="compact-open-link">
          Abrir <ExternalLink className="size-3" />
        </Link>
      </div>
    </article>
  );
}
