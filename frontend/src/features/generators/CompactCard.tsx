import { type ReactNode, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Battery, Clock3, Fuel, Gauge, RotateCw, Thermometer, Wrench, Zap } from "lucide-react";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import { generatorDisplayStatus, isGeneratorConnected, type Generator } from "@/data/generators";
import { cn } from "@/lib/utils";
import { GaugeNeedle } from "./GaugeNeedle";
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
    <div className="compact-card__metric flex min-w-0 items-center gap-0.5 text-[9px] leading-none">
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
        <GaugeNeedle
          cx={cx}
          cy={cy}
          radius={r}
          angle={angle}
          showPointer={hasPower && effectiveMax != null}
          groupClassName="compact-kw-pointer"
          pointerClassName="compact-kw-needle"
          hubClassName="compact-kw-hub"
        />
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
    powerFactor,
    nominalPower,
    currentL1,
    currentL2,
    currentL3,
  } = telemetry;

  const mainsL1 = metricNumber(gen, "mains_voltage_l1", gen.mains.l1);
  const mainsL2 = metricNumber(gen, "mains_voltage_l2", gen.mains.l2);
  const mainsL3 = metricNumber(gen, "mains_voltage_l3", gen.mains.l3);
  const mainsKnown =
    ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3"].some((key) =>
      hasFreshMetric(gen, key),
    ) || hasFreshMetric(gen, "mains_frequency");

  const genL1 = metricNumber(gen, "voltage_l1", gen.gen.l1);
  const genL2 = metricNumber(gen, "voltage_l2", gen.gen.l2);
  const genL3 = metricNumber(gen, "voltage_l3", gen.gen.l3);
  const genPowerFactorL1 = metricNumber(gen, "power_factor_l1", undefined);
  const genPowerFactorL2 = metricNumber(gen, "power_factor_l2", undefined);
  const genPowerFactorL3 = metricNumber(gen, "power_factor_l3", undefined);
  const genCurrentValues = [currentL1, currentL2, currentL3].filter(
    (value): value is number => value != null,
  );
  const currentKnown = genCurrentValues.length > 0;

  const electricalRows = useMemo(
    () => [
      {
        label: "MAINS",
        values: [
          { text: formatNumber(mainsKnown ? mainsL1 : null, 0), source: "mains", title: "L1-N" },
          { text: formatNumber(mainsKnown ? mainsL2 : null, 0), source: "mains", title: "L2-N" },
          { text: formatNumber(mainsKnown ? mainsL3 : null, 0), source: "mains", title: "L3-N" },
        ],
      },
      {
        label: "GEN",
        values: [
          { text: formatNumber(genL1, 0), source: "generator", title: "L1-N" },
          { text: formatNumber(genL2, 0), source: "generator", title: "L2-N" },
          { text: formatNumber(genL3, 0), source: "generator", title: "L3-N" },
        ],
      },
      {
        label: "Frequency",
        alignRight: true,
        values: [
          {
            text: formatNumber(mainsKnown ? mainsFrequency : null, 1),
            source: "mains",
            title: "MAINS",
          },
          { text: formatNumber(frequency, 1), source: "generator", title: "GEN" },
        ],
      },
      {
        label: "Power Factor",
        values: [
          { text: formatNumber(genPowerFactorL1, 2), source: "generator", title: "L1" },
          { text: formatNumber(genPowerFactorL2, 2), source: "generator", title: "L2" },
          { text: formatNumber(genPowerFactorL3, 2), source: "generator", title: "L3" },
        ],
      },
      {
        label: "Current (A)",
        values: [
          {
            text: formatNumber(currentKnown ? currentL1 : null, 0),
            source: "generator",
            title: "L1",
          },
          {
            text: formatNumber(currentKnown ? currentL2 : null, 0),
            source: "generator",
            title: "L2",
          },
          {
            text: formatNumber(currentKnown ? currentL3 : null, 0),
            source: "generator",
            title: "L3",
          },
        ],
      },
    ],
    [
      currentKnown,
      currentL1,
      currentL2,
      currentL3,
      frequency,
      genL1,
      genL2,
      genL3,
      genPowerFactorL1,
      genPowerFactorL2,
      genPowerFactorL3,
      mainsFrequency,
      mainsKnown,
      mainsL1,
      mainsL2,
      mainsL3,
    ],
  );

  return (
    <article
      data-power-factor={formatNumber(powerFactor, 2)}
      className={cn(
        "compact-card flex min-w-0 min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-1.5",
        connected && "border-online/55 [box-shadow:var(--glow-online)]",
        displayStatus === "alerta" && "border-alert/50",
        (displayStatus === "offline" || displayStatus === "stale") && "border-offline/40",
        !configured && "border-border",
      )}
    >
      <header className="compact-card__header flex shrink-0 items-start justify-between gap-1">
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

      <div className="compact-card__body mt-1 flex min-h-0 flex-1 items-start gap-1.5 overflow-hidden">
        <div className="compact-card__visuals flex w-[92px] shrink-0 flex-col gap-0.5">
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
          <div className="compact-card__metrics min-w-0 flex-1 space-y-0.5 overflow-hidden">
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
        <div className="compact-card__electrical mt-1 min-h-0 min-w-0 shrink overflow-hidden">
          <div className="compact-card__electrical-heading">ELECTRICAL</div>
          <div className="compact-card__electrical-rows">
            {electricalRows.map((row) => (
              <div key={row.label} className="compact-card__electrical-row">
                <span className="compact-card__electrical-label">{row.label}</span>
                <div
                  className={cn("compact-card__electrical-values", row.alignRight && "is-right")}
                >
                  {row.values.map((value, index) => (
                    <span
                      key={`${row.label}-${index}`}
                      title={value.title}
                      className={cn(
                        "num",
                        value.source === "generator" ? "text-online" : "text-foreground",
                      )}
                    >
                      {value.text}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {gen.telemetryStale && (
        <p className="compact-card__stale mt-1 text-[10px] font-semibold text-alert">
          Telemetria expirada — valores ocultados
        </p>
      )}
    </article>
  );
}
