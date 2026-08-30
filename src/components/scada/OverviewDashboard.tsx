import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Gauge,
  HeartPulse,
  Radio,
  Router,
  Wrench,
  Zap,
} from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type EventItemApi, type FieldDevice, type SystemDiagnostics } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { cn } from "@/lib/utils";
import { Panel, Pill, ScreenBody, Stats, Tone } from "./kit";

function ModuleLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <Link
      to="/p/$slug"
      params={{ slug }}
      className="text-[11px] text-muted-foreground hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function metricAvailable(g: { availableMetrics?: string[] }, key: string) {
  return (g.availableMetrics ?? []).includes(key);
}

export function OverviewDashboard() {
  const { generators } = useGenerators();
  const { workOrders, agenda } = useScadaOps();
  const [devices, setDevices] = useState<FieldDevice[]>([]);
  const [diag, setDiag] = useState<SystemDiagnostics | null>(null);
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [remoteError, setRemoteError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([rcApi.fieldDevices.list(), rcApi.system.diagnostics(), rcApi.events.list(20)])
      .then(([field, health, evt]) => {
        if (!active) return;
        setDevices(field);
        setDiag(health);
        setEvents(evt);
        setRemoteError("");
      })
      .catch((err) => {
        if (active)
          setRemoteError(err instanceof Error ? err.message : "Falha ao atualizar painel");
      });
    return () => {
      active = false;
    };
  }, []);

  const configured = generators.filter((g) => g.status !== "nao_configurado");
  const online = generators.filter((g) => g.status === "online").length;
  const alerts = generators.filter((g) => g.status === "alerta").length;
  const offline = generators.filter((g) => g.status === "offline").length;
  const running = generators.filter((g) => metricAvailable(g, "rpm") && g.rpm > 300).length;
  const loadRows = generators.filter((g) => metricAvailable(g, "power_kw"));
  const loadKw = loadRows.reduce((sum, g) => sum + g.load, 0);
  const modems = devices.filter((d) => d.kind === "modem" && d.active);
  const gateways = devices.filter((d) => d.kind === "gateway" && d.active);
  const servicesOk =
    diag?.services.filter((s) => s.status === "active" || s.status === "OK").length ?? 0;
  const activeErrors = generators.filter((g) => g.status === "offline" || g.status === "alerta");
  const urgentWo = workOrders.filter((w) => w.status === "Urgente");

  const siteRows = useMemo(() => {
    const map = new Map<string, typeof generators>();
    for (const g of generators) {
      const bucket = map.get(g.site || "Sem unidade") ?? [];
      bucket.push(g);
      map.set(g.site || "Sem unidade", bucket);
    }
    return [...map.entries()].map(([name, rows]) => ({
      name,
      total: rows.length,
      online: rows.filter((g) => g.status === "online").length,
      alerts: rows.filter((g) => g.status === "alerta").length,
      offline: rows.filter((g) => g.status === "offline").length,
    }));
  }, [generators]);

  return (
    <ScreenBody>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Painel operacional
          </p>
          <p className="text-sm text-muted-foreground">
            {siteRows.length} unidades · {generators.length} geradores · dados industriais via Rapid
            SCADA
          </p>
        </div>
        <p className="num text-[11px] text-muted-foreground">Atualização automática</p>
      </div>

      {remoteError && (
        <div className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-[12px] text-alert">
          {remoteError}
        </div>
      )}

      <Stats
        items={[
          {
            icon: Gauge,
            label: "Geradores",
            value: generators.length,
            sub: `${configured.length} configurados`,
          },
          { icon: Activity, label: "Online", value: online, tone: "text-online" },
          {
            icon: BellRing,
            label: "Em alerta",
            value: alerts,
            tone: alerts ? "text-alert" : "text-online",
          },
          {
            icon: AlertTriangle,
            label: "Offline",
            value: offline,
            tone: offline ? "text-offline" : "text-online",
          },
          {
            icon: Zap,
            label: "Em funcionamento",
            value: running,
            sub: "RPM > 300 quando disponível",
          },
          {
            icon: Gauge,
            label: "Carga medida",
            value: loadRows.length ? `${loadKw.toFixed(1)} kW` : "N/D",
            sub: loadRows.length ? `${loadRows.length} fonte(s)` : "pack atual sem kW",
          },
          { icon: Router, label: "Modems cadastrados", value: modems.length },
          {
            icon: Wrench,
            label: "OS urgentes",
            value: urgentWo.length,
            tone: urgentWo.length ? "text-alert" : "text-online",
          },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title="Estado do parque"
          className="lg:col-span-2"
          actions={<ModuleLink slug="central-de-operacao">Operação →</ModuleLink>}
        >
          {!generators.length && (
            <p className="text-[12px] text-muted-foreground">Nenhum gerador cadastrado.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {generators.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[12px]">{g.tag}</b>
                  <Pill
                    tone={
                      g.status === "online"
                        ? "ok"
                        : g.status === "alerta"
                          ? "warn"
                          : g.status === "offline"
                            ? "err"
                            : "muted"
                    }
                  >
                    {g.status}
                  </Pill>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {g.site} · {g.controller}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                  <div className="rounded bg-secondary/40 p-1">
                    RPM
                    <br />
                    <b className="num">{metricAvailable(g, "rpm") ? g.rpm : "N/D"}</b>
                  </div>
                  <div className="rounded bg-secondary/40 p-1">
                    Hz
                    <br />
                    <b className="num">
                      {metricAvailable(g, "frequency") && g.frequency != null
                        ? g.frequency.toFixed(2)
                        : "N/D"}
                    </b>
                  </div>
                  <div className="rounded bg-secondary/40 p-1">
                    Rapid
                    <br />
                    <b className="num">{g.rapidDeviceNum ?? "N/D"}</b>
                  </div>
                </div>
                {g.lastError && (
                  <p className="mt-1 truncate text-[10px] text-offline" title={g.lastError}>
                    {g.lastError}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Condições que exigem atenção"
          actions={<ModuleLink slug="alarmes">Alarmes →</ModuleLink>}
        >
          {!activeErrors.length && (
            <p className="text-[12px] text-muted-foreground">
              Nenhuma condição derivada do estado atual.
            </p>
          )}
          <ul className="space-y-2">
            {activeErrors.slice(0, 8).map((g) => (
              <li key={g.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between">
                  <b className="text-[12px]">{g.tag}</b>
                  <Tone tone={g.status === "offline" ? "err" : "warn"}>{g.status}</Tone>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {g.lastError || "Estado reportado pela API; detalhe específico N/D"}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Unidades" actions={<ModuleLink slug="sites">Sites →</ModuleLink>}>
          {!siteRows.length && (
            <p className="text-[12px] text-muted-foreground">Nenhuma unidade cadastrada.</p>
          )}
          <ul className="space-y-2">
            {siteRows.map((s) => (
              <li key={s.name} className="rounded-md border border-border p-2 text-[11px]">
                <b>{s.name}</b>
                <p className="text-muted-foreground">
                  {s.total} geradores · {s.online} online · {s.alerts} alerta · {s.offline} offline
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Inventário de comunicação"
          actions={<ModuleLink slug="modems">Equipamentos →</ModuleLink>}
        >
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md border border-border p-3">
              <Router className="mx-auto size-4" />
              <p className="num mt-1 text-xl font-bold">{modems.length}</p>
              <p className="text-[10px] text-muted-foreground">Modems reais</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <Radio className="mx-auto size-4" />
              <p className="num mt-1 text-xl font-bold">{gateways.length}</p>
              <p className="text-[10px] text-muted-foreground">Gateways reais</p>
            </div>
          </div>
          {!devices.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Nenhum modem/gateway cadastrado; nenhum equipamento será inventado.
            </p>
          )}
        </Panel>

        <Panel
          title="Saúde do sistema"
          actions={<ModuleLink slug="saude">Diagnóstico →</ModuleLink>}
        >
          {!diag && (
            <p className="text-[12px] text-muted-foreground">Diagnóstico ainda não disponível.</p>
          )}
          {diag && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <HeartPulse className={cn("size-4", diag.ok ? "text-online" : "text-alert")} />
                <span className="text-[12px]">
                  <b>
                    {servicesOk}/{diag.services.length}
                  </b>{" "}
                  serviços OK
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Disco: {diag.host.disk ? `${diag.host.disk.usedPercent}% usado` : "N/D"} · Memória:{" "}
                {diag.host.memory ? `${diag.host.memory.usedPercent}% usada` : "N/D"}
              </p>
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Eventos reais" actions={<ModuleLink slug="eventos">Log →</ModuleLink>}>
          {!events.length && (
            <p className="text-[12px] text-muted-foreground">Nenhum evento registrado.</p>
          )}
          <ul className="space-y-1.5">
            {events.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0"
              >
                <p className="min-w-0 truncate text-[12px]">
                  <b>{e.tag || "Sistema"}</b>{" "}
                  <span className="text-muted-foreground">{e.message}</span>
                </p>
                <span className="num shrink-0 text-[10px] text-muted-foreground">
                  {new Date(e.created_at * 1000).toLocaleTimeString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Agenda e manutenção"
          actions={<ModuleLink slug="agenda">Agenda →</ModuleLink>}
        >
          <p className="mb-2 text-[11px] text-muted-foreground">
            {workOrders.length} OS · {agenda.length} itens de agenda
          </p>
          {!agenda.length && (
            <p className="text-[12px] text-muted-foreground">Nenhum agendamento cadastrado.</p>
          )}
          <ul className="space-y-1.5">
            {agenda.slice(0, 8).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-[12px]">
                <span className="truncate">
                  <b>{a.title}</b> · {a.site}
                </span>
                <span className="num shrink-0 text-[10px] text-muted-foreground">{a.when}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </ScreenBody>
  );
}
