import type { Generator } from "@/data/generators";

export function fmt(n: number, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d).replace(".", ",") : "—";
}

export type SiteAggregate = {
  id: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  gens: Generator[];
  total: number;
  online: number;
  alerta: number;
  offline: number;
  measuredLoad: number | null;
  measuredFuel: number | null;
};

/**
 * Agrega somente estado dos geradores recebidos pela API. Localização deve ser
 * enriquecida com /api/sites; nenhuma coordenada, cidade ou telemetria é inventada.
 */
export function gensBySite(list: Generator[] = []): SiteAggregate[] {
  const map = new Map<string, Generator[]>();
  for (const g of list) {
    const name = g.site || "Sem unidade";
    const bucket = map.get(name) ?? [];
    bucket.push(g);
    map.set(name, bucket);
  }

  return [...map.entries()].map(([name, gens]) => {
    const loadRows = gens.filter((g) => (g.availableMetrics ?? []).includes("power_kw"));
    const fuelRows = gens.filter((g) => (g.availableMetrics ?? []).includes("fuel_level"));
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sem-unidade",
      name,
      city: "",
      lat: null,
      lng: null,
      gens,
      total: gens.length,
      online: gens.filter((g) => g.status === "online").length,
      alerta: gens.filter((g) => g.status === "alerta").length,
      offline: gens.filter((g) => g.status === "offline").length,
      measuredLoad: loadRows.length ? loadRows.reduce((s, g) => s + g.load, 0) : null,
      measuredFuel: fuelRows.length ? fuelRows.reduce((s, g) => s + g.fuelLevel, 0) / fuelRows.length : null,
    };
  });
}
