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

type SiteMapRow = OpsSite & {
  lat: number;
  lng: number;
  gens: Generator[];
  online: number;
  alerta: number;
  offline: number;
  load: number | null;
};

function siteColor(site: SiteMapRow) {
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

function popupHtml(site: SiteMapRow) {
  const gens = site.gens
    .map((g) => {
      const status =
        g.status === "online"
          ? { label: "ONLINE", css: "text-online" }
          : g.status === "alerta"
            ? { label: "ALERTA", css: "text-alert" }
            : g.status === "offline"
              ? { label: "OFFLINE", css: "text-offline" }
              : { label: "N/D", css: "text-muted-foreground" };
      return `<li class="flex items-center justify-between gap-2">
          <a href="/p/geradores/${esc(g.id)}" class="font-semibold text-primary hover:underline">${esc(g.tag)}</a>
          <span class="${status.css}">${status.label}</span>
        </li>`;
    })
    .join("");

  return `<div class="min-w-48 p-1">
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

export function OperationalMap() {
  const { generators } = useGenerators();
  const { theme } = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<MapCtx | null>(null);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [siteRows, setSiteRows] = useState<OpsSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void rcApi.sites
      .list()
      .then((rows) => {
        if (active) {
          setSiteRows(rows);
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

  const sites = useMemo<SiteMapRow[]>(
    () =>
      siteRows
        .filter(
          (site): site is OpsSite & { lat: number; lng: number } =>
            site.lat != null && site.lng != null,
        )
        .map((site) => {
          const gens = generators.filter(
            (g) => g.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
          );
          const measuredLoad = gens.filter(
            (g) =>
              (g.availableMetrics ?? []).includes("power_kw") &&
              g.load != null &&
              Number.isFinite(Number(g.load)),
          );
          return {
            ...site,
            gens,
            online: gens.filter((g) => g.status === "online").length,
            alerta: gens.filter((g) => g.status === "alerta").length,
            offline: gens.filter((g) => g.status === "offline").length,
            load: measuredLoad.length
              ? measuredLoad.reduce((sum, g) => sum + Number(g.load), 0)
              : null,
          };
        }),
    [generators, siteRows],
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
      L.circleMarker([site.lat, site.lng], {
        radius: 12,
        color: siteColor(site),
        fillColor: siteColor(site),
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindPopup(popupHtml(site), { maxWidth: 280 })
        .addTo(markers);
      points.push([site.lat, site.lng]);
    }

    if (!fittedRef.current && points.length > 0) {
      if (points.length > 1) map.fitBounds(points, { padding: [56, 56], maxZoom: 13 });
      else if (points[0]) map.setView(points[0], 13);
      fittedRef.current = true;
    }
    map.invalidateSize();
  }, [ready, sites]);

  return (
    <div className="relative h-full min-h-0 w-full">
      {!ready && (
        <div className="absolute inset-0 z-[500] grid place-items-center bg-panel text-sm text-muted-foreground">
          Carregando mapa…
        </div>
      )}
      {ready && sites.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[600] -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow">
          {error || "Nenhum site possui latitude/longitude cadastradas."}
        </div>
      )}
      <div ref={elRef} className="absolute inset-0" />
    </div>
  );
}
