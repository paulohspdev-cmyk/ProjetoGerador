import { type ReactNode } from "react";
import { Clock, ExternalLink, Network, Signal } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { StatusPill } from "./StatusPill";
import { displayGeneratorName, fmt, hasMetric } from "./generator-metrics";
import { IconBattery, IconBolt, IconRunHours } from "./scada-icons";
import "./compact-card.css";

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-[10px] leading-none">
      <span className="grid size-3 shrink-0 place-items-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className={cn("num shrink-0 font-semibold", tone ?? "text-foreground")}>{value}</span>
    </div>
  );
}

export function CompactCard({ gen }: { gen: Generator }) {
  const configured = gen.status !== "nao_configurado";
  const connected = gen.status === "online" || gen.status === "alerta";
  const battKnown = hasMetric(gen, "battery_voltage") && gen.battery != null;
  const freqKnown = hasMetric(gen, "frequency") && gen.frequency != null;
  const hoursKnown = hasMetric(gen, "run_hours");
  const maintKnown = hasMetric(gen, "maintenance_hours");
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const src = controllerImageSrc(gen.controller);
  const lat = gen.latency != null ? `${gen.latency} ms` : "N/D";

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card p-2.5",
        connected && "border-online/55 [box-shadow:var(--glow-online)]",
        gen.status === "alerta" && "border-alert/50",
        gen.status === "offline" && "border-offline/40",
        !configured && "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-bold leading-tight">
            {displayGeneratorName(gen)}
          </h3>
          <p className="truncate text-[10px] text-muted-foreground">
            {gen.tag} · {gen.controller}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <StatusPill status={gen.status} />
          <DeleteGeneratorButton id={gen.id} tag={gen.tag} />
        </div>
      </header>

      <div className="mt-2 flex items-start gap-2">
        <div className="controller-image-area" aria-hidden>
          <img
            className="controller-image"
            src={src}
            alt={gen.controller}
            onError={(event) => {
              event.currentTarget.src = CONTROLLER_IMAGE_FALLBACK;
            }}
          />
        </div>

        {configured ? (
          <div className="min-w-0 flex-1 space-y-1">
            <Metric
              icon={<Network className="size-3" />}
              label="Endpoint"
              value={gen.ip || "N/D"}
            />
            <Metric
              icon={<IconBattery size={12} />}
              label="Bateria"
              value={battKnown ? `${fmt(gen.battery!)} V` : "N/D"}
            />
            <Metric
              icon={<IconBolt size={12} />}
              label="Frequência"
              value={freqKnown ? `${fmt(gen.frequency!, 2)} Hz` : "N/D"}
              tone={freqKnown && connected ? "text-online" : "text-muted-foreground"}
            />
            <Metric
              icon={<IconRunHours size={12} />}
              label="Tempo operação"
              value={hoursKnown ? `${fmt(gen.runHours)} h` : "N/D"}
            />
            <Metric
              icon={<Clock className="size-3" />}
              label="Manutenção"
              value={maintKnown ? `${fmt(gen.maintenance, 0)} h` : "N/D"}
            />
            <Metric icon={<Signal className="size-3" />} label="Latência" value={lat} />
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
            Este gerador ainda não foi configurado.
          </p>
        )}
      </div>

      {configured && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          Modo
          <span
            className={cn(
              "num font-bold",
              modeKnown && gen.mode === "AUTO"
                ? "text-online"
                : modeKnown && gen.mode === "MANUAL"
                  ? "text-chart-2"
                  : "text-muted-foreground",
            )}
          >
            {modeKnown ? gen.mode : "N/D"}
          </span>
        </p>
      )}

      {gen.telemetryStale && (
        <p className="mt-1 text-[10px] font-semibold text-alert">
          Valores da última leitura conhecida
        </p>
      )}

      {configured ? (
        <Link
          to="/p/geradores/$id"
          params={{ id: gen.id }}
          className="mt-2 flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background/60 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Abrir gerador <ExternalLink className="size-3" />
        </Link>
      ) : (
        <span className="mt-2 flex h-8 cursor-not-allowed items-center justify-center rounded-md border border-border bg-secondary/40 text-[11px] font-semibold text-muted-foreground">
          Não configurado
        </span>
      )}
    </article>
  );
}
