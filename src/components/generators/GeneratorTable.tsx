import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { readGeneratorTelemetry, toneTextClass } from "./generator-health";
import { fmt, formatGeneratorMetric, hasMetric } from "./generator-metrics";
import { StatusPill } from "./StatusPill";

function modeClass(mode: Generator["mode"], known: boolean) {
  if (!known) return "text-muted-foreground";
  return mode === "AUTO"
    ? "text-online"
    : mode === "MANUAL"
      ? "text-chart-2"
      : "text-muted-foreground";
}

function displayName(gen: Generator) {
  return gen.name?.trim() || gen.tag;
}

function OpenLink({ id, className }: { id: string; className?: string }) {
  return (
    <Link
      to="/p/geradores/$id"
      params={{ id }}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10",
        className,
      )}
    >
      Abrir <ExternalLink className="size-3" />
    </Link>
  );
}

function BreakerValue({ known, closed }: { known: boolean; closed: boolean }) {
  return (
    <span
      className={cn(
        "num font-bold",
        !known ? "text-muted-foreground" : closed ? "text-online" : "text-alert",
      )}
    >
      {!known ? "N/D" : closed ? "FECHADO" : "ABERTO"}
    </span>
  );
}

function MobileRow({ items }: { items: Generator[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {items.map((gen) => {
        const telemetry = readGeneratorTelemetry(gen);
        const modeKnown = hasMetric(gen, "controller_mode_raw");
        const mcbKnown = hasMetric(gen, "mcb_closed");
        const gcbKnown = hasMetric(gen, "gcb_closed");

        const details = [
          ["Modo", modeKnown ? gen.mode : "N/D", modeClass(gen.mode, modeKnown)],
          ["RPM", telemetry.rpm == null ? "N/D" : fmt(telemetry.rpm, 0), ""],
          [
            "Frequência",
            telemetry.frequency == null ? "N/D" : `${fmt(telemetry.frequency, 1)} Hz`,
            "",
          ],
          ["Potência", telemetry.powerKw == null ? "N/D" : `${fmt(telemetry.powerKw, 0)} kW`, ""],
          ["PF", telemetry.powerFactor == null ? "N/D" : fmt(telemetry.powerFactor, 2), ""],
          ["Bateria", telemetry.battery == null ? "N/D" : `${fmt(telemetry.battery)} V`, ""],
          [
            "Pressão óleo",
            telemetry.oil == null ? "N/D" : `${fmt(telemetry.oil, 2)} bar`,
            toneTextClass(telemetry.tones.oil),
          ],
          [
            "Coolant",
            telemetry.coolant == null ? "N/D" : `${fmt(telemetry.coolant, 0)} °C`,
            toneTextClass(telemetry.tones.coolant),
          ],
          [
            "Combustível",
            telemetry.fuel == null ? "N/D" : `${fmt(telemetry.fuel, 0)} ${telemetry.fuelUnit}`,
            toneTextClass(telemetry.tones.fuel),
          ],
          [
            "Alternador",
            telemetry.alternator == null ? "N/D" : `${fmt(telemetry.alternator)} V`,
            toneTextClass(telemetry.tones.alternator),
          ],
          [
            "Manutenção",
            telemetry.maintenance == null ? "N/D" : `${fmt(telemetry.maintenance, 0)} h`,
            toneTextClass(telemetry.tones.maintenance),
          ],
          ["Run Hours", telemetry.runHours == null ? "N/D" : `${fmt(telemetry.runHours)} h`, ""],
        ] as const;

        return (
          <article key={gen.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold">{displayName(gen)}</h3>
                <p className="truncate text-[11px] text-muted-foreground">
                  {gen.tag} · {gen.controller} · {gen.site}
                </p>
              </div>
              <StatusPill status={gen.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              {details.map(([label, value, tone]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn("num font-semibold", tone)}>{value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-muted-foreground">MCB</dt>
                <dd>
                  <BreakerValue known={mcbKnown} closed={gen.mcb} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">GCB</dt>
                <dd>
                  <BreakerValue known={gcbKnown} closed={gen.gcb} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gen L1-N</dt>
                <dd className="num">
                  {formatGeneratorMetric(gen, "voltage_l1", gen.gen.l1, "V", 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gen L2-N</dt>
                <dd className="num">
                  {formatGeneratorMetric(gen, "voltage_l2", gen.gen.l2, "V", 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gen L3-N</dt>
                <dd className="num">
                  {formatGeneratorMetric(gen, "voltage_l3", gen.gen.l3, "V", 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gen L1-L2</dt>
                <dd className="num">
                  {formatGeneratorMetric(gen, "voltage_l1_l2", gen.gen.l12, "V", 0)}
                </dd>
              </div>
            </dl>

            <OpenLink id={gen.id} className="mt-3 h-9 w-full text-[12px] font-semibold" />
            <div className="mt-1 flex justify-end">
              <DeleteGeneratorButton id={gen.id} tag={gen.tag} />
            </div>
          </article>
        );
      })}
      {items.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Nenhum gerador encontrado.</p>
      )}
    </div>
  );
}

const headers = [
  "Gerador",
  "Status",
  "Modo",
  "RPM",
  "Hz",
  "kW",
  "PF",
  "BAT",
  "Óleo",
  "Coolant",
  "Combustível",
  "Alternador",
  "Manut.",
  "Horas",
  "MCB",
  "GCB",
  "G L1-N",
  "G L2-N",
  "G L3-N",
  "G L1-L2",
  "",
];

export function GeneratorTable({ items }: { items: Generator[] }) {
  return (
    <>
      <MobileRow items={items} />
      <div className="scroll-slim hidden h-full overflow-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full min-w-[2080px] border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border bg-secondary/60 text-[9px] uppercase tracking-wide text-muted-foreground">
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((gen) => {
              const telemetry = readGeneratorTelemetry(gen);
              const modeKnown = hasMetric(gen, "controller_mode_raw");
              const mcbKnown = hasMetric(gen, "mcb_closed");
              const gcbKnown = hasMetric(gen, "gcb_closed");

              return (
                <tr
                  key={gen.id}
                  className="border-b border-border/60 transition-colors hover:bg-secondary/30"
                >
                  <td className="px-2 py-2">
                    <div className="max-w-44 truncate font-bold">{displayName(gen)}</div>
                    <div className="max-w-44 truncate text-[9px] text-muted-foreground">
                      {gen.tag} · {gen.controller} · {gen.site}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill status={gen.status} />
                  </td>
                  <td className={cn("num px-2 py-2 font-bold", modeClass(gen.mode, modeKnown))}>
                    {modeKnown ? gen.mode : "N/D"}
                  </td>
                  <td className="num px-2 py-2">
                    {telemetry.rpm == null ? "N/D" : fmt(telemetry.rpm, 0)}
                  </td>
                  <td className="num px-2 py-2">
                    {telemetry.frequency == null ? "N/D" : fmt(telemetry.frequency, 1)}
                  </td>
                  <td className="num px-2 py-2 font-bold">
                    {telemetry.powerKw == null ? "N/D" : fmt(telemetry.powerKw, 0)}
                  </td>
                  <td className="num px-2 py-2">
                    {telemetry.powerFactor == null ? "N/D" : fmt(telemetry.powerFactor, 2)}
                  </td>
                  <td className="num px-2 py-2">
                    {telemetry.battery == null ? "N/D" : `${fmt(telemetry.battery)} V`}
                  </td>
                  <td className={cn("num px-2 py-2", toneTextClass(telemetry.tones.oil))}>
                    {telemetry.oil == null ? "N/D" : `${fmt(telemetry.oil, 2)} bar`}
                  </td>
                  <td className={cn("num px-2 py-2", toneTextClass(telemetry.tones.coolant))}>
                    {telemetry.coolant == null ? "N/D" : `${fmt(telemetry.coolant, 0)} °C`}
                  </td>
                  <td className={cn("num px-2 py-2", toneTextClass(telemetry.tones.fuel))}>
                    {telemetry.fuel == null
                      ? "N/D"
                      : `${fmt(telemetry.fuel, 0)} ${telemetry.fuelUnit}`}
                  </td>
                  <td className={cn("num px-2 py-2", toneTextClass(telemetry.tones.alternator))}>
                    {telemetry.alternator == null ? "N/D" : `${fmt(telemetry.alternator)} V`}
                  </td>
                  <td className={cn("num px-2 py-2", toneTextClass(telemetry.tones.maintenance))}>
                    {telemetry.maintenance == null ? "N/D" : `${fmt(telemetry.maintenance, 0)} h`}
                  </td>
                  <td className="num px-2 py-2">
                    {telemetry.runHours == null ? "N/D" : `${fmt(telemetry.runHours)} h`}
                  </td>
                  <td className="px-2 py-2">
                    <BreakerValue known={mcbKnown} closed={gen.mcb} />
                  </td>
                  <td className="px-2 py-2">
                    <BreakerValue known={gcbKnown} closed={gen.gcb} />
                  </td>
                  <td className="num px-2 py-2">
                    {formatGeneratorMetric(gen, "voltage_l1", gen.gen.l1, "V", 0)}
                  </td>
                  <td className="num px-2 py-2">
                    {formatGeneratorMetric(gen, "voltage_l2", gen.gen.l2, "V", 0)}
                  </td>
                  <td className="num px-2 py-2">
                    {formatGeneratorMetric(gen, "voltage_l3", gen.gen.l3, "V", 0)}
                  </td>
                  <td className="num px-2 py-2">
                    {formatGeneratorMetric(gen, "voltage_l1_l2", gen.gen.l12, "V", 0)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      <OpenLink id={gen.id} className="px-2 py-1 text-[10px] font-semibold" />
                      <DeleteGeneratorButton id={gen.id} tag={gen.tag} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum gerador encontrado.
          </p>
        )}
      </div>
    </>
  );
}
