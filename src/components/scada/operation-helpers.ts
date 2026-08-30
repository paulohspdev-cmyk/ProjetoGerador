import type { Generator } from "@/data/generators";

export function fmt(n: number, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d).replace(".", ",") : "N/D";
}

export function hasMetric(g: Generator, key: string) {
  return (g.availableMetrics ?? []).includes(key);
}

export function dateTime(epoch: number) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("pt-BR");
}

export function shortTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type LiveAlarm = {
  id: string;
  gen: string;
  site: string;
  severity: "falha" | "alarme" | "aviso";
  message: string;
  since: string;
  ack: boolean;
};

export function realAlarms(
  generators: Generator[],
  isAcked: (id: string, seed: boolean) => boolean,
): LiveAlarm[] {
  return generators.flatMap((g) => {
    const rows: Omit<LiveAlarm, "ack">[] = [];
    if (g.status === "offline") {
      rows.push({
        id: `COMM-${g.id}`,
        gen: g.tag,
        site: g.site,
        severity: "falha",
        message: g.lastError?.trim() || "Comunicação/telemetria indisponível",
        since: "estado atual",
      });
    } else if (g.status === "alerta") {
      rows.push({
        id: `SCADA-${g.id}`,
        gen: g.tag,
        site: g.site,
        severity: "alarme",
        message:
          g.lastError?.trim() || "Controlador reporta estado de alerta; causa específica N/D",
        since: "estado atual",
      });
    }
    return rows.map((row) => ({ ...row, ack: isAcked(row.id, false) }));
  });
}
