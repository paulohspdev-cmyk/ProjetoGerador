export type GenStatus = "online" | "alerta" | "offline" | "nao_configurado";
export type GeneratorTransport =
  "reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp" | "modbus_rtu_serial";

export type Generator = {
  id: string;
  tag: string;
  name?: string;
  customer?: string;
  controller: string;
  controllerType?: string;
  site: string;
  enabled?: boolean;
  status: GenStatus;
  mode: "AUTO" | "MANUAL" | "STOP" | "TESTE" | "OFF";
  ip: string;
  transport?: GeneratorTransport;
  listenPort?: number | null;
  modbusUnit?: number | null;
  battery: number | null;
  frequency: number | null;
  mainsFrequency?: number | null;
  nominalPower?: number | null;
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
  availableMetrics?: string[];
  metricUnits?: Record<string, string>;
  telemetrySource?: "rapid_scada" | "none" | string;
  rapidDeviceNum?: number | null;
  lastError?: string;
};

// Estes arrays servem apenas como opções de formulário. Dados operacionais nunca são
// criados a partir deles; a fonte de geradores é exclusivamente a API.
export const GEN_SITES: string[] = [];
export const CONTROLLER_MODELS = ["ComAp InteliGen 200"];

let liveGenerators: Generator[] = [];

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

export const recentEvents: EventItem[] = [];
