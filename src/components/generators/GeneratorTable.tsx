import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { Generator } from "@/data/generators";
import { StatusPill } from "./StatusPill";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import { cn } from "@/lib/utils";

function fmt(n: number, digits = 1) {
  return n.toFixed(digits).replace(".", ",");
}

function modeClass(mode: Generator["mode"]) {
  return mode === "AUTO"
    ? "text-online"
    : mode === "MANUAL"
      ? "text-chart-2"
      : "text-muted-foreground";
}

function maintClass(hours: number) {
  return hours > 0 && hours < 80 ? "text-alert" : undefined;
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

function MobileRow({ items }: { items: Generator[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {items.map((g) => (
        <article key={g.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold">{g.tag}</h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {g.controller} · {g.site}
              </p>
            </div>
            <StatusPill status={g.status} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div>
              <dt className="text-muted-foreground">Modo</dt>
              <dd className={cn("num font-bold", modeClass(g.mode))}>{g.mode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bateria</dt>
              <dd className="num">{g.battery ? `${fmt(g.battery)} V` : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Freq.</dt>
              <dd className="num">{`${fmt(g.frequency ?? 0)} Hz`}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Carga</dt>
              <dd className="num">{g.load} kW</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Horas trab.</dt>
              <dd className="num">{fmt(g.runHours)} h</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Manutenção</dt>
              <dd className={cn("num", maintClass(g.maintenance))}>{fmt(g.maintenance, 0)} h</dd>
            </div>
          </dl>

          <OpenLink id={g.id} className="mt-3 h-10 w-full text-[12px] font-semibold" />
          <div className="mt-1 flex justify-end">
            <DeleteGeneratorButton id={g.id} tag={g.tag} />
          </div>
        </article>
      ))}
      {items.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Nenhum gerador encontrado.</p>
      )}
    </div>
  );
}

export function GeneratorTable({ items }: { items: Generator[] }) {
  return (
    <>
      <MobileRow items={items} />

      <div className="scroll-slim hidden h-full overflow-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              {[
                "Gerador",
                "Controladora",
                "Site",
                "Status",
                "Modo",
                "Bateria",
                "Freq.",
                "Carga",
                "Horas trab.",
                "Manutenção",
                "",
              ].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-b border-border/60 transition-colors hover:bg-secondary/30">
                <td className="px-3 py-3 font-bold">{g.tag}</td>
                <td className="px-3 py-3 text-muted-foreground">{g.controller}</td>
                <td className="px-3 py-3 text-muted-foreground">{g.site}</td>
                <td className="px-3 py-3">
                  <StatusPill status={g.status} />
                </td>
                <td className={cn("num px-3 py-3 font-bold", modeClass(g.mode))}>{g.mode}</td>
                <td className="num px-3 py-3">{g.battery ? `${fmt(g.battery)} V` : "—"}</td>
                <td className="num px-3 py-3">{`${fmt(g.frequency ?? 0)} Hz`}</td>
                <td className="num px-3 py-3">{g.load} kW</td>
                <td className="num px-3 py-3">{fmt(g.runHours)} h</td>
                <td className={cn("num px-3 py-3", maintClass(g.maintenance))}>{fmt(g.maintenance, 0)} h</td>
                <td className="px-3 py-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <OpenLink id={g.id} className="px-2 py-1 text-[11px] font-semibold" />
                    <DeleteGeneratorButton id={g.id} tag={g.tag} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum gerador encontrado.</p>
        )}
      </div>
    </>
  );
}
