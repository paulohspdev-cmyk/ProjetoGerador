import { type ReactNode, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Battery, Clock3, Fuel, Gauge, RotateCw, Thermometer, Wrench, Zap } from "lucide-react";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import { generatorDisplayStatus, isGeneratorConnected, type Generator } from "@/data/generators";
import { cn } from "@/lib/utils";
import { readGeneratorTelemetry } from "./generator-health";
import { displayGeneratorName, hasFreshMetric, metricNumber } from "./generator-metrics";
import "./compact-card.css";

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUnit(value: number | null | undefined, unit: string, digits = 0) {
  const text = formatNumber(value, digits);
  return text === "—" ? text : `${text} ${unit}`;
}

function autonomyText(hours: number | null) {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return "N/D";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

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
    <div className="flex min-w-0 items-center gap-0.5 text-[9px] leading-none">
      <span className="grid size-2.5 shrink-0 place-items-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className={cn("num shrink-0 font-semibold", tone ?? "text-foreground")}>{value}</span>
    </div>
  );
}

function CompactKwGauge({
  powerKw,
  nominalKw,
}: {
  powerKw: number | null;
  nominalKw: number | null;
}) {
  const hasPower = powerKw != null && Number.isFinite(powerKw);
  const hasNominal = nominalKw != null && Number.isFinite(nominalKw) && nominalKw > 0;
  const safePower = hasPower ? Math.max(0, powerKw) : 0;
  const fallbackMax = hasPower
    ? safePower <= 50
      ? 50
      : safePower <= 100
        ? 100
        : safePower <= 250
          ? 250
          : safePower <= 500
            ? 500
            : safePower <= 1000
              ? 1000
              : Math.ceil(safePower / 500) * 500
    : null;
  const effectiveMax = hasNominal ? nominalKw : fallbackMax;
  const fraction =
    hasPower && effectiveMax != null ? Math.min(1, Math.max(0, safePower / effectiveMax)) : 0;
  const angle = fraction * 180 - 90;
  const valueLabel = hasPower ? Math.round(powerKw).toLocaleString("pt-BR") : "—";
  const cx = 70;
  const cy = 62;
  const r = 48;
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const maxLabel = effectiveMax != null ? Math.round(effectiveMax).toLocaleString("pt-BR") : "—";

  return (
    <div className="compact-kw-gauge" aria-label="Potência ativa">
      <svg viewBox="0 0 140 108" className="compact-kw-svg" overflow="visible">
        <path className="compact-kw-base" pathLength="100" d={arc} />
        <path
          className="compact-kw-zone is-green"
          pathLength="100"
          strokeDasharray="70 30"
          d={arc}
        />
        <path
          className="compact-kw-zone is-yellow"
          pathLength="100"
          strokeDasharray="20 80"
          strokeDashoffset="-70"
          d={arc}
        />
        <path
          className="compact-kw-zone is-red"
          pathLength="100"
          strokeDasharray="10 90"
          strokeDashoffset="-90"
          d={arc}
        />
        <text x={cx - r} y={cy + 22} textAnchor="middle" className="compact-kw-scale">
          0
        </text>
        <text x={cx + r} y={cy + 22} textAnchor="middle" className="compact-kw-scale">
          {maxLabel}
        </text>
        {hasPower && effectiveMax != null ? (
          <g className="compact-kw-pointer" transform={`rotate(${angle} ${cx} ${cy})`}>
            <path
              className="compact-kw-needle"
              d={`M${cx} ${cy - r + 6} L${cx + 3} ${cy - 6} L${cx - 3} ${cy - 6} Z`}
            />
          </g>
        ) : null}
        <circle cx={cx} cy={cy} r="3.5" className="compact-kw-hub" />
        <text x={cx} y={cy - 14} textAnchor="middle" className="compact-kw-unit">
          KW
        </text>
        <text
          x={cx}
          y={cy + 36}
          textAnchor="middle"
          className={cn("compact-kw-value", hasPower && "is-live")}
        >
          {valueLabel}
        </text>
      </svg>
    </div>
  );
}

