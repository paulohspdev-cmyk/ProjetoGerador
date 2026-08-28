import type { Generator } from "@/data/generators";
import type { AppUser, UserRole } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_RC_API_BASE_URL ?? "").replace(/\/$/, "");

function url(path: string) {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function download(path: string, filename: string) {
  const response = await fetch(url(path), { credentials: "include" });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(response.status, message);
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export type GeneratorTransport =
  | "reverse_tcp"
  | "modbus_tcp_direct"
  | "rtu_over_tcp"
  | "modbus_rtu_serial";

export type CreateGeneratorPayload = {
  tag: string;
  controller: string;
  site: string;
  ip?: string;
  transport?: GeneratorTransport;
  listenPort?: number;
  modbusUnit?: number;
  rapidDeviceNum?: number;
};

export type UserCreatePayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export type UserUpdatePayload = {
  name?: string;
  password?: string;
  role?: UserRole;
  active?: boolean;
};

export type CommandResult = {
  ok: boolean;
  accepted: boolean;
  action?: string;
  reason?: string;
  return_value?: string;
  rpm_before?: number;
  rpm_after?: number | null;
};

export type AuditItem = {
  id: number;
  created_at: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
};

export type EventItemApi = {
  id: number;
  generator_id: string | null;
  level: string;
  message: string;
  created_at: number;
  tag?: string | null;
  name?: string | null;
  site?: string | null;
};

export type RapidMetric = {
  key: string;
  cnl: number;
  scale: number;
};

export type RapidTrendPoint = {
  timestamp: string;
  value: number;
  stat: number;
};

export type RapidTrend = {
  generatorId: string;
  tag: string;
  metric: string;
  cnl: number;
  scale: number;
  archiveBit: number;
  start: string;
  end: string;
  points: RapidTrendPoint[];
};

export type OpsClient = {
  id: string;
  name: string;
  units: number;
  gens: number;
  sla: string;
  active?: boolean;
};

export type OpsSite = {
  id: string;
  name: string;
  clientId?: string | null;
  clientName?: string;
  city: string;
  state?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  timezone?: string;
  active?: boolean;
};

export type WorkOrderApi = {
  id: string;
  generator_id?: string | null;
  gen: string;
  site: string;
  type: string;
  due: number;
  tech: string;
  status: "Urgente" | "Em andamento" | "Planejada" | "Concluída" | string;
  description?: string;
};

export type AgendaItemApi = {
  id: string;
  title: string;
  when: string;
  site: string;
  generatorId?: string | null;
  kind?: string;
  enabled?: boolean;
};

export type AutomationRuleApi = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  safetyState?: string;
};

export type ReportApi = {
  id: string;
  name: string;
  period: string;
  format: string;
  status: string;
};

export type WebhookApi = {
  id: string;
  url: string;
  event: string;
  status: "Ativo" | "Pausado" | string;
  failures?: number;
};

export type BackupApi = {
  id: string;
  when: string;
  size: string;
  type: string;
  result: string;
};

export type AlarmAckApi = {
  alarmKey: string;
  ackedBy: string;
  ackedAt: number;
};

export type OpsBootstrap = {
  clients: OpsClient[];
  sites: OpsSite[];
  workOrders: WorkOrderApi[];
  agenda: AgendaItemApi[];
  rules: AutomationRuleApi[];
  reports: ReportApi[];
  webhooks: WebhookApi[];
  settings: Record<string, unknown>;
  backups: BackupApi[];
  alarmAcks: AlarmAckApi[];
};

export type SystemHealth = {
  ok: boolean;
  service: string;
  version: string;
  rapid: {
    bindings: string;
    bindingsExists: boolean;
    reader: string;
    readerExists: boolean;
    commConfig: string;
    commConfigExists: boolean;
  };
  generators?: Record<string, number>;
};

export const rcApi = {
  auth: {
    login: (email: string, password: string) =>
      request<AppUser>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    me: () => request<AppUser>("/api/auth/me"),
  },
  users: {
    list: () => request<AppUser[]>("/api/users"),
    create: (payload: UserCreatePayload) =>
      request<AppUser>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: UserUpdatePayload) =>
      request<AppUser>(`/api/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  generators: {
    list: () => request<Generator[]>("/api/generators"),
    get: (id: string) => request<Generator>(`/api/generators/${encodeURIComponent(id)}`),
    create: (payload: CreateGeneratorPayload) =>
      request<Generator>("/api/generators", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`/api/generators/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    command: (id: string, action: "start" | "stop") =>
      request<CommandResult>(`/api/generators/${encodeURIComponent(id)}/commands/${action}`, {
        method: "POST",
        body: JSON.stringify({ confirmation: action.toUpperCase() }),
      }),
    metrics: (id: string) => request<RapidMetric[]>(`/api/generators/${encodeURIComponent(id)}/metrics`),
    trend: (id: string, metric: string, hours = 24, archiveBit = 1) =>
      request<RapidTrend>(
        `/api/generators/${encodeURIComponent(id)}/trends/${encodeURIComponent(metric)}?hours=${hours}&archiveBit=${archiveBit}`,
      ),
  },
  audit: {
    list: (limit = 200) => request<AuditItem[]>(`/api/audit?limit=${limit}`),
  },
  events: {
    list: (limit = 200) => request<EventItemApi[]>(`/api/events?limit=${limit}`),
  },
  ops: {
    bootstrap: () => request<OpsBootstrap>("/api/ops/bootstrap"),
  },
  clients: {
    list: () => request<OpsClient[]>("/api/clients"),
    create: (payload: { name: string; units: number; gens: number; sla: string }) =>
      request<OpsClient>("/api/clients", { method: "POST", body: JSON.stringify(payload) }),
  },
  sites: {
    list: () => request<OpsSite[]>("/api/sites"),
    create: (payload: {
      name: string;
      clientId?: string;
      city?: string;
      state?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
    }) => request<OpsSite>("/api/sites", { method: "POST", body: JSON.stringify(payload) }),
  },
  workOrders: {
    list: () => request<WorkOrderApi[]>("/api/work-orders"),
    create: (payload: {
      generatorId?: string;
      gen?: string;
      site?: string;
      type: string;
      due?: number;
      tech?: string;
      status?: string;
      description?: string;
    }) => request<WorkOrderApi>("/api/work-orders", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<WorkOrderApi, "type" | "due" | "tech" | "status" | "description">>) =>
      request<WorkOrderApi>(`/api/work-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  agenda: {
    list: () => request<AgendaItemApi[]>("/api/agenda"),
    create: (payload: { title: string; when: string; site: string; generatorId?: string; kind?: string }) =>
      request<AgendaItemApi>("/api/agenda", { method: "POST", body: JSON.stringify(payload) }),
  },
  rules: {
    list: () => request<AutomationRuleApi[]>("/api/automation/rules"),
    create: (payload: { name: string; trigger: string; action: string }) =>
      request<AutomationRuleApi>("/api/automation/rules", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<AutomationRuleApi, "name" | "trigger" | "action" | "enabled">>) =>
      request<AutomationRuleApi>(`/api/automation/rules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  reports: {
    list: () => request<ReportApi[]>("/api/reports"),
    create: (payload: { name: string; period: string; format: string }) =>
      request<ReportApi>("/api/reports", { method: "POST", body: JSON.stringify(payload) }),
    download: (id: string) => download(`/api/reports/${encodeURIComponent(id)}/download`, `${id}.csv`),
  },
  webhooks: {
    list: () => request<WebhookApi[]>("/api/webhooks"),
    create: (payload: { url: string; event: string }) =>
      request<WebhookApi>("/api/webhooks", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<WebhookApi, "url" | "event" | "status">>) =>
      request<WebhookApi>(`/api/webhooks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  settings: {
    list: () => request<Record<string, unknown>>("/api/settings"),
    set: (key: string, value: unknown) =>
      request<{ key: string; value: unknown; updated_at: number }>(`/api/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
  },
  backups: {
    list: () => request<BackupApi[]>("/api/backups"),
    create: () => request<BackupApi>("/api/backups", { method: "POST" }),
  },
  alarms: {
    acknowledgements: () => request<AlarmAckApi[]>("/api/alarms/ack"),
    acknowledge: (alarmKey: string) =>
      request<AlarmAckApi>("/api/alarms/ack", { method: "POST", body: JSON.stringify({ alarmKey }) }),
  },
  system: {
    health: () => request<SystemHealth>("/api/system/health"),
  },
};
