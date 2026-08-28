import { Activity, AlertTriangle, Gauge, PowerOff, Server, XCircle } from "lucide-react";

import { useGenerators } from "./GeneratorsProvider";

export function KpiStrip() {
  const { generators } = useGenerators();
  const total = generators.length;
  const count = (s: string) => generators.filter((g) => g.status === s).length;
  const pct = (n: number) => `${total ? ((n / total) * 100).toFixed(1).replace(".", ",") : "0,0"}% do total`;
  const latencyRows = generators.filter((g) => g.latency != null && Number.isFinite(g.latency));
  const avgLatency = latencyRows.length
    ? Math.round(latencyRows.reduce((sum, g) => sum + Number(g.latency), 0) / latencyRows.length)
    : null;

  const cards = [
    { icon: Server, label: "Total de Geradores", value: total, sub: total ? "100% do parque" : "Parque vazio", tone: "text-foreground" },
    { icon: Activity, label: "Online", value: count("online"), sub: pct(count("online")), tone: "text-online" },
    { icon: AlertTriangle, label: "Alerta", value: count("alerta"), sub: pct(count("alerta")), tone: "text-alert" },
    { icon: XCircle, label: "Offline", value: count("offline"), sub: pct(count("offline")), tone: "text-offline" },
    {
      icon: PowerOff,
      label: "Não configurados",
      value: count("nao_configurado"),
      sub: pct(count("nao_configurado")),
      tone: "text-muted-foreground",
    },
    {
      icon: Gauge,
      label: "Latência média",
      value: avgLatency == null ? "N/D" : avgLatency,
      sub: latencyRows.length ? `${latencyRows.length} medição(ões) disponível(is)` : "Sem canal/medição de latência",
      tone: "text-foreground",
      unit: avgLatency == null ? "" : "ms",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6 3xl:gap-3">
      {cards.map((c) => (
        <div key={c.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2.5 sm:gap-3 sm:p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary sm:size-9">
            <c.icon className={`size-4 ${c.tone}`} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">{c.label}</p>
            <p className={`num text-lg font-bold leading-tight sm:text-xl ${c.tone}`}>
              {c.value}
              {c.unit && <span className="ml-1 text-[11px] font-normal">{c.unit}</span>}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