export function CompactCard({ gen }: { gen: Generator }) {
  const displayStatus = generatorDisplayStatus(gen);
  const configured = displayStatus !== "nao_configurado";
  const connected = isGeneratorConnected(gen);
  const modeKnown = hasFreshMetric(gen, "controller_mode_raw");
  const src = controllerImageSrc(gen.controller);

  const telemetry = readGeneratorTelemetry(gen);
  const {
    rpm,
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
    frequency,
    mainsFrequency,
    powerKw,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
  } = telemetry;

  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL12 = metricNumber(gen, "mains_voltage_l1_l2", gen.mains.l12);
  const mainsCurrent = metricNumber(gen, "mains_current_l1", undefined);
  const mainsKnown =
    ["mains_voltage_l1", "mains_voltage_l1_l2"].some((key) => hasFreshMetric(gen, key)) ||
    hasFreshMetric(gen, "mains_frequency");

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL12 = metricNumber(gen, "voltage_l1_l2", gen.gen.l12);
  const genCurrentValues = [currentL1, currentL2, currentL3].filter(
    (value): value is number => value != null,
  );
  const genCurrent =
    genCurrentValues.length > 0
      ? genCurrentValues.reduce((sum, value) => sum + value, 0) / genCurrentValues.length
      : null;

  const electricalRows = useMemo(
    () => [
      {
        label: "L1-N",
        mains: formatUnit(mainsKnown ? mainsL1 : null, "V"),
        generator: formatUnit(genL1, "V"),
      },
      {
        label: "L1-L2",
        mains: formatUnit(mainsKnown ? mainsL12 : null, "V"),
        generator: formatUnit(genL12, "V"),
      },
      {
        label: "Frequency",
        mains: formatUnit(mainsKnown ? mainsFrequency : null, "Hz", 1),
        generator: formatUnit(frequency, "Hz", 1),
      },
      {
        label: "Current (A)",
        mains: formatUnit(mainsCurrent, "A", 0),
        generator: formatUnit(genCurrent, "A", 0),
      },
    ],
    [
      frequency,
      genCurrent,
      genL1,
      genL12,
      mainsCurrent,
      mainsFrequency,
      mainsKnown,
      mainsL1,
      mainsL12,
    ],
  );

  return (
    <article
      className={cn(
        "flex min-w-0 min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-1.5",
        connected && "border-online/55 [box-shadow:var(--glow-online)]",
        displayStatus === "alerta" && "border-alert/50",
        (displayStatus === "offline" || displayStatus === "stale") && "border-offline/40",
        !configured && "border-border",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-1">
        <div className="min-w-0">
          <h3 className="truncate text-[12px] font-bold leading-tight">
            {displayGeneratorName(gen)}
          </h3>
          <p className="truncate text-[9px] text-muted-foreground">
            {gen.tag} · {gen.controller}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <span
            className={cn(
              "num rounded-sm border px-1 py-px text-[8px] font-bold tracking-wider",
              modeKnown && gen.mode === "AUTO"
                ? "border-online/40 bg-online/15 text-online"
                : modeKnown && gen.mode === "MANUAL"
                  ? "border-chart-2/40 bg-chart-2/15 text-chart-2"
                  : modeKnown && gen.mode === "TESTE"
                    ? "border-alert/40 bg-alert/15 text-alert"
                    : "border-border bg-muted text-muted-foreground",
            )}
          >
            {modeKnown ? gen.mode : "N/D"}
          </span>
          {configured ? (
            <Link
              to="/p/geradores/$id"
              params={{ id: gen.id }}
              aria-label={`Abrir ${displayGeneratorName(gen)}`}
              title="Abrir gerador"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ExternalLink className="size-3" />
            </Link>
          ) : (
            <span
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/40"
              title="Não configurado"
              aria-hidden
            >
              <ExternalLink className="size-3" />
            </span>
          )}
        </div>
      </header>

      <div className="mt-1 flex min-h-0 flex-1 items-start gap-1.5 overflow-hidden">
        <div className="flex w-[92px] shrink-0 flex-col gap-0.5">
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
          {configured ? <CompactKwGauge powerKw={powerKw} nominalKw={nominalPower} /> : null}
        </div>

        {configured ? (
          <div className="min-w-0 flex-1 space-y-0.5 overflow-y-auto scroll-slim">
            <Metric
              icon={<RotateCw className="size-2.5" />}
              label="RPM"
              value={formatUnit(rpm, "rpm", 0)}
            />
            <Metric
              icon={<Gauge className="size-2.5" />}
              label="Oil Pressure"
              value={formatUnit(oil, oilUnit || "bar", 1)}
            />
            <Metric
              icon={<Thermometer className="size-2.5" />}
              label="Coolant Temp."
              value={formatUnit(coolant, coolantUnit || "°C", 0)}
            />
            <Metric
              icon={<Fuel className="size-2.5" />}
              label="Fuel Level"
              value={formatUnit(fuel, fuelUnit || "%", 0)}
            />
            <Metric
              icon={<Battery className="size-2.5" />}
              label="Battery Voltage"
              value={formatUnit(battery, "V", 1)}
            />
            <Metric
              icon={<Zap className="size-2.5" />}
              label="Alternator"
              value={formatUnit(alternator, "V", 1)}
            />
            <Metric
              icon={<Clock3 className="size-2.5" />}
              label="Run Hours"
              value={formatUnit(runHours, "h", 1)}
            />
            <Metric
              icon={<Wrench className="size-2.5" />}
              label="Maintenance"
              value={formatUnit(maintenance, "h", 0)}
            />
            <Metric
              icon={<Fuel className="size-2.5" />}
              label="Autonomy"
              value={autonomyText(autonomyHours)}
            />
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
            Este gerador ainda não foi configurado.
          </p>
        )}
      </div>

      {configured && (
        <div className="mt-1 min-h-0 min-w-0 shrink overflow-hidden">
          <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_36px_36px] items-end gap-0.5 text-[8px] font-bold tracking-wide text-muted-foreground">
            <span className="text-[9px] font-black text-foreground">ELECTRICAL</span>
            <span className="text-right">MAINS</span>
            <span className="text-right">GEN</span>
          </div>
          <div className="space-y-0">
            {electricalRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,1fr)_36px_36px] items-center gap-0.5 border-b border-border/50 py-px text-[9px] leading-tight last:border-b-0"
              >
                <span className="truncate text-muted-foreground">{row.label}</span>
                <span className="num text-right font-semibold text-foreground">{row.mains}</span>
                <span
                  className={cn(
                    "num text-right font-semibold",
                    row.generator !== "—" ? "text-online" : "text-foreground",
                  )}
                >
                  {row.generator}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gen.telemetryStale && (
        <p className="mt-1 text-[10px] font-semibold text-alert">
          Telemetria expirada — valores ocultados
        </p>
      )}
    </article>
  );
}
