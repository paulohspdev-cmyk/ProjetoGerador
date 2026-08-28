import { generators, recentEvents, type Generator } from "@/data/generators";

export function fmt(n: number, d = 1) {
  return n.toFixed(d).replace(".", ",");
}

export const siteCoords: Record<string, { lat: number; lng: number; city: string }> = {
  "Data Center SP-01": { lat: -23.5505, lng: -46.6333, city: "São Paulo" },
  "Hospital Norte": { lat: -23.454, lng: -46.533, city: "Guarulhos" },
  "Shopping Leste": { lat: -23.54, lng: -46.48, city: "São Paulo" },
  "Fábrica Osasco": { lat: -23.5325, lng: -46.7916, city: "Osasco" },
};

function fallbackCoord(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return {
    lat: -23.55 + ((h % 20) - 10) * 0.02,
    lng: -46.63 + (((h >> 8) % 20) - 10) * 0.02,
    city: "São Paulo",
  };
}

export function gensBySite(list: Generator[] = generators) {
  const map = new Map<string, Generator[]>();
  for (const g of list) {
    const bucket = map.get(g.site) ?? [];
    bucket.push(g);
    map.set(g.site, bucket);
  }
  return [...map.entries()].map(([name, gens]) => {
    const geo = siteCoords[name] ?? fallbackCoord(name);
    return {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      city: geo.city,
      lat: geo.lat,
      lng: geo.lng,
      gens,
      total: gens.length,
      online: gens.filter((g) => g.status === "online").length,
      alerta: gens.filter((g) => g.status === "alerta").length,
      offline: gens.filter((g) => g.status === "offline").length,
      load: gens.reduce((s, g) => s + g.load, 0),
      fuel: Math.round(gens.reduce((s, g) => s + g.fuelLevel, 0) / gens.length),
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

export function buildAlarms(list: Generator[]): ScadaAlarm[] {
  return list.flatMap((g, i) => {
    if (g.status === "online" && g.alarms === 0) return [];
    const msgs =
      g.status === "offline"
        ? ["Comunicação perdida", "Tensão de bateria baixa"]
        : g.status === "alerta"
          ? ["Temperatura de refrigeração elevada", "Latência acima do limite"]
          : ["Tag não mapeada"];
    return msgs.slice(0, Math.max(1, g.alarms || 1)).map((message, k) => ({
      id: `ALM-${g.tag}-${k}`,
      gen: g.tag,
      site: g.site,
      severity: g.status === "offline" ? ("falha" as const) : g.status === "alerta" ? ("alarme" as const) : ("aviso" as const),
      message,
      since: `${14 - (i % 4)}:${String(20 + k * 7).padStart(2, "0")}:1${k}`,
      ack: k > 0,
    }));
  });
}

export const alarms = buildAlarms(generators);

export const eventLog = [
  ...recentEvents.map((e, i) => ({
    id: `EVT-${i + 1}`,
    gen: e.gen,
    message: e.message,
    time: e.time,
    date: e.date,
    kind: e.kind,
  })),
  { id: "EVT-7", gen: "GEN002", message: "MCB fechado — rede sincronizada", time: "14:28:44", date: "23/05/2025", kind: "ok" as const },
  { id: "EVT-8", gen: "GEN004", message: "Partida recusada: modo OFF", time: "14:21:02", date: "23/05/2025", kind: "warn" as const },
  { id: "EVT-9", gen: "GEN008", message: "Exercício automático concluído", time: "13:05:11", date: "23/05/2025", kind: "ok" as const },
  { id: "EVT-10", gen: "GEN010", message: "Combustível abaixo de 40%", time: "12:44:09", date: "23/05/2025", kind: "warn" as const },
];

export const historyRows = generators.map((g, i) => ({
  id: `HIS-${g.id}`,
  gen: g.tag,
  site: g.site,
  event: i % 3 === 0 ? "Transferência rede → gerador" : i % 3 === 1 ? "Ciclo de exercício" : "Atualização de firmware",
  user: i % 2 === 0 ? "Paulo Pires" : "Sistema",
  at: `23/05/2025 ${10 + (i % 8)}:${String(12 + i).padStart(2, "0")}:00`,
  result: g.status === "offline" ? "Falha" : "OK",
}));

export const reports = [
  { id: "REL-001", name: "Disponibilidade mensal", period: "Maio/2025", status: "Pronto", format: "PDF" },
  { id: "REL-002", name: "Consumo de combustível", period: "Maio/2025", status: "Pronto", format: "XLSX" },
  { id: "REL-003", name: "Alarmes por site", period: "Últimos 7 dias", status: "Gerando", format: "PDF" },
  { id: "REL-004", name: "Horímetros e manutenção", period: "Q2 2025", status: "Agendado", format: "PDF" },
  { id: "REL-005", name: "Qualidade de energia", period: "Hoje", status: "Pronto", format: "CSV" },
];

export function spark(seed: number, n = 24, base = 60, amp = 12) {
  return Array.from({ length: n }, (_, i) => ({
    t: `${String(i).padStart(2, "0")}h`,
    v: Number((base + Math.sin((i + seed) / 3) * amp + ((i * 7 + seed) % 5)).toFixed(1)),
  }));
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

export const workOrders: WorkOrder[] = generators.map((g, i) => ({
  id: `OS-${1200 + i}`,
  gen: g.tag,
  site: g.site,
  type: i % 3 === 0 ? "Preventiva" : i % 3 === 1 ? "Corretiva" : "Inspeção",
  due: g.maintenance,
  tech: ["Ana Souza", "Carlos Lima", "Equipe campo"][i % 3]!,
  status: g.maintenance < 80 ? "Urgente" : i % 4 === 0 ? "Em andamento" : "Planejada",
}));

export const agendaItems = [
  { id: "AG-1", title: "Exercício GEN001 / GEN006", when: "28/08 09:00", site: "Data Center SP-01" },
  { id: "AG-2", title: "Troca de filtros GEN003", when: "29/08 14:00", site: "Hospital Norte" },
  { id: "AG-3", title: "Teste de transferência Shopping Leste", when: "01/09 07:30", site: "Shopping Leste" },
  { id: "AG-4", title: "Calibração de horímetros", when: "03/09 10:00", site: "Fábrica Osasco" },
  { id: "AG-5", title: "Backup Rapid SCADA", when: "Toda sexta 23:00", site: "Sistema" },
];

export function buildControllers(list: Generator[]) {
  return list.map((g, i) => ({
    id: g.id,
    model: g.controller,
    gen: g.tag,
    site: g.site,
    fw: `v${1 + (i % 3)}.${i % 9}.0`,
    proto: i % 2 === 0 ? "Modbus TCP" : "SNMP",
    ip: g.ip,
    online: g.status !== "offline" && g.status !== "nao_configurado",
  }));
}

export const controllers = buildControllers(generators);

export function buildModems(list: Generator[]) {
  return gensBySite(list).map((s, i) => ({
    id: `MDM-${i + 1}`,
    site: s.name,
    model: i % 2 ? "Teltonika RUT241" : "Sierra AirLink",
    sim: `8955…${1200 + i}`,
    rssi: i === 3 ? -118 : i === 2 ? -91 : -55 - i * 6,
    tech: i % 2 ? "4G" : "4G/5G",
    status: i === 3 ? "Offline" : "Online",
    lastSeen: i === 3 ? "há 18 min" : "agora",
    dataMb: i === 3 ? 0 : 28 + i * 19,
  }));
}

export const modems = buildModems(generators);

export function buildGateways(list: Generator[]) {
  return gensBySite(list).map((s, i) => ({
    id: `GW-${i + 1}`,
    site: s.name,
    model: "RC Edge Gateway",
    channels: 8 + i * 2,
    cpu: 18 + i * 7,
    uptime: `${20 + i}d ${i * 3}h`,
    status: "Operacional",
  }));
}

export const gateways = buildGateways(generators);

export const rules = [
  { id: "R-01", name: "Partida em falta de rede", trigger: "Tensão MAINS < 180 V", action: "START + GCB I", enabled: true },
  { id: "R-02", name: "Retorno à rede", trigger: "Rede estável 30 s", action: "MCB I → GCB O → STOP", enabled: true },
  { id: "R-03", name: "Bateria crítica", trigger: "Bateria < 11,8 V", action: "Alarme + WhatsApp", enabled: true },
  { id: "R-04", name: "Combustível baixo", trigger: "Fuel < 25%", action: "OS preventiva", enabled: false },
  { id: "R-05", name: "Paralelismo máximo", trigger: "2+ geradores AUTO", action: "PRLL ON", enabled: true },
];

export const channels = [
  { id: "CH-01", name: "Modbus TCP SP-01", proto: "Modbus TCP", endpoint: "10.50.1.1:502", tags: 128, status: "OK" },
  { id: "CH-02", name: "SNMP Hospital", proto: "SNMP v2c", endpoint: "10.50.2.1:161", tags: 64, status: "OK" },
  { id: "CH-03", name: "MQTT Edge", proto: "MQTT", endpoint: "mqtt.rc.local:1883", tags: 210, status: "Degradado" },
  { id: "CH-04", name: "Serial Osasco", proto: "Modbus RTU", endpoint: "COM3 / 9600", tags: 32, status: "OK" },
];

export const scadaTags = [
  { id: "TAG-FREQ", name: "gen.freq", type: "Float", unit: "Hz", rw: "R" },
  { id: "TAG-LOAD", name: "gen.load", type: "Float", unit: "kW", rw: "R" },
  { id: "TAG-MCB", name: "gen.mcb", type: "Bool", unit: "—", rw: "RW" },
  { id: "TAG-GCB", name: "gen.gcb", type: "Bool", unit: "—", rw: "RW" },
  { id: "TAG-FUEL", name: "eng.fuel", type: "Float", unit: "%", rw: "R" },
  { id: "TAG-BATT", name: "eng.batt", type: "Float", unit: "V", rw: "R" },
  { id: "TAG-RPM", name: "eng.rpm", type: "Int", unit: "rpm", rw: "R" },
  { id: "TAG-HRS", name: "eng.runHours", type: "Float", unit: "h", rw: "R" },
];

export const manufacturers = [
  { id: "M-DSE", name: "Deep Sea Electronics", country: "Reino Unido", models: 4 },
  { id: "M-COM", name: "ComAp", country: "Tchéquia", models: 2 },
  { id: "M-CAT", name: "Caterpillar", country: "EUA", models: 1 },
  { id: "M-CUM", name: "Cummins", country: "EUA", models: 1 },
];

export const protocols = [
  { id: "P1", name: "Modbus TCP", layer: "Ethernet", packs: 6 },
  { id: "P2", name: "Modbus RTU", layer: "Serial", packs: 4 },
  { id: "P3", name: "SNMP", layer: "IP", packs: 2 },
  { id: "P4", name: "MQTT", layer: "Broker", packs: 3 },
  { id: "P5", name: "OPC UA", layer: "Industrial", packs: 1 },
];

export const clients = [
  { id: "C-01", name: "Atlas Data Centers", units: 1, gens: 3, sla: "99,9%" },
  { id: "C-02", name: "Rede Saúde Norte", units: 1, gens: 3, sla: "99,5%" },
  { id: "C-03", name: "Grupo Leste Shopping", units: 1, gens: 3, sla: "99,0%" },
  { id: "C-04", name: "Indústria Osasco", units: 1, gens: 3, sla: "99,7%" },
];

export const users = [
  { id: "U-01", name: "Paulo Pires", role: "Administrador", last: "Agora" },
  { id: "U-02", name: "Ana Souza", role: "Operação", last: "12 min" },
  { id: "U-03", name: "Carlos Lima", role: "Manutenção", last: "1 h" },
  { id: "U-04", name: "Marina Costa", role: "Leitura", last: "Ontem" },
];

export const roles = [
  { id: "PR-ADM", name: "Administrador", perms: "Tudo" },
  { id: "PR-OPS", name: "Operação", perms: "Comando, alarmes, energia" },
  { id: "PR-MNT", name: "Manutenção", perms: "OS, combustível, horímetros" },
  { id: "PR-RO", name: "Leitura", perms: "Somente visualização" },
];

export const auditLog = historyRows.map((h, i) => ({
  id: `AUD-${i + 1}`,
  user: h.user,
  action: h.event,
  target: h.gen,
  at: h.at,
  ip: `187.22.10.${10 + i}`,
}));

export const webhooks = [
  { id: "WH-1", url: "https://erp.cliente.com/hooks/scada", event: "alarme.criado", status: "Ativo" },
  { id: "WH-2", url: "https://bms.shopping.com/api/gen", event: "transferencia", status: "Ativo" },
  { id: "WH-3", url: "https://ops.rc.local/slack", event: "falha.comunicacao", status: "Pausado" },
];

export const backups = [
  { id: "BK-1", when: "27/08 23:00", size: "184 MB", type: "Automático", result: "OK" },
  { id: "BK-2", when: "26/08 23:00", size: "181 MB", type: "Automático", result: "OK" },
  { id: "BK-3", when: "20/08 11:12", size: "179 MB", type: "Manual", result: "OK" },
];

export const health = [
  { name: "API SCADA", status: "OK", detail: "12 ms" },
  { name: "Histórico", status: "OK", detail: "Postgres 14" },
  { name: "Broker MQTT", status: "Degradado", detail: "Fila 128" },
  { name: "Coleta Modbus", status: "OK", detail: "4 canais" },
  { name: "Notificações", status: "OK", detail: "WhatsApp + e-mail" },
  { name: "Disco", status: "OK", detail: "38% usado" },
];
