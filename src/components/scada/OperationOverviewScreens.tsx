import { useEffect, useMemo, useState } from "react";
import { Gauge, MapPin, RefreshCw, Server } from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type OpsSite } from "@/lib/api";
import { Panel, ScreenBody, Stats } from "./kit";
import { fmt, hasMetric } from "./operation-helpers";

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
        <Panel title="Unidades">
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando unidades…</p>
        </Panel>
      ) : hasFailure ? (
        <Panel title="Unidades">
          <p className="py-8 text-center text-sm text-offline">
            Não foi possível atualizar as unidades.
          </p>
        </Panel>
      ) : !rows.length ? (
        <Panel title="Unidades">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade cadastrada.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((site) => (
            <article
              key={site.id}
              className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]"
            >
              <h3 className="font-extrabold">{site.name}</h3>
              <p className="text-xs text-muted-foreground">
                {[site.city, site.state].filter(Boolean).join(" / ") || "Localização não informada"}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-1 text-center text-xs">
                <div>
                  <p className="num text-xl font-bold text-online">{site.online}</p>
                  <p className="text-muted-foreground">Online</p>
                </div>
                <div>
                  <p className="num text-xl font-bold text-alert">{site.alerta}</p>
                  <p className="text-muted-foreground">Alerta</p>
                </div>
                <div>
                  <p className="num text-xl font-bold text-offline">{site.offline}</p>
                  <p className="text-muted-foreground">Offline</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {site.total} geradores ·{" "}
                {site.measuredLoad == null ? "carga N/D" : `${fmt(site.measuredLoad, 1)} kW`}
              </p>
            </article>
          ))}
        </div>
      )}
    </ScreenBody>
  );
}
