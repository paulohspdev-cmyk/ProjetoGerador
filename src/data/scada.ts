import type { Generator } from "@/data/generators";

export function fmt(n: number | null | undefined, d = 1) {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(d).replace(".", ",");
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
  load: number;
  fuel: number;
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
    const measuredLoad = loadRows.length ? loadRows.reduce((s, g) => s + g.load, 0) : null;
    const measuredFuel = fuelRows.length
      ? fuelRows.reduce((s, g) => s + g.fuelLevel, 0) / fuelRows.length
      : null;
    return {
      id:
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "") || "sem-unidade",
      name,
      city: "",
      lat: null,
      lng: null,
      gens,
      total: gens.length,
      online: gens.filter((g) => g.status === "online").length,
      alerta: gens.filter((g) => g.status === "alerta").length,
      offline: gens.filter((g) => g.status === "offline").length,
      // Compatibilidade com telas legadas. Zero aqui significa ausência de soma
      // exibível; measuredLoad/measuredFuel preservam a distinção N/D.
      load: measuredLoad ?? 0,
      fuel: measuredFuel ?? 0,
      measuredLoad,
      measuredFuel,
    };
  });
}

export type ScadaAlarm = {
  id: string;
  gen: string;
  site: string;
  severity: "falha" | "alarme" | "aviso";
  message: string;
  since: string;
  ack: boolean;
};

/**
 * Alarmes compatíveis derivados apenas do estado real devolvido pela API.
 * Não inventa causa elétrica, temperatura, bateria ou timestamp.
 */
export function buildAlarms(list: Generator[]): ScadaAlarm[] {
  return list.flatMap<ScadaAlarm>((g) => {
    if (g.status === "offline") {
      return [
        {
          id: `COMM-${g.id}`,
          gen: g.tag,
          site: g.site,
          severity: "falha",
          message: g.lastError || "Comunicação indisponível",
          since: "—",
          ack: false,
        },
      ];
    }
    if (g.status === "alerta" || (g.alarms ?? 0) > 0) {
      return [
        {
          id: `STATE-${g.id}`,
          gen: g.tag,
          site: g.site,
          severity: "alarme",
          message:
            g.lastError ||
            "Controlador reporta condição de alerta; detalhes dependem das informações disponíveis",
          since: "—",
          ack: false,
        },
      ];
    }
    return [];
  });
}

// As coleções abaixo existem apenas para manter telas antigas compiláveis durante
// a migração. Elas ficam vazias até serem preenchidas pelos endpoints reais.
export const alarms: ScadaAlarm[] = [];
export const eventLog: Array<{
  id: string;
  gen: string;
  message: string;
  time: string;
  date: string;
  kind: "ok" | "info" | "battery" | "warn" | "error";
}> = [];
export const historyRows: Array<{
  id: string;
  gen: string;
  site: string;
  event: string;
  user: string;
  at: string;
  result: string;
}> = [];
export const reports: Array<{
  id: string;
  name: string;
  period: string;
  status: string;
  format: string;
}> = [];

/** Tendências reais usam /api/generators/{id}/trends/{metric}. */
export function spark(
  _seed: number,
  _n = 24,
  _base = 60,
  _amp = 12,
): Array<{ t: string; v: number }> {
  return [];
}

export type WorkOrder = {
  id: string;
  gen: string;
  site: string;
  type: string;
  due: number;
  tech: string;
  status: "Urgente" | "Em andamento" | "Planejada" | "Concluída";
};
export const workOrders: WorkOrder[] = [];
export const agendaItems: Array<{ id: string; title: string; when: string; site: string }> = [];

export function buildControllers(list: Generator[]) {
  return list.map((g) => ({
    id: g.id,
    model: g.controller,
    gen: g.tag,
    site: g.site,
    fw: "—",
    proto: g.telemetrySource === "rapid_scada" ? "Telemetria" : "—",
    ip: g.ip,
    online: g.status === "online" || g.status === "alerta",
  }));
}
export const controllers: ReturnType<typeof buildControllers> = [];

export function buildModems(_list: Generator[]) {
  return [] as Array<{
    id: string;
    site: string;
    model: string;
    sim: string;
    rssi: number;
    tech: string;
    status: string;
    lastSeen: string;
    dataMb: number;
  }>;
}
export const modems: ReturnType<typeof buildModems> = [];

export function buildGateways(_list: Generator[]) {
  return [] as Array<{
    id: string;
    site: string;
    model: string;
    channels: number;
    cpu: number;
    uptime: string;
    status: string;
  }>;
}
export const gateways: ReturnType<typeof buildGateways> = [];

export const rules: Array<{
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}> = [];
export const channels: Array<{
  id: string;
  name: string;
  proto: string;
  endpoint: string;
  tags: number;
  status: string;
}> = [];
export const scadaTags: Array<{
  id: string;
  name: string;
  type: string;
  unit: string;
  rw: string;
}> = [];
export const manufacturers: Array<{ id: string; name: string; country: string; models: number }> =
  [];
export const protocols: Array<{ id: string; name: string; layer: string; packs: number }> = [];
export const clients: Array<{
  id: string;
  name: string;
  units: number;
  gens: number;
  sla: string;
}> = [];
export const users: Array<{ id: string; name: string; role: string; last: string }> = [];
export const roles: Array<{ id: string; name: string; perms: string }> = [];
export const auditLog: Array<{
  id: string;
  user: string;
  action: string;
  target: string;
  at: string;
  ip: string;
}> = [];
export const webhooks: Array<{ id: string; url: string; event: string; status: string }> = [];
export const backups: Array<{
  id: string;
  when: string;
  size: string;
  type: string;
  result: string;
}> = [];
export const health: Array<{ name: string; status: string; detail: string }> = [];
