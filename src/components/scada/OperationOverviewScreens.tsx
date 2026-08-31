import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, CircleOff, Gauge, MapPin, RefreshCw, Server } from "lucide-react";

import { GeneratorEditDialog } from "@/components/generators/GeneratorEditDialog";
import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type OpsSite } from "@/lib/api";
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
  const { isAcked } = useScadaOps();
  const loadRows = generators.filter((generator) => hasMetric(generator, "power_kw"));
  const measuredLoad = loadRows.length
    ? loadRows.reduce((sum, generator) => sum + Number(generator.load), 0)
    : null;
  const alarmRows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const online = generators.filter((generator) => generator.status === "online").length;
  const offline = generators.filter((generator) => generator.status === "offline").length;

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Central de Operação</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Acesse, acompanhe e edite os geradores do parque.
        </p>
      </div>

      <Stats
        items={[
          {
            icon: Server,
            label: "Geradores",
            value: generatorsError ? "—" : generators.length,
          },
          {
            icon: Gauge,
            label: "Online",
            value: generatorsError ? "—" : online,
            tone: "text-online",
          },
          {
            icon: CircleOff,
            label: "Offline",
            value: generatorsError ? "—" : offline,
            tone: offline ? "text-offline" : "text-online",
          },
          {
            icon: BellRing,
            label: "Condições ativas",
            value: generatorsError ? "—" : alarmRows.filter((alarm) => !alarm.ack).length,
            tone: alarmRows.length ? "text-alert" : "text-online",
          },
          {
            icon: Gauge,
            label: "Carga medida",
            value: generatorsError
              ? "—"
              : measuredLoad == null
                ? "N/D"
                : `${fmt(measuredLoad, 1)} kW`,
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

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Geradores" className="xl:col-span-2">
          {generatorsReady && !generatorsError && !generators.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum gerador cadastrado.</p>
          ) : generatorsError ? (
            <p className="py-8 text-center text-sm text-offline">Parque indisponível.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {generators.map((generator) => {
                const rpm = hasMetric(generator, "rpm") ? `${fmt(generator.rpm, 0)} rpm` : "—";
                const hz =
                  hasMetric(generator, "frequency") && generator.frequency != null
                    ? `${fmt(generator.frequency, 1)} Hz`
                    : "—";
                return (
                  <article key={generator.id} className="rounded-xl border border-border bg-background/35 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold">{generator.tag}</p>
                        <p className="truncate text-xs text-muted-foreground">{generator.site || "Sem unidade"}</p>
                      </div>
                      <StatusPill status={generator.status} />
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span className="num font-bold">{rpm}</span>
                      <span className="num font-bold">{hz}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Link
                        to="/p/geradores/$id"
                        params={{ id: generator.id }}
                        className="inline-flex h-8 items-center rounded-md border border-primary/40 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        Abrir
                      </Link>
                      <GeneratorEditDialog generator={generator} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Condições ativas">
          {generatorsError ? (
            <p className="py-8 text-center text-sm text-offline">Condições indisponíveis.</p>
          ) : !alarmRows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma condição ativa.</p>
          ) : (
            <ul className="space-y-2">
              {alarmRows.slice(0, 8).map((alarm) => (
                <li key={alarm.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{alarm.gen}</span>
                    <Pill tone={alarm.severity === "falha" ? "err" : "warn"}>{alarm.severity}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{alarm.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </ScreenBody>
  );
}

export function SitesScreen() {
  const { generators, error: generatorsError, refresh: refreshGenerators } = useGenerators();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSites = async () => {
    setLoading(true);
    try {
      setSites(await rcApi.sites.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar sites.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSites();
  }, []);

  const rows = useMemo(
    () =>
      sites.map((site) => {
        const gens = generators.filter(
          (generator) => generator.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
        );
        const measuredRows = gens.filter((generator) => hasMetric(generator, "power_kw"));
        const siteLoad = measuredRows.length
          ? measuredRows.reduce((sum, generator) => sum + Number(generator.load), 0)
          : null;
        return {
          ...site,
          online: gens.filter((generator) => generator.status === "online").length,
          alerta: gens.filter((generator) => generator.status === "alerta").length,
          offline: gens.filter((generator) => generator.status === "offline").length,
          total: gens.length,
          measuredLoad: siteLoad,
          loadSources: measuredRows.length,
        };
      }),
    [generators, sites],
  );
  const allMeasured = rows.flatMap((site) =>
    site.measuredLoad == null ? [] : [site.measuredLoad],
  );
  const parkLoad = allMeasured.length ? allMeasured.reduce((sum, value) => sum + value, 0) : null;
  const hasFailure = Boolean(error || generatorsError);

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: MapPin, label: "Unidades", value: error ? "—" : sites.length },
          { icon: Server, label: "Geradores", value: generatorsError ? "—" : generators.length },
          {
            icon: Gauge,
            label: "Carga medida",
            value: hasFailure ? "—" : parkLoad == null ? "N/D" : `${fmt(parkLoad, 1)} kW`,
          },
        ]}
      />
      {(error || generatorsError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          <span>
            {error && `Unidades: ${error}. `}
            {generatorsError && `Geradores: ${generatorsError}.`}
          </span>
          <button
            type="button"
            onClick={() => {
              void loadSites();
              void refreshGenerators();
            }}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-offline/40 px-3 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" /> Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <Panel title="Unidades"><p className="py-8 text-center text-sm text-muted-foreground">Carregando unidades…</p></Panel>
      ) : hasFailure ? (
        <Panel title="Unidades"><p className="py-8 text-center text-sm text-offline">Não foi possível atualizar as unidades.</p></Panel>
      ) : !rows.length ? (
        <Panel title="Unidades"><p className="py-8 text-center text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p></Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((site) => (
            <article key={site.id} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
              <h3 className="font-extrabold">{site.name}</h3>
              <p className="text-xs text-muted-foreground">
                {[site.city, site.state].filter(Boolean).join(" / ") || "Localização não informada"}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-1 text-center text-xs">
                <div><p className="num text-xl font-bold text-online">{site.online}</p><p className="text-muted-foreground">Online</p></div>
                <div><p className="num text-xl font-bold text-alert">{site.alerta}</p><p className="text-muted-foreground">Alerta</p></div>
                <div><p className="num text-xl font-bold text-offline">{site.offline}</p><p className="text-muted-foreground">Offline</p></div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {site.total} geradores · {site.measuredLoad == null ? "carga N/D" : `${fmt(site.measuredLoad, 1)} kW`}
              </p>
            </article>
          ))}
        </div>
      )}
    </ScreenBody>
  );
}
