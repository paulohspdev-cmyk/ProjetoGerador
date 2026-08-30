import { useEffect, useMemo, useState } from "react";
import { BellRing, Gauge, MapPin, Radio, RefreshCw, Server } from "lucide-react";

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
  const loadRows = generators.filter((g) => hasMetric(g, "power_kw"));
  const measuredLoad = loadRows.length
    ? loadRows.reduce((sum, g) => sum + Number(g.load), 0)
    : null;
  const alarmRows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const configured = generators.filter((g) => g.status !== "nao_configurado");
  const rapidOk = configured.filter(
    (g) => g.telemetrySource === "rapid_scada" && g.status !== "offline",
  ).length;

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Server,
            label: "Parque",
            value: generatorsError ? "ERRO" : generators.length,
            sub: generatorsError ? "cadastro indisponível" : "geradores",
            tone: "text-foreground",
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
              ? "parque indisponível"
              : measuredLoad == null
                ? "sem canal power_kw"
                : `${loadRows.length} gerador(es)`,
          },
          {
            icon: BellRing,
            label: "Condições ativas",
            value: generatorsError ? "—" : alarmRows.filter((a) => !a.ack).length,
            tone: alarmRows.length ? "text-alert" : "text-online",
          },
          {
            icon: Radio,
            label: "Telemetria Rapid",
            value: generatorsError
              ? "—"
              : configured.length
                ? `${rapidOk}/${configured.length}`
                : "0/0",
          },
        ]}
      />

      {!generatorsReady && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Carregando estado do parque…
        </p>
      )}
      {generatorsError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          <span>Falha ao carregar o parque: {generatorsError}</span>
          <button
            type="button"
            onClick={() => void refreshGenerators()}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-offline/40 px-2 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" />
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Estado do parque" className="lg:col-span-2">
          {generatorsReady && !generatorsError && !generators.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum gerador cadastrado.
            </p>
          ) : generatorsError ? (
            <p className="py-8 text-center text-sm text-offline">
              Estado do parque indisponível até a API de geradores responder.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {generators.map((g) => {
                const rpm = hasMetric(g, "rpm") ? `${fmt(g.rpm, 0)} rpm` : "RPM N/D";
                const hz =
                  hasMetric(g, "frequency") && g.frequency != null
                    ? `${fmt(g.frequency, 2)} Hz`
                    : "Hz N/D";
                return (
                  <div key={g.id} className="rounded-md border border-border bg-background/40 p-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[12px] font-bold">{g.tag}</p>
                      <StatusPill status={g.status} />
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {g.site || "Sem site"}
                    </p>
                    <p className="num mt-1 text-[11px]">
                      {g.telemetrySource === "rapid_scada"
                        ? `${rpm} · ${hz}`
                        : "sem telemetria Rapid"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Condições ativas">
          {generatorsError ? (
            <p className="py-8 text-center text-sm text-offline">
              Condições do parque indisponíveis.
            </p>
          ) : !alarmRows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma condição real ativa.
            </p>
          ) : (
            <ul className="space-y-2">
              {alarmRows.slice(0, 8).map((a) => (
                <li key={a.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold">{a.gen}</span>
                    <Pill tone={a.severity === "falha" ? "err" : "warn"}>{a.severity}</Pill>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{a.message}</p>
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
          (g) => g.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
        );
        const loadRows = gens.filter((g) => hasMetric(g, "power_kw"));
        const measuredLoad = loadRows.length
          ? loadRows.reduce((sum, g) => sum + Number(g.load), 0)
          : null;
        return {
          ...site,
          online: gens.filter((g) => g.status === "online").length,
          alerta: gens.filter((g) => g.status === "alerta").length,
          offline: gens.filter((g) => g.status === "offline").length,
          total: gens.length,
          measuredLoad,
          loadSources: loadRows.length,
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
          { icon: MapPin, label: "Sites cadastrados", value: error ? "ERRO" : sites.length },
          { icon: Server, label: "Geradores", value: generatorsError ? "ERRO" : generators.length },
          {
            icon: Gauge,
            label: "Carga medida",
            value: hasFailure ? "—" : parkLoad == null ? "N/D" : `${fmt(parkLoad, 1)} kW`,
          },
        ]}
      />
      {(error || generatorsError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          <span>
            {error && `Sites: ${error}. `}
            {generatorsError && `Geradores: ${generatorsError}.`}
          </span>
          <button
            type="button"
            onClick={() => {
              void loadSites();
              void refreshGenerators();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-offline/40 px-2 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" />
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <Panel title="Sites">
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando sites…</p>
        </Panel>
      ) : hasFailure ? (
        <Panel title="Sites">
          <p className="py-8 text-center text-sm text-offline">
            Não foi possível confirmar o inventário de sites e geradores.
          </p>
        </Panel>
      ) : !rows.length ? (
        <Panel title="Sites">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum site cadastrado. Cadastre em Gestão → Unidades.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((s) => (
            <article key={s.id} className="rounded-lg border border-border bg-card p-3">
              <h3 className="font-bold">{s.name}</h3>
              <p className="text-[11px] text-muted-foreground">
                {[s.city, s.state].filter(Boolean).join(" / ") || "Localização não informada"}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                <div>
                  <p className="num text-lg font-bold text-online">{s.online}</p>
                  <p className="text-muted-foreground">Online</p>
                </div>
                <div>
                  <p className="num text-lg font-bold text-alert">{s.alerta}</p>
                  <p className="text-muted-foreground">Alerta</p>
                </div>
                <div>
                  <p className="num text-lg font-bold text-offline">{s.offline}</p>
                  <p className="text-muted-foreground">Off</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {s.total} geradores ·{" "}
                {s.measuredLoad == null
                  ? "carga N/D"
                  : `${fmt(s.measuredLoad, 1)} kW em ${s.loadSources} fonte(s)`}
              </p>
              {s.lat != null && s.lng != null && (
                <p className="num mt-1 text-[10px] text-muted-foreground">
                  {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </ScreenBody>
  );
}
