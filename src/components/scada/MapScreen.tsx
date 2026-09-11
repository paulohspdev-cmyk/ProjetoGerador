import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CircleOff, MapPin, MapPinned } from "lucide-react";

import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type OpsSite } from "@/lib/api";
import { OperationalMap, type OperationalMapSite } from "./OperationalMap";
import { Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function siteStatus(row: { total: number; offline: number; alert: number }) {
  if (!row.total) return "empty" as const;
  if (row.offline) return "offline" as const;
  if (row.alert) return "alert" as const;
  return "online" as const;
}

export function MapScreen() {
  const { generators } = useGenerators();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [error, setError] = useState("");
  const [client, setClient] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.sites
      .list()
      .then((rows) => {
        if (!active) return;
        setSites(rows);
        setSelectedId(
          (current) =>
            current ??
            rows.find((row) => row.lat != null && row.lng != null)?.id ??
            rows[0]?.id ??
            null,
        );
        setError("");
      })
      .catch((loadError) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : "Falha ao consultar unidades.");
      });
    return () => {
      active = false;
    };
  }, []);

  const siteRows = useMemo(
    () =>
      sites.map((site) => {
        const gens = generators.filter(
          (generator) => generator.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
        );
        const measured = gens.filter(
          (generator) =>
            (generator.availableMetrics ?? []).includes("power_kw") &&
            generator.load != null &&
            Number.isFinite(Number(generator.load)),
        );
        const online = gens.filter((generator) => generator.status === "online").length;
        const alert = gens.filter((generator) => generator.status === "alerta").length;
        const offline = gens.filter((generator) => generator.status === "offline").length;
        return {
          ...site,
          gens,
          total: gens.length,
          online,
          alert,
          offline,
          load: measured.length
            ? measured.reduce((sum, generator) => sum + Number(generator.load), 0)
            : null,
        };
      }),
    [generators, sites],
  );

  const clients = useMemo(
    () =>
      [
        ...new Set(
          siteRows
            .map((row) => row.clientName?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [siteRows],
  );
  const states = useMemo(
    () =>
      [
        ...new Set(
          siteRows
            .map((row) => row.state?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [siteRows],
  );
  const filtered = siteRows.filter((row) => {
    if (client && row.clientName !== client) return false;
    if (stateFilter && row.state !== stateFilter) return false;
    if (statusFilter && siteStatus(row) !== statusFilter) return false;
    return true;
  });
  const filteredSites = filtered
    .map((row) => sites.find((site) => site.id === row.id))
    .filter((site): site is OpsSite => Boolean(site));
  const selected = siteRows.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const unitsWithCoordinates = siteRows.filter((row) => row.lat != null && row.lng != null).length;
  const onlineUnits = siteRows.filter((row) => siteStatus(row) === "online").length;
  const alertUnits = siteRows.filter((row) => siteStatus(row) === "alert").length;
  const criticalUnits = siteRows.filter((row) => siteStatus(row) === "offline").length;
  const missingCoordinates = siteRows.length - unitsWithCoordinates;

  const selectFromMap = (site: OperationalMapSite) => setSelectedId(site.id);

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Building2,
            label: "Unidades monitoradas",
            value: siteRows.length,
            sub: `${unitsWithCoordinates} no mapa`,
          },
          {
            icon: MapPin,
            label: "Online",
            value: onlineUnits,
            tone: "text-online",
            sub: siteRows.length
              ? `${Math.round((onlineUnits / siteRows.length) * 100)}% das unidades`
              : "—",
          },
          {
            icon: AlertTriangle,
            label: "Em alerta",
            value: alertUnits,
            tone: "text-alert",
            sub: "Com gerador em alerta",
          },
          {
            icon: CircleOff,
            label: "Críticas",
            value: criticalUnits,
            tone: criticalUnits ? "text-offline" : "text-online",
            sub: "Com gerador offline",
          },
          {
            icon: MapPinned,
            label: "Sem coordenadas",
            value: missingCoordinates,
            tone: missingCoordinates ? "text-alert" : "text-online",
            sub: "Fora da visualização geográfica",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Filtros" className="xl:col-span-2">
          <div className="space-y-3">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Cliente
              <select
                value={client}
                onChange={(event) => setClient(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs"
              >
                <option value="">Todos</option>
                {clients.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Estado
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs"
              >
                <option value="">Todos</option>
                {states.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs"
              >
                <option value="">Todos</option>
                <option value="online">Online</option>
                <option value="alert">Em alerta</option>
                <option value="offline">Crítica / offline</option>
                <option value="empty">Sem gerador</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setClient("");
                setStateFilter("");
                setStatusFilter("");
              }}
              className="h-10 w-full rounded-lg border border-primary/45 bg-primary/5 text-xs font-extrabold text-primary hover:bg-primary/10"
            >
              Limpar filtros
            </button>
            <p className="text-center text-[10px] text-muted-foreground">
              {filtered.length} unidade(s) encontrada(s)
            </p>
          </div>
        </Panel>

        <section className="rc-panel min-h-[460px] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-panel)] xl:col-span-7">
          <OperationalMap
            siteRows={filteredSites}
            selectedSiteId={selected?.id ?? null}
            onSelectSite={selectFromMap}
          />
        </section>

        <Panel title="Detalhes da unidade selecionada" className="xl:col-span-3">
          {!selected ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma unidade selecionada.
            </p>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold">{selected.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[selected.city, selected.state].filter(Boolean).join(" - ") ||
                      "Localização não informada"}
                  </p>
                </div>
                <Pill
                  tone={
                    siteStatus(selected) === "online"
                      ? "ok"
                      : siteStatus(selected) === "alert"
                        ? "warn"
                        : siteStatus(selected) === "offline"
                          ? "err"
                          : "muted"
                  }
                >
                  {siteStatus(selected) === "online"
                    ? "Online"
                    : siteStatus(selected) === "alert"
                      ? "Em alerta"
                      : siteStatus(selected) === "offline"
                        ? "Crítica"
                        : "Sem gerador"}
                </Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 border-b border-border/60 py-4 text-center">
                <div>
                  <span className="block text-[10px] text-muted-foreground">Geradores</span>
                  <b className="num mt-1 block text-xl">{selected.total}</b>
                </div>
                <div>
                  <span className="block text-[10px] text-muted-foreground">Disponibilidade</span>
                  <b className="num mt-1 block text-xl text-online">
                    {selected.total
                      ? `${Math.round((selected.online / selected.total) * 100)}%`
                      : "N/D"}
                  </b>
                </div>
                <div>
                  <span className="block text-[10px] text-muted-foreground">Ocorrências</span>
                  <b
                    className={`num mt-1 block text-xl ${selected.alert + selected.offline ? "text-offline" : "text-online"}`}
                  >
                    {selected.alert + selected.offline}
                  </b>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 py-4">
                <div className="rounded-lg border border-border/55 bg-background/25 p-3">
                  <span className="text-[10px] text-muted-foreground">Carga medida</span>
                  <b className="num mt-1 block text-lg">
                    {selected.load == null ? "N/D" : `${selected.load.toFixed(0)} kW`}
                  </b>
                </div>
                <div className="rounded-lg border border-border/55 bg-background/25 p-3">
                  <span className="text-[10px] text-muted-foreground">Cliente</span>
                  <b className="mt-1 block truncate text-sm">{selected.clientName || "N/D"}</b>
                </div>
              </div>
              <div className="border-t border-border/60 pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Equipamentos principais
                </p>
                <div className="divide-y divide-border/50">
                  {selected.gens.slice(0, 6).map((generator) => (
                    <div
                      key={generator.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2 text-xs"
                    >
                      <b className="truncate">{generator.tag}</b>
                      <StatusPill status={generator.status} />
                      <span className="num min-w-16 text-right text-muted-foreground">
                        {(generator.availableMetrics ?? []).includes("power_kw") &&
                        generator.load != null
                          ? `${Number(generator.load).toFixed(0)} kW`
                          : "N/D"}
                      </span>
                    </div>
                  ))}
                  {!selected.gens.length && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Nenhum gerador vinculado.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Lista de unidades">
        <ScadaTable
          rows={filtered.map((row) => ({ ...row, id: row.id }))}
          min="980px"
          columns={[
            {
              label: "Unidade",
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className="font-bold hover:text-primary"
                >
                  {row.name}
                </button>
              ),
            },
            { label: "Cliente", render: (row) => row.clientName || "—" },
            {
              label: "Cidade",
              render: (row) => [row.city, row.state].filter(Boolean).join(" - ") || "—",
            },
            { label: "Geradores", render: (row) => <span className="num">{row.total}</span> },
            {
              label: "Disponibilidade",
              render: (row) => (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                    <i
                      className="block h-full rounded-full bg-online"
                      style={{ width: `${row.total ? (row.online / row.total) * 100 : 0}%` }}
                    />
                  </span>
                  <b className="num">
                    {row.total ? `${Math.round((row.online / row.total) * 100)}%` : "N/D"}
                  </b>
                </span>
              ),
            },
            {
              label: "Status",
              render: (row) => (
                <Pill
                  tone={
                    siteStatus(row) === "online"
                      ? "ok"
                      : siteStatus(row) === "alert"
                        ? "warn"
                        : siteStatus(row) === "offline"
                          ? "err"
                          : "muted"
                  }
                >
                  {siteStatus(row) === "online"
                    ? "Online"
                    : siteStatus(row) === "alert"
                      ? "Em alerta"
                      : siteStatus(row) === "offline"
                        ? "Crítica"
                        : "Sem gerador"}
                </Pill>
              ),
            },
            {
              label: "Ocorrências",
              render: (row) => (
                <span className={`num ${row.alert + row.offline ? "text-offline" : "text-online"}`}>
                  {row.alert + row.offline}
                </span>
              ),
            },
            {
              label: "Carga medida",
              render: (row) => (
                <span className="num">
                  {row.load == null ? "N/D" : `${row.load.toFixed(0)} kW`}
                </span>
              ),
            },
            {
              label: "Mapa",
              render: (row) =>
                row.lat != null && row.lng != null ? (
                  <Pill tone="info">Coordenadas OK</Pill>
                ) : (
                  <Pill tone="muted">Sem coordenadas</Pill>
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
