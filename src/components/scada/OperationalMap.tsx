import { useEffect, useMemo, useRef, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useTheme } from "@/components/layout/ThemeProvider";
import type { Generator } from "@/data/generators";
import { rcApi, type OpsSite } from "@/lib/api";

import "leaflet/dist/leaflet.css";

const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export type OperationalMapSite = OpsSite & {
  lat: number;
  lng: number;
  gens: Generator[];
  online: number;
  alerta: number;
  offline: number;
  load: number | null;
};

function siteColor(site: OperationalMapSite) {
  if (site.gens.length === 0) return "var(--muted-foreground)";
  if (site.offline > 0) return "var(--offline)";
  if (site.alerta > 0) return "var(--alert)";
  return "var(--online)";
}

function tileUrl(theme: "dark" | "light") {
  return theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
}

function popupHtml(site: OperationalMapSite) {
  const gens = site.gens
    .slice(0, 8)
    .map((generator) => {
      const status =
        generator.status === "online"
          ? { label: "ONLINE", css: "text-online" }
          : generator.status === "alerta"
            ? { label: "ALERTA", css: "text-alert" }
            : generator.status === "offline"
              ? { label: "OFFLINE", css: "text-offline" }
              : { label: "N/D", css: "text-muted-foreground" };
      return `<li class="flex items-center justify-between gap-2">
          <a href="/p/geradores/${esc(generator.id)}" class="font-semibold text-primary hover:underline">${esc(generator.tag)}</a>
          <span class="${status.css}">${status.label}</span>
        </li>`;
    })
    .join("");

  return `<div class="min-w-52 p-1">
    <p class="text-[13px] font-bold">${esc(site.name)}</p>
    <p class="text-[11px] text-muted-foreground">${esc([site.city, site.state].filter(Boolean).join(" / ") || "Localização cadastrada")}</p>
    <p class="mt-2 text-[11px]">
      <span class="text-online">${site.online} online</span> ·
      <span class="text-alert">${site.alerta} alerta</span> ·
      <span class="text-offline">${site.offline} off</span>
    </p>
    <p class="num mt-1 text-[11px] text-muted-foreground">${site.load == null ? "Potência N/D" : `${site.load.toFixed(0)} kW medidos`}</p>
    <ul class="mt-2 space-y-0.5 text-[11px]">${gens}</ul>
  </div>`;
}

type MapCtx = {
  map: import("leaflet").Map;
  tiles: import("leaflet").TileLayer | null;
  markers: import("leaflet").LayerGroup;
  L: typeof import("leaflet");
};

type Props = {
  siteRows?: OpsSite[];
  selectedSiteId?: string | null;
  onSelectSite?: (site: OperationalMapSite) => void;
};

export function OperationalMap({
  siteRows: suppliedRows,
  selectedSiteId,
  onSelectSite,
}: Props = {}) {
  const { generators } = useGenerators();
  const { theme } = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<MapCtx | null>(null);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [internalRows, setInternalRows] = useState<OpsSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (suppliedRows) return;
    let active = true;
    void rcApi.sites
      .list()
      .then((rows) => {
        if (active) {
          setInternalRows(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Falha ao consultar sites.");
      });
    return () => {
      active = false;
    };
  }, [suppliedRows]);

  const sourceRows = suppliedRows ?? internalRows;
  const sites = useMemo<OperationalMapSite[]>(
    () =>
      sourceRows
        .filter(
          (site): site is OpsSite & { lat: number; lng: number } =>
            site.lat != null && site.lng != null,
        )
        .map((site) => {
          const gens = generators.filter(
            (generator) => generator.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
          );
          const measuredLoad = gens.filter(
            (generator) =>
              (generator.availableMetrics ?? []).includes("power_kw") &&
              generator.load != null &&
              Number.isFinite(Number(generator.load)),
          );
          return {
            ...site,
            gens,
            online: gens.filter((generator) => generator.status === "online").length,
            alerta: gens.filter((generator) => generator.status === "alerta").length,
            offline: gens.filter((generator) => generator.status === "offline").length,
            load: measuredLoad.length
              ? measuredLoad.reduce((sum, generator) => sum + Number(generator.load), 0)
              : null,
          };
        }),
    [generators, sourceRows],
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let cancelled = false;

    void import("leaflet").then((mod) => {
      if (cancelled || !elRef.current) return;
      const L = (mod.default ?? mod) as typeof import("leaflet");
      const map = L.map(elRef.current, { zoomControl: true }).setView(BRAZIL_CENTER, 4);
      const markers = L.layerGroup().addTo(map);
      ctxRef.current = { map, tiles: null, markers, L };
      map.invalidateSize();
      window.setTimeout(() => map.invalidateSize(), 120);
      setReady(true);
    });

    const onResize = () => ctxRef.current?.map.invalidateSize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      ctxRef.current?.map.remove();
      ctxRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ready || !ctx) return;
    ctx.tiles?.remove();
    ctx.tiles = ctx.L.tileLayer(tileUrl(theme), {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
    }).addTo(ctx.map);
  }, [ready, theme]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ready || !ctx) return;
    const { L, map, markers } = ctx;
    markers.clearLayers();
    const points: Array<[number, number]> = [];

    for (const site of sites) {
      const selected = selectedSiteId === site.id;
      const color = siteColor(site);
      if (selected) {
        L.circleMarker([site.lat, site.lng], {
          radius: 19,
          color,
          fillColor: color,
          fillOpacity: 0.12,
          weight: 2,
          opacity: 0.55,
        }).addTo(markers);
      }
      const marker = L.circleMarker([site.lat, site.lng], {
        radius: selected ? 13 : 10,
        color,
        fillColor: color,
        fillOpacity: 0.88,
        weight: selected ? 3 : 2,
      })
        .bindPopup(popupHtml(site), { maxWidth: 300 })
        .addTo(markers);
      marker.on("click", () => onSelectSite?.(site));
      points.push([site.lat, site.lng]);
    }

    if (!fittedRef.current && points.length > 0) {
      if (points.length > 1) map.fitBounds(points, { padding: [42, 42], maxZoom: 11 });
      else if (points[0]) map.setView(points[0], 11);
      fittedRef.current = true;
    }
    map.invalidateSize();
  }, [onSelectSite, ready, selectedSiteId, sites]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[#06131f]">
      {!ready && (
        <div className="absolute inset-0 z-[500] grid place-items-center bg-panel text-sm text-muted-foreground">
          Carregando mapa…
        </div>
      )}
      {ready && sites.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[600] -translate-x-1/2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow">
          {error || "Nenhuma unidade filtrada possui latitude/longitude cadastradas."}
        </div>
      )}
      <div ref={elRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[600] rounded-lg border border-white/10 bg-[#071824]/90 px-3 py-2 text-[10px] text-slate-300 shadow-lg backdrop-blur">
        <p className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-online" /> Online
        </p>
        <p className="mt-1 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-alert" /> Em alerta
        </p>
        <p className="mt-1 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-offline" /> Crítica / offline
        </p>
      </div>
    </div>
  );
}
