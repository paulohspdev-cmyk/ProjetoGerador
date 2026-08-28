import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  BellRing,
  Fuel,
  Gauge,
  HeartPulse,
  MapPin,
  Radio,
  Router,
  Signal,
  Timer,
  Wrench,
  Zap,
} from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import {
  buildAlarms,
  buildGateways,
  buildModems,
  channels,
  eventLog,
  fmt,
  gensBySite,
  health,
  spark,
} from "@/data/scada";
import { useScadaOps } from "./ScadaOpsProvider";
import { cn } from "@/lib/utils";
import { Panel, Pill, ScreenBody, Tone, Trend } from "./kit";

function ModuleLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/p/$slug" params={{ slug }} className="text-[11px] text-muted-foreground hover:text-foreground">
      {children}
    </Link>
  );
}

function rssiLevel(rssi: number, online: boolean) {
  if (!online) return 0;
  if (rssi >= -70) return 4;
  if (rssi >= -85) return 3;
  if (rssi >= -100) return 2;
  return 1;
}

function RssiBars({ rssi, online }: { rssi: number; online: boolean }) {
  const level = rssiLevel(rssi, online);
  return (
    <div className="flex items-end gap-0.5" title={`${rssi} dBm`}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn(
            "w-1 rounded-sm",
            n === 1 && "h-1.5",
            n === 2 && "h-2.5",
            n === 3 && "h-3.5",
            n === 4 && "h-4.5",
            n <= level ? (level <= 1 ? "bg-offline" : level === 2 ? "bg-alert" : "bg-online") : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function Bar({
  value,
  max,
  tone = "bg-online",
}: {
  value: number;
  max: number;
  tone?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function OverviewDashboard() {
  const { generators } = useGenerators();
  const { isAcked, workOrders, agenda } = useScadaOps();
  const configured = generators.filter((g) => g.status !== "nao_configurado");
  const running = generators.filter((g) => g.status === "online");
  const load = generators.reduce((s, g) => s + g.load, 0);
  const capacity = configured.length * 600;
  const loadPct = capacity ? Math.round((load / capacity) * 100) : 0;
  const alarmRows = buildAlarms(generators).map((a) => ({ ...a, ack: isAcked(a.id, a.ack) }));
  const activeAlarms = alarmRows.filter((a) => !a.ack);
  const criticalAlarms = alarmRows.filter((a) => a.severity === "falha");
  const modems = buildModems(generators);
  const gateways = buildGateways(generators);
  const onlineModems = modems.filter((m) => m.status === "Online");
  const offlineModems = modems.filter((m) => m.status === "Offline");
  const avgRssi = onlineModems.length
    ? Math.round(onlineModems.reduce((s, m) => s + m.rssi, 0) / onlineModems.length)
    : 0;
  const avgFuel = Math.round(configured.reduce((s, g) => s + g.fuelLevel, 0) / configured.length);
  const lowFuel = configured.filter((g) => g.fuelLevel < 40);
  const lowBatt = configured.filter((g) => (g.battery ?? 99) < 12);
  const dueMaint = configured
    .slice()
    .sort((a, b) => a.maintenance - b.maintenance)
    .slice(0, 5);
  const criticalHours = configured.filter((g) => g.maintenance < 120).length;
  const urgentWo = workOrders.filter((w) => w.status === "Urgente");
  const channelsOk = channels.filter((c) => c.status === "OK").length;
  const onMains = configured.filter((g) => g.mcb).length;
  const onGen = configured.filter((g) => g.gcb).length;
  const latencies = configured.map((g) => g.latency).filter((n): n is number => n != null);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;
  const availability = configured.length
    ? ((configured.filter((g) => g.status !== "offline").length / configured.length) * 100)
        .toFixed(1)
        .replace(".", ",")
    : "0,0";
  const sites = gensBySite(generators);
  const maxSiteLoad = Math.max(...sites.map((s) => s.load), 1);
  const healthOk = health.filter((h) => h.status === "OK").length;

  const kpis = [
    { icon: Gauge, label: "Carga total", value: `${load} kW`, sub: `${loadPct}% da capacidade`, tone: "text-online" },
    { icon: BellRing, label: "Alarmes ativos", value: activeAlarms.length, sub: `${criticalAlarms.length} falha`, tone: "text-alert" },
    { icon: Router, label: "Modems offline", value: offlineModems.length, sub: `${onlineModems.length}/${modems.length} online`, tone: "text-offline" },
    { icon: Zap, label: "Em geração", value: running.length, sub: `${onGen} GCB · ${onMains} MCB`, tone: "text-online" },
    { icon: Fuel, label: "Combustível médio", value: `${avgFuel} %`, sub: `${lowFuel.length} abaixo de 40%`, tone: lowFuel.length ? "text-alert" : "text-online" },
    { icon: BatteryCharging, label: "Baterias baixas", value: lowBatt.length, sub: "< 12,0 V", tone: lowBatt.length ? "text-alert" : "text-online" },
    { icon: Wrench, label: "OS urgentes", value: urgentWo.length, sub: `${criticalHours} horímetros < 120 h`, tone: "text-alert" },
    { icon: Radio, label: "Canais SCADA", value: `${channelsOk}/${channels.length}`, sub: `${avgLatency} ms latência`, tone: channelsOk === channels.length ? "text-online" : "text-alert" },
  ];

  return (
    <ScreenBody>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Painel operacional</p>
          <p className="text-sm text-muted-foreground">
            {sites.length} sites · {generators.length} geradores · disponibilidade {availability}% · RSSI médio {avgRssi} dBm
          </p>
        </div>
        <p className="num text-[11px] text-muted-foreground">Última atualização 14:32:18</p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map((c) => (
          <div key={c.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
              <c.icon className={cn("size-4", c.tone)} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-muted-foreground">{c.label}</p>
              <p className={cn("num text-lg font-bold leading-tight", c.tone)}>{c.value}</p>
              <p className="truncate text-[10px] text-muted-foreground">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title="Carga do parque — 24 h"
          className="lg:col-span-2"
          actions={
            <ModuleLink slug="energia-carga">Energia →</ModuleLink>
          }
        >
          <Trend data={spark(7, 24, Math.max(load, 200), 280)} unit="kW" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-md border border-border p-2">
              <p className="text-muted-foreground">Pico</p>
              <p className="num text-base font-bold text-online">{load + 214} kW</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="text-muted-foreground">Média</p>
              <p className="num text-base font-bold">{Math.round(load * 0.72)} kW</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="text-muted-foreground">Disponibilidade</p>
              <p className="num text-base font-bold text-online">{availability}%</p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Alarmes ativos"
          actions={
            <ModuleLink slug="alarmes">Ver todos →</ModuleLink>
          }
        >
          <ul className="space-y-2">
            {activeAlarms.slice(0, 6).map((a) => (
              <li key={a.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold">{a.gen}</span>
                  <Pill tone={a.severity === "falha" ? "err" : a.severity === "alarme" ? "warn" : "muted"}>
                    {a.severity}
                  </Pill>
                </div>
                <p className="text-[11px] text-muted-foreground">{a.message}</p>
                <p className="num mt-0.5 text-[10px] text-muted-foreground">
                  {a.site} · {a.since}
                  {a.ack ? " · ack" : ""}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Modems celulares"
          actions={
            <ModuleLink slug="modems">Inventário →</ModuleLink>
          }
        >
          <ul className="space-y-2">
            {modems.map((m) => {
              const online = m.status === "Online";
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                  <RssiBars rssi={m.rssi} online={online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-bold">{m.site}</p>
                      <Pill tone={online ? "ok" : "err"}>{m.status}</Pill>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.id} · {m.model} · {m.tech}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("num text-[12px] font-bold", online ? "text-foreground" : "text-offline")}>
                      {m.rssi} dBm
                    </p>
                    <p className="num text-[10px] text-muted-foreground">
                      {online ? `${m.dataMb} MB` : m.lastSeen}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          title="Comunicação e saúde"
          actions={
            <ModuleLink slug="saude">Diagnóstico →</ModuleLink>
          }
        >
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "RSSI médio", value: `${avgRssi} dBm`, tone: avgRssi > -80 ? "ok" : "warn" },
              { label: "Latência", value: `${avgLatency} ms`, tone: avgLatency < 500 ? "ok" : "warn" },
              { label: "Canais", value: `${channelsOk}/${channels.length}`, tone: channelsOk === channels.length ? "ok" : "warn" },
              { label: "Serviços", value: `${healthOk}/${health.length}`, tone: healthOk === health.length ? "ok" : "warn" },
            ].map((x) => (
              <div key={x.label} className="rounded-md border border-border p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{x.label}</p>
                <Tone tone={x.tone as "ok" | "warn"}>{x.value}</Tone>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{c.name}</p>
                  <p className="num truncate text-[10px] text-muted-foreground">
                    {c.proto} · {c.endpoint} · {c.tags} tags
                  </p>
                </div>
                <Pill tone={c.status === "OK" ? "ok" : "warn"}>{c.status}</Pill>
              </li>
            ))}
          </ul>
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {health.map((h) => (
              <li key={h.name} className="flex items-center justify-between gap-1 rounded-md bg-secondary/40 px-2 py-1 text-[11px]">
                <span className="truncate">{h.name}</span>
                <Tone tone={h.status === "OK" ? "ok" : "warn"}>{h.detail}</Tone>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title="Carga por site"
          actions={
            <ModuleLink slug="sites">Sites →</ModuleLink>
          }
        >
          <ul className="space-y-3">
            {sites.map((s) => (
              <li key={s.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <MapPin className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="num shrink-0 font-bold text-online">{s.load} kW</span>
                </div>
                <Bar value={s.load} max={maxSiteLoad} />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {s.online} online · {s.alerta} alerta · {s.offline} offline · combustível {s.fuel}%
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Transferência e operação"
          actions={
            <ModuleLink slug="energia-transferencia">Transferência →</ModuleLink>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border p-3 text-center">
              <Zap className="mx-auto size-4 text-online" />
              <p className="num mt-1 text-2xl font-bold text-online">{onMains}</p>
              <p className="text-[11px] text-muted-foreground">Rede (MCB)</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <Activity className="mx-auto size-4 text-alert" />
              <p className="num mt-1 text-2xl font-bold text-alert">{onGen}</p>
              <p className="text-[11px] text-muted-foreground">Ilha (GCB)</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <AlertTriangle className="mx-auto size-4 text-offline" />
              <p className="num mt-1 text-2xl font-bold text-offline">{generators.filter((g) => g.status === "offline").length}</p>
              <p className="text-[11px] text-muted-foreground">Offline</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <Signal className="mx-auto size-4 text-muted-foreground" />
              <p className="num mt-1 text-2xl font-bold">{generators.filter((g) => g.status === "nao_configurado").length}</p>
              <p className="text-[11px] text-muted-foreground">Não config.</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {gateways.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate">{g.site}</span>
                <span className="num shrink-0 text-muted-foreground">CPU {g.cpu}% · {g.uptime}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Eventos recentes"
          actions={
            <ModuleLink slug="eventos">Log →</ModuleLink>
          }
        >
          <ul className="space-y-1.5">
            {eventLog.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[12px]">
                    <span className="font-bold">{e.gen}</span>{" "}
                    <span className="text-muted-foreground">{e.message}</span>
                  </p>
                </div>
                <span className="num shrink-0 text-[10px] text-muted-foreground">{e.time}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Horímetros críticos"
          actions={
            <ModuleLink slug="horimetros">Horímetros →</ModuleLink>
          }
        >
          <ul className="space-y-2">
            {dueMaint.map((g) => (
              <li key={g.id}>
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="font-bold">{g.tag}</span>
                  <span className={cn("num", g.maintenance < 120 ? "text-alert" : "text-foreground")}>
                    {g.maintenance} h
                  </span>
                </div>
                <Bar value={Math.min(g.maintenance, 200)} max={200} tone={g.maintenance < 120 ? "bg-alert" : "bg-online"} />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {g.site} · {fmt(g.runHours)} h trabalhadas
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Combustível e baterias"
          actions={
            <ModuleLink slug="combustivel">Manutenção →</ModuleLink>
          }
        >
          <ul className="space-y-2">
            {[...lowFuel, ...lowBatt.filter((g) => !lowFuel.some((f) => f.id === g.id))]
              .slice(0, 6)
              .map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold">{g.tag}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{g.site}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("num text-[12px] font-bold", g.fuelLevel < 40 ? "text-alert" : "text-foreground")}>
                      {g.fuelLevel}% fuel
                    </p>
                    <p className={cn("num text-[10px]", (g.battery ?? 99) < 12 ? "text-offline" : "text-muted-foreground")}>
                      {g.battery ?? "—"} V
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </Panel>

        <Panel
          title="Agenda e OS"
          actions={
            <ModuleLink slug="agenda">Agenda →</ModuleLink>
          }
        >
          <p className="mb-2 text-[11px] text-muted-foreground">
            {urgentWo.length} OS urgentes · {workOrders.filter((w) => w.status === "Em andamento").length} em campo
          </p>
          <ul className="space-y-1.5">
            {agenda.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 text-[12px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{a.site}</p>
                </div>
                <span className="num shrink-0 text-[10px] text-muted-foreground">{a.when}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px]">
        <HeartPulse className="size-3.5 text-online" />
        <span className="font-semibold">Sistema</span>
        {health.map((h) => (
          <span key={h.name} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <span className={cn("size-1.5 rounded-full", h.status === "OK" ? "bg-online" : "bg-alert")} />
            {h.name}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Timer className="size-3" />
          Coleta contínua
        </span>
      </div>
    </ScreenBody>
  );
}
