import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, ClipboardList, FileText, Gauge, MapPin, RefreshCw, Wrench } from "lucide-react";

import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { Panel, Pill, ScreenBody, Stats } from "./kit";
import { fmt, hasMetric, realAlarms } from "./operation-helpers";

export function OperationCenter() {
  const {
    generators,
    ready: generatorsReady,
    error: generatorsError,
    refresh: refreshGenerators,
  } = useGenerators();
  const { isAcked, workOrders } = useScadaOps();
  const [statusFilter, setStatusFilter] = useState("all");

  const loadRows = generators.filter((generator) => hasMetric(generator, "power_kw"));
  const measuredLoad = loadRows.length
    ? loadRows.reduce((sum, generator) => sum + Number(generator.load), 0)
    : null;
  const alarmRows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const pendingAlarms = alarmRows.filter((alarm) => !alarm.ack);
  const criticalAlarms = pendingAlarms.filter((alarm) => alarm.severity === "falha");
  const online = generators.filter((generator) => generator.status === "online").length;
  const offline = generators.filter((generator) => generator.status === "offline").length;
  const urgentWork = workOrders.filter((order) =>
    ["urgente", "urgent"].includes((order.status || "").trim().toLowerCase()),
  ).length;

  const siteRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        name: string;
        total: number;
        online: number;
        alert: number;
        offline: number;
        load: number | null;
      }
    >();
    for (const generator of generators) {
      const name = generator.site?.trim() || "Sem unidade";
      const current = grouped.get(name) ?? {
        name,
        total: 0,
        online: 0,
        alert: 0,
        offline: 0,
        load: null,
      };
      current.total += 1;
      if (generator.status === "online") current.online += 1;
      else if (generator.status === "alerta") current.alert += 1;
      else if (generator.status === "offline") current.offline += 1;
      if (hasMetric(generator, "power_kw") && generator.load != null) {
        current.load = (current.load ?? 0) + Number(generator.load);
      }
      grouped.set(name, current);
    }
    return [...grouped.values()].sort((a, b) => {
      const riskA = a.offline * 10 + a.alert;
      const riskB = b.offline * 10 + b.alert;
      return riskB - riskA || b.total - a.total;
    });
  }, [generators]);

  const visibleGenerators = generators.filter((generator) =>
    statusFilter === "all" ? true : generator.status === statusFilter,
  );

  return (
    <ScreenBody>
      <section className="rc-page-hero px-4 py-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary">
              Operação
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-white">Monitoramento em tempo real</h2>
            <p className="mt-1 text-sm text-slate-400">
              Priorize ocorrências, disponibilidade e equipamentos que precisam de intervenção.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="ml-2 h-9 rounded-lg border border-white/10 bg-black/15 px-3 text-xs text-slate-200"
              >
                <option value="all">Todos</option>
                <option value="online">Online</option>
                <option value="alerta">Em alerta</option>
                <option value="offline">Offline</option>
                <option value="nao_configurado">Não configurado</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refreshGenerators()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 text-xs font-semibold text-slate-300 hover:border-primary/40 hover:text-white"
            >
              <RefreshCw className="size-4 text-primary" /> Atualizar
            </button>
          </div>
        </div>
      </section>

      <Stats
        items={[
          {
            icon: MapPin,
            label: "Unidades monitoradas",
            value: generatorsError ? "—" : siteRows.length,
            sub: generatorsError
              ? undefined
              : `${siteRows.filter((site) => site.offline === 0).length} sem gerador offline`,
          },
          {
            icon: Gauge,
            label: "Geradores online",
            value: generatorsError ? "—" : online,
            tone: "text-online",
            sub: generatorsError ? undefined : `${generators.length} no parque`,
          },
          {
            icon: BellRing,
            label: "Alarmes críticos",
            value: generatorsError ? "—" : criticalAlarms.length,
            tone: criticalAlarms.length ? "text-offline" : "text-online",
            sub: generatorsError ? undefined : `${pendingAlarms.length} pendente(s)`,
          },
          {
            icon: ClipboardList,
            label: "OS urgentes",
            value: urgentWork,
            tone: urgentWork ? "text-alert" : "text-online",
            sub: `${workOrders.length} ordem(ns) registrada(s)`,
          },
          {
            icon: Gauge,
            label: "Carga medida",
            value: generatorsError
              ? "—"
              : measuredLoad == null
                ? "N/D"
                : `${fmt(measuredLoad, 1)} kW`,
            sub: `${loadRows.length}/${generators.length} com leitura`,
          },
        ]}
      />

      {!generatorsReady && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Carregando estado do parque…
        </p>
      )}
      {generatorsError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          <span>Falha ao carregar o parque: {generatorsError}</span>
          <button
            type="button"
            onClick={() => void refreshGenerators()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-offline/40 px-3 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Visão operacional por unidade" className="xl:col-span-5">
          {!siteRows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade com geradores cadastrados.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {siteRows.slice(0, 8).map((site) => {
                const available = site.total ? Math.round((site.online / site.total) * 100) : 0;
                return (
                  <article
                    key={site.name}
                    className="rounded-xl border border-border/70 bg-background/25 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold">{site.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {site.total} gerador(es)
                        </p>
                      </div>
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${
                          site.offline ? "bg-offline" : site.alert ? "bg-alert" : "bg-online"
                        }`}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="block text-muted-foreground">Disp.</span>
                        <b className="num text-online">{available}%</b>
                      </div>
                      <div>
                        <span className="block text-muted-foreground">Alarmes</span>
                        <b className="num">{site.alert + site.offline}</b>
                      </div>
                      <div>
                        <span className="block text-muted-foreground">Carga</span>
                        <b className="num">
                          {site.load == null ? "N/D" : `${fmt(site.load, 0)} kW`}
                        </b>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-online"
                        style={{ width: `${available}%` }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Fila de ocorrências"
          className="xl:col-span-4"
          actions={
            <Link
              to="/p/$slug"
              params={{ slug: "alarmes" }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver todos
            </Link>
          }
        >
          {generatorsError ? (
            <p className="py-8 text-center text-sm text-offline">Ocorrências indisponíveis.</p>
          ) : !alarmRows.length ? (
            <p className="py-8 text-center text-sm text-online">Nenhuma condição ativa.</p>
          ) : (
            <div className="divide-y divide-border/55">
              {alarmRows.slice(0, 9).map((alarm) => (
                <div
                  key={alarm.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                >
                  <Pill tone={alarm.severity === "falha" ? "err" : "warn"}>{alarm.severity}</Pill>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{alarm.gen}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{alarm.message}</p>
                  </div>
                  <span className="size-2 rounded-full bg-alert" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Ações rápidas" className="xl:col-span-3">
          <div className="space-y-2">
            {[
              {
                slug: "alarmes",
                icon: BellRing,
                title: "Reconhecer alarmes",
                text: "Visualizar e tratar alarmes ativos",
              },
              {
                slug: "manutencao",
                icon: Wrench,
                title: "Abrir manutenção",
                text: "Ordens de serviço e preventivas",
              },
              {
                slug: "relatorios",
                icon: FileText,
                title: "Relatórios",
                text: "Gerar e consultar relatórios operacionais",
              },
              {
                slug: "mapa",
                icon: MapPin,
                title: "Mapa operacional",
                text: "Visualizar unidades com coordenadas cadastradas",
              },
            ].map((action) => (
              <Link
                key={action.slug}
                to="/p/$slug"
                params={{ slug: action.slug }}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background/25 p-3 transition-colors hover:border-primary/35 hover:bg-primary/[0.04]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <action.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{action.title}</b>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {action.text}
                  </span>
                </span>
                <span className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-3">
        <Panel title="Disponibilidade por unidade">
          <div className="space-y-3">
            {siteRows.slice(0, 6).map((site) => {
              const available = site.total ? Math.round((site.online / site.total) * 100) : 0;
              return (
                <div
                  key={site.name}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(90px,1fr)_42px] items-center gap-3 text-xs"
                >
                  <span className="truncate font-semibold">{site.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-secondary">
                    <i
                      className={`block h-full rounded-full ${available >= 80 ? "bg-online" : available >= 60 ? "bg-alert" : "bg-offline"}`}
                      style={{ width: `${available}%` }}
                    />
                  </span>
                  <b className="num text-right">{available}%</b>
                </div>
              );
            })}
            {!siteRows.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem dados de unidades.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Timeline operacional">
          <div className="space-y-1">
            {pendingAlarms.slice(0, 4).map((alarm) => (
              <div key={alarm.id} className="flex gap-3 py-2">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${alarm.severity === "falha" ? "bg-offline" : "bg-alert"}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    {alarm.gen} · {alarm.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Ocorrência ativa</p>
                </div>
              </div>
            ))}
            {workOrders.slice(0, 4).map((order) => (
              <div key={order.id} className="flex gap-3 py-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-chart-2" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    OS {order.id} · {order.type}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {order.gen || order.site || "Operação"} · {order.status}
                  </p>
                </div>
              </div>
            ))}
            {!pendingAlarms.length && !workOrders.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem ocorrências recentes.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Status de comunicação">
          <div className="divide-y divide-border/55">
            {visibleGenerators.slice(0, 8).map((generator) => (
              <div
                key={generator.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <b className="block truncate">{generator.tag}</b>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {generator.ip || generator.transport || "Endpoint N/D"}
                  </span>
                </div>
                <StatusPill status={generator.status} />
              </div>
            ))}
            {!visibleGenerators.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum gerador para este filtro.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </ScreenBody>
  );
}
