export type GenStatus = "online" | "alerta" | "offline" | "nao_configurado";

export type Generator = {
  id: string;
  tag: string;
  name?: string;
  customer?: string;
  controller: string;
  controllerType?: string;
  site: string;
  status: GenStatus;
  mode: "AUTO" | "MANUAL" | "STOP" | "TESTE" | "OFF";
  ip: string;
  battery: number | null;
  frequency: number | null;
  rpm: number;
  load: number;
  oilPressure: number;
  coolantTemp: number;
  fuelLevel: number;
  alternatorVoltage: number;
  maintenance: number;
  runHours: number;
  latency: number | null;
  alarms: number;
  mcb: boolean;
  gcb: boolean;
  mains: { l1: number; l2: number; l3: number; l12: number };
  gen: { l1: number; l2: number; l3: number; l12: number };
  telemetrySource?: "rapid_scada" | "none" | string;
  rapidDeviceNum?: number | null;
  lastError?: string;
};

export const GEN_SITES = ["Data Center SP-01", "Hospital Norte", "Shopping Leste", "Fábrica Osasco"];

export const CONTROLLER_MODELS = [
  "ComAp InteliGen 200",
  "DSE8610",
  "ComAp InteliLite 9",
  "DSE7320 MKII",
  "DSE4520",
  "Deep Sea 6120",
  "ComAp InteliMains 150",
];

function make(i: number): Generator {
  const statuses: GenStatus[] = [
    "online", "online", "alerta", "offline", "nao_configurado", "online",
    "offline", "online", "nao_configurado", "online", "alerta", "offline",
  ];
  const controllers = CONTROLLER_MODELS;
  const status = statuses[i % statuses.length]!;
  const running = status === "online";
  const alert = status === "alerta";
  const configured = status !== "nao_configurado";

  return {
    id: `gen-${String(i + 1).padStart(3, "0")}`,
    tag: `GEN${String(i + 1).padStart(3, "0")}`,
    controller: controllers[i % controllers.length]!,
    site: GEN_SITES[i % GEN_SITES.length]!,
    status,
    mode: !configured ? "OFF" : running ? "AUTO" : alert ? "MANUAL" : "STOP",
    ip: configured ? `10.50.1.${130 + i}` : "—",
    battery: configured ? Number((11.6 + ((i * 7) % 20) / 10).toFixed(1)) : null,
    frequency: running ? Number((59.6 + ((i * 3) % 8) / 10).toFixed(1)) : 0,
    rpm: running ? 1750 + ((i * 37) % 120) : 0,
    load: running ? 120 + ((i * 53) % 480) : 0,
    oilPressure: running ? Number((3.8 + ((i * 5) % 12) / 10).toFixed(1)) : 0,
    coolantTemp: running ? 72 + ((i * 11) % 18) : 0,
    fuelLevel: configured ? 35 + ((i * 17) % 60) : 0,
    alternatorVoltage: running ? 380 + ((i * 3) % 12) : 0,
    maintenance: configured ? [183, 140, 38, 12, 0, 95, 50, 200, 0, 72, 28, 55][i]! : 0,
    runHours: configured ? Number((150 + i * 42.7).toFixed(1)) : 0,
    latency: configured ? 180 + ((i * 97) % 900) : null,
    alarms: alert ? 2 : status === "offline" ? 1 : 0,
    mcb: configured && !running,
    gcb: running,
    mains: configured ? { l1: 127, l2: 126, l3: 125, l12: 220 } : { l1: 0, l2: 0, l3: 0, l12: 0 },
    gen: running ? { l1: 218, l2: 220, l3: 219, l12: 379 } : { l1: 0, l2: 0, l3: 0, l12: 0 },
  };
}

export const SEED_GENERATORS: Generator[] = Array.from({ length: 12 }, (_, i) => make(i));
export const generators: Generator[] = SEED_GENERATORS;
export const GENERATORS_KEY = "rc-generators";

let liveGenerators: Generator[] = SEED_GENERATORS.map((g) => ({ ...g, mains: { ...g.mains }, gen: { ...g.gen } }));

export function getGenerators() {
  return liveGenerators;
}

export function syncLiveGenerators(list: Generator[]) {
  liveGenerators = list;
}

export function nextGeneratorTag(list: Generator[]) {
  const nums = list.map((g) => Number(g.tag.replace(/\D/g, "")) || 0);
  const n = Math.max(0, ...nums) + 1;
  return { n, tag: `GEN${String(n).padStart(3, "0")}` };
}

export function createGeneratorRecord(
  list: Generator[],
  input: { tag?: string; controller: string; site: string; ip?: string },
): Generator {
  const { n, tag: autoTag } = nextGeneratorTag(list);
  const tag = (input.tag?.trim() || autoTag).toUpperCase();
  const ip = input.ip?.trim() || `10.50.1.${130 + n}`;
  return {
    id: `gen-${String(n).padStart(3, "0")}-${Date.now().toString(36)}`,
    tag,
    controller: input.controller,
    site: input.site,
    status: "offline",
    mode: "STOP",
    ip,
    battery: 12.6,
    frequency: 0,
    rpm: 0,
    load: 0,
    oilPressure: 0,
    coolantTemp: 0,
    fuelLevel: 80,
    alternatorVoltage: 0,
    maintenance: 300,
    runHours: 0,
    latency: 180,
    alarms: 0,
    mcb: true,
    gcb: false,
    mains: { l1: 127, l2: 126, l3: 125, l12: 220 },
    gen: { l1: 0, l2: 0, l3: 0, l12: 0 },
  };
}

export function getGenerator(id: string) {
  return liveGenerators.find((g) => g.id === id || g.tag.toLowerCase() === id.toLowerCase());
}

export function displayGenName(tag: string) {
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
}

export const statusLabel: Record<GenStatus, string> = {
  online: "ONLINE",
  alerta: "ALERTA",
  offline: "OFFLINE",
  nao_configurado: "NÃO CONFIGURADO",
};

export type EventItem = {
  gen: string;
  message: string;
  time: string;
  date: string;
  kind: "ok" | "info" | "battery" | "warn" | "error";
};

export const recentEvents: EventItem[] = [
  { gen: "GEN001", message: "Comunicação OK", time: "14:32:16", date: "23/05/2025", kind: "ok" },
  { gen: "GEN001", message: "Modo STOP", time: "14:32:15", date: "23/05/2025", kind: "info" },
  { gen: "GEN001", message: "Bateria 12,3 V", time: "14:32:14", date: "23/05/2025", kind: "battery" },
  { gen: "GEN007", message: "Latência alta: 856 ms", time: "14:32:13", date: "23/05/2025", kind: "warn" },
  { gen: "GEN005", message: "Comunicação perdida", time: "14:32:11", date: "23/05/2025", kind: "error" },
  { gen: "GEN003", message: "Exercício automático iniciado", time: "14:31:02", date: "23/05/2025", kind: "info" },
];
