import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, ClipboardList, FileText, Gauge, MapPin, RefreshCw, Wrench } from "lucide-react";

import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { OperationalMap } from "./OperationalMap";
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
  const [siteFilter, setSiteFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const sites = useMemo(
    () => [...new Set(generators.map((generator) => generator.site).filter(Boolean))].sort(),
    [generators],
  );
  const clients = useMemo(
    () => [...new Set(generators.map((generator) => generator.customer).filter(Boolean))].sort(),
    [generators],
  );
  const visibleGenerators = useMemo(
    () =>
      generators.filter((generator) => {
        if (siteFilter && generator.site !== siteFilter) return false;
        if (clientFilter && generator.customer !== clientFilter) return false;
        if (statusFilter && generator.status !== statusFilter) return false;
        return true;
      }),
    [clientFilter, generators, siteFilter, statusFilter],
  );

  const loadRows = visibleGenerators.filter((generator) => hasMetric(generator, "power_kw"));
  const measuredLoad = loadRows.length
    ? loadRows.reduce((sum, generator) => sum + Number(generator.load), 0)
    : null;
  const allAlarmRows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const visibleTags = useMemo(
    () => new Set(visibleGenerators.map((generator) => generator.tag)),
    [visibleGenerators],
  );
  const alarmRows = allAlarmRows.filter((alarm) => visibleTags.has(alarm.gen));
  const pendingAlarms = alarmRows.filter((alarm) => !alarm.ack);
  const criticalAlarms = pendingAlarms.filter((alarm) => alarm.severity === "falha");
  const online = visibleGenerators.filter((generator) => generator.status === "online").length;
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
    for (const generator of visibleGenerators) {
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
    return [...grouped.values()].sort(
      (a, b) => b.offline * 10 + b.alert - (a.offline * 10 + a.alert),
    );
  }, [visibleGenerators]);

  const clearFilters = () => {
    setSiteFilter("");
    setClientFilter("");
    setStatusFilter("");
  };

  return (
    <ScreenBody>
      <section className="rc-panel rounded-[10px] border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto_auto]">
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Unidade
            <select
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todas as unidades</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Cliente
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todos os clientes</option>
              {clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
            >
              <option value="">Todos os status</option>
              <option value="online">Online</option>
              <option value="alerta">Em alerta</option>
              <option value="offline">Offline</option>
              <option value="nao_configurado">Não configurado</option>
            </select>
          </label>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-auto h-10 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-secondary"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => void refreshGenerators()}
            className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="size-4" /> Atualizar
          </button>
        </div>
      </section>

      <Stats
        items={[
          {
            icon: MapPin,
            label: "Unidades monitoradas",
            value: generatorsError ? "—" : siteRows.length,
            sub: generatorsError ? undefined : `${visibleGenerators.length} gerador(es) no filtro`,
          },
          {
            icon: Gauge,
            label: "Geradores em operação",
            value: generatorsError ? "—" : online,
            tone: "text-online",
            sub: generatorsError ? undefined : `${visibleGenerators.length} no conjunto atual`,
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
            sub: generatorsError
              ? undefined
              : `${loadRows.length}/${visibleGenerators.length} com leitura`,
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
            className="h-9 rounded-md border border-offline/40 px-3 text-xs font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Visão operacional" className="xl:col-span-5 [&>div:last-child]:p-0">
          <div className="relative h-[390px] min-h-[320px] overflow-hidden rounded-b-[10px]">
            <OperationalMap generators={visibleGenerators} />
          </div>
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
              Ver todas
            </Link>
          }
        >
          {generatorsError ? (
            <p className="py-12 text-center text-sm text-offline">Ocorrências indisponíveis.</p>
          ) : !alarmRows.length ? (
            <p className="py-12 text-center text-sm text-online">Nenhuma condição ativa.</p>
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
                text: "Consultar relatórios operacionais",
              },
              {
                slug: "mapa",
                icon: MapPin,
                title: "Mapa operacional",
                text: "Abrir a visão geográfica completa",
              },
            ].map((action) => (
              <Link
                key={action.slug}
                to="/p/$slug"
                params={{ slug: action.slug }}
                className="group flex items-center gap-3 rounded-lg border border-border/70 bg-background/25 p-3 transition-colors hover:border-primary/35 hover:bg-primary/[0.04]"
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
                <span className="text-primary">›</span>
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
