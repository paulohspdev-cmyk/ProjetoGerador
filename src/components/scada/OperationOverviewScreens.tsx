import { useEffect, useMemo, useState } from "react";
import { BellRing, Gauge, MapPin, Radio, Server } from "lucide-react";

import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type OpsSite } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { Panel, Pill, ScreenBody, Stats } from "./kit";
import { fmt, hasMetric, realAlarms } from "./operation-helpers";

export function OperationCenter() {
  const { generators } = useGenerators();
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
            value: generators.length,
            sub: "geradores",
            tone: "text-foreground",
          },
          {
            icon: Gauge,
            label: "Carga medida",
            value: measuredLoad == null ? "N/D" : `${fmt(measuredLoad, 1)} kW`,
            sub: measuredLoad == null ? "sem canal power_kw" : `${loadRows.length} gerador(es)`,
          },
          {
            icon: BellRing,
            label: "Condições ativas",
            value: alarmRows.filter((a) => !a.ack).length,
            tone: alarmRows.length ? "text-alert" : "text-online",
          },
          {
            icon: Radio,
            label: "Telemetria Rapid",
            value: configured.length ? `${rapidOk}/${configured.length}` : "0/0",
          },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Estado do parque" className="lg:col-span-2">
          {!generators.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum gerador cadastrado.
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
          {!alarmRows.length ? (
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
  const { generators } = useGenerators();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.sites
      .list()
      .then((rows) => {
        if (active) {
          setSites(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Falha ao consultar sites.");
      });
    return () => {
      active = false;
    };
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

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: MapPin, label: "Sites cadastrados", value: sites.length },
          { icon: Server, label: "Geradores", value: generators.length },
          {
            icon: Gauge,
            label: "Carga medida",
            value: parkLoad == null ? "N/D" : `${fmt(parkLoad, 1)} kW`,
          },
        ]}
      />
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {!rows.length ? (
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
