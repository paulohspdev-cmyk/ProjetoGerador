import type { Generator } from "@/data/generators";
import type { AppUser, UserRole } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_RC_API_BASE_URL ?? "").replace(/\/$/, "");
function url(path: string) { return `${API_BASE}${path}`; }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "ApiError"; this.status = status; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const payload = (await response.json()) as { detail?: string }; if (payload.detail) message = payload.detail; } catch { /* no json */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function download(path: string, fallback: string) {
  const response = await fetch(url(path), { credentials: "include" });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const payload = (await response.json()) as { detail?: string }; if (payload.detail) message = payload.detail; } catch { /* no json */ }
    throw new ApiError(response.status, message);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = matched?.[1] ?? fallback;
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
}

export type GeneratorTransport = "reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp" | "modbus_rtu_serial";
export type CreateGeneratorPayload = { tag: string; controller: string; site: string; ip?: string; transport?: GeneratorTransport; listenPort?: number; modbusUnit?: number; rapidDeviceNum?: number };
export type UserCreatePayload = { name: string; email: string; password: string; role: UserRole };
export type UserUpdatePayload = { name?: string; password?: string; role?: UserRole; active?: boolean };
export type CommandResult = { ok: boolean; accepted: boolean; action?: string; reason?: string; return_value?: string; rpm_before?: number; rpm_after?: number | null };
export type AuditItem = { id: number; created_at: number; actor: string; action: string; entity_type: string; entity_id: string; detail: string };
export type EventItemApi = { id: number; generator_id: string | null; level: string; message: string; created_at: number; tag?: string | null; name?: string | null; site?: string | null };
export type RapidMetric = { key: string; cnl: number; scale: number };
export type RapidTrendPoint = { timestamp: string; value: number; stat: number };
export type RapidTrend = { generatorId: string; tag: string; metric: string; cnl: number; scale: number; archiveBit: number; start: string; end: string; points: RapidTrendPoint[] };
export type OpsClient = { id: string; name: string; units: number; gens: number; sla: string; active?: boolean };
export type OpsSite = { id: string; name: string; clientId?: string | null; clientName?: string; city: string; state?: string; address?: string; lat?: number | null; lng?: number | null; timezone?: string; active?: boolean };
export type WorkOrderApi = { id: string; generator_id?: string | null; gen: string; site: string; type: string; due: number; tech: string; status: "Urgente" | "Em andamento" | "Planejada" | "Concluída" | string; description?: string };
export type AgendaItemApi = { id: string; title: string; when: string; site: string; generatorId?: string | null; kind?: string; enabled?: boolean };
export type AutomationRuleApi = { id: string; name: string; trigger: string; action: string; enabled: boolean; safetyState?: string };
export type ReportApi = { id: string; name: string; period: string; format: string; status: string };
export type WebhookApi = { id: string; url: string; event: string; status: "Ativo" | "Pausado" | string; failures?: number };
export type BackupApi = { id: string; when: string; size: string; type: string; result: string; path?: string };
export type AlarmAckApi = { alarmKey: string; ackedBy: string; ackedAt: number };
export type FieldDevice = { id: string; kind: "modem" | "gateway"; name: string; site_id?: string | null; generator_id?: string | null; model: string; serial: string; imei: string; sim_iccid: string; carrier: string; host: string; rssi?: number | null; status: string; last_seen?: number | null; metadata?: Record<string, unknown>; active: boolean };
export type NotificationItem = { id: number; event_type: string; channel: string; destination: string; subject: string; body: string; status: string; attempts: number; max_attempts: number; next_attempt_at: number; last_error: string; created_at: number };
export type SchedulerJob = { id: string; name: string; kind: string; interval_seconds: number; payload?: Record<string, unknown>; enabled: boolean; next_run: number; last_run?: number | null; last_result: string };
export type ControllerPack = { packId: string; lifecycle: "production" | "lab"; manufacturer: string; family?: string; model: string; status: string; protocols?: string[]; transports?: string[]; capabilities?: Record<string, boolean>; validatedTelemetry?: string[]; notes?: string };
export type ControllerLibrary = { packs: ControllerPack[]; manufacturers: Array<{ id: string; name: string; models: number; production: number; lab: number }>; protocols: Array<{ id: string; name: string; packs: number }>; transports: Array<{ id: string; name: string; packs: number }>; counts: { total: number; production: number; lab: number } };
export type ChannelCatalogItem = { id: string; name: string; model: string; cnl: number; scale: number; access: string; source: string };
export type ServiceHealth = { id: string; name: string; status: string; detail: string };
export type SystemDiagnostics = {
  ok: boolean;
  services: ServiceHealth[];
  rapid: { bindingsExists: boolean; readerExists: boolean; commConfigExists: boolean };
  bridge: { controlSocket: string; controlSocketExists: boolean; reverseTcp15001Listening: boolean; rapidLocal25001Listening: boolean };
  host: { loadAverage: number[]; memory: { total: number; available: number; used: number; usedPercent: number } | null; disk: { total: number; used: number; free: number; usedPercent: number } };
  generators: Array<{ id: string; tag: string; status: string; rapidDeviceNum?: number | null; source?: string; lastError?: string; availableMetrics?: string[] }>;
  version: { application: string; apiVersion: string; gitSha: string; gitBranch: string; rapidScada: string };
};
export type ApiTokenItem = { id: string; name: string; token_prefix: string; scopes: string[]; rate_limit: number; active: boolean; expires_at?: number | null; last_used?: number | null; token?: string; warning?: string };
export type OpsBootstrap = { clients: OpsClient[]; sites: OpsSite[]; workOrders: WorkOrderApi[]; agenda: AgendaItemApi[]; rules: AutomationRuleApi[]; reports: ReportApi[]; webhooks: WebhookApi[]; settings: Record<string, unknown>; backups: BackupApi[]; alarmAcks: AlarmAckApi[]; fieldDevices?: FieldDevice[]; notifications?: NotificationItem[]; scheduler?: SchedulerJob[] };

export const rcApi = {
  auth: {
    login: (email: string, password: string, otp?: string) => request<AppUser & { twoFactorEnabled?: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, ...(otp ? { otp } : {}) }) }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    me: () => request<AppUser & { twoFactorEnabled?: boolean }>("/api/auth/me"),
    changePassword: (currentPassword: string, newPassword: string) => request<void>("/api/auth/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    requestReset: (email: string) => request<{ accepted: boolean }>("/api/auth/password/reset-request", { method: "POST", body: JSON.stringify({ email }) }),
    confirmReset: (token: string, newPassword: string) => request<void>("/api/auth/password/reset-confirm", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
    setup2fa: () => request<{ secret: string; otpauthUri: string }>("/api/auth/2fa/setup", { method: "POST" }),
    enable2fa: (code: string) => request<void>("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
    disable2fa: (code: string) => request<void>("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
    sessions: () => request<Array<{ id: string; expiresAt: number; createdAt: number; lastSeen: number; remoteIp: string; userAgent: string }>>("/api/auth/sessions"),
    revokeSessions: () => request<void>("/api/auth/sessions", { method: "DELETE" }),
  },
  users: {
    list: () => request<AppUser[]>("/api/users"),
    create: (payload: UserCreatePayload) => request<AppUser>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: UserUpdatePayload) => request<AppUser>(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  generators: {
    list: () => request<Generator[]>("/api/generators"),
    get: (id: string) => request<Generator>(`/api/generators/${encodeURIComponent(id)}`),
    create: (payload: CreateGeneratorPayload) => request<Generator>("/api/generators", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<CreateGeneratorPayload> & { enabled?: boolean }) => request<Generator>(`/api/generators/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/api/generators/${encodeURIComponent(id)}`, { method: "DELETE" }),
    command: (id: string, action: "start" | "stop") => request<CommandResult>(`/api/generators/${encodeURIComponent(id)}/commands/${action}`, { method: "POST", body: JSON.stringify({ confirmation: action.toUpperCase() }) }),
    metrics: (id: string) => request<RapidMetric[]>(`/api/generators/${encodeURIComponent(id)}/metrics`),
    trend: (id: string, metric: string, hours = 24, archiveBit = 1) => request<RapidTrend>(`/api/generators/${encodeURIComponent(id)}/trends/${encodeURIComponent(metric)}?hours=${hours}&archiveBit=${archiveBit}`),
    transportConfig: (id: string) => request<Record<string, unknown>>(`/api/generators/${encodeURIComponent(id)}/transport-config`),
    setTransportConfig: (id: string, config: Record<string, unknown>) => request<Record<string, unknown>>(`/api/generators/${encodeURIComponent(id)}/transport-config`, { method: "PUT", body: JSON.stringify({ config }) }),
    provision: (id: string) => request<{ ok: boolean; existing?: boolean; binding?: unknown }>(`/api/generators/${encodeURIComponent(id)}/provision`, { method: "POST" }),
  },
  audit: { list: (limit = 200) => request<AuditItem[]>(`/api/audit?limit=${limit}`) },
  events: { list: (limit = 200) => request<EventItemApi[]>(`/api/events?limit=${limit}`) },
  ops: { bootstrap: () => request<OpsBootstrap>("/api/ops/bootstrap") },
  clients: {
    list: () => request<OpsClient[]>("/api/clients"),
    create: (payload: { name: string; units: number; gens: number; sla: string }) => request<OpsClient>("/api/clients", { method: "POST", body: JSON.stringify(payload) }),
  },
  sites: {
    list: () => request<OpsSite[]>("/api/sites"),
    create: (payload: { name: string; clientId?: string; city?: string; state?: string; address?: string; latitude?: number; longitude?: number; timezone?: string }) => request<OpsSite>("/api/sites", { method: "POST", body: JSON.stringify(payload) }),
  },
  workOrders: {
    list: () => request<WorkOrderApi[]>("/api/work-orders"),
    create: (payload: { generatorId?: string; gen?: string; site?: string; type: string; due?: number; tech?: string; status?: string; description?: string }) => request<WorkOrderApi>("/api/work-orders", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<WorkOrderApi, "type" | "due" | "tech" | "status" | "description">>) => request<WorkOrderApi>(`/api/work-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  },
  agenda: {
    list: () => request<AgendaItemApi[]>("/api/agenda"),
    create: (payload: { title: string; when: string; site: string; generatorId?: string; kind?: string }) => request<AgendaItemApi>("/api/agenda", { method: "POST", body: JSON.stringify(payload) }),
  },
  rules: {
    list: () => request<AutomationRuleApi[]>("/api/automation/rules"),
    create: (payload: { name: string; trigger: string; action: string }) => request<AutomationRuleApi>("/api/automation/rules", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<AutomationRuleApi, "name" | "trigger" | "action" | "enabled">>) => request<AutomationRuleApi>(`/api/automation/rules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    approve: (id: string) => request<AutomationRuleApi>(`/api/automation/rules/${encodeURIComponent(id)}/approve`, { method: "POST" }),
    enable: (id: string, enabled: boolean) => request<AutomationRuleApi>(`/api/automation/rules/${encodeURIComponent(id)}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  },
  reports: {
    list: () => request<ReportApi[]>("/api/reports"),
    create: (payload: { name: string; period: string; format: string }) => request<ReportApi>("/api/reports", { method: "POST", body: JSON.stringify(payload) }),
    download: (id: string) => download(`/api/reports/${encodeURIComponent(id)}/download`, id),
  },
  webhooks: {
    list: () => request<WebhookApi[]>("/api/webhooks"),
    create: (payload: { url: string; event: string }) => request<WebhookApi>("/api/webhooks", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<Pick<WebhookApi, "url" | "event" | "status">>) => request<WebhookApi>(`/api/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  },
  settings: {
    list: () => request<Record<string, unknown>>("/api/settings"),
    set: (key: string, value: unknown) => request<{ key: string; value: unknown; updated_at: number }>(`/api/settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) }),
  },
  backups: {
    list: () => request<BackupApi[]>("/api/backups"),
    create: () => request<BackupApi>("/api/backups", { method: "POST" }),
    download: (id: string) => download(`/api/backups/${encodeURIComponent(id)}/download`, `${id}.tar.gz`),
  },
  alarms: {
    acknowledgements: () => request<AlarmAckApi[]>("/api/alarms/ack"),
    acknowledge: (alarmKey: string) => request<AlarmAckApi>("/api/alarms/ack", { method: "POST", body: JSON.stringify({ alarmKey }) }),
  },
  library: {
    get: () => request<ControllerLibrary>("/api/library"),
    channels: () => request<ChannelCatalogItem[]>("/api/library/channels"),
  },
  fieldDevices: {
    list: (kind?: "modem" | "gateway") => request<FieldDevice[]>(`/api/field-devices${kind ? `?kind=${kind}` : ""}`),
    create: (payload: Omit<FieldDevice, "id" | "active"> & { active?: boolean }) => request<FieldDevice>("/api/field-devices", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<FieldDevice>) => request<FieldDevice>(`/api/field-devices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/api/field-devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  notifications: {
    list: (limit = 200) => request<NotificationItem[]>(`/api/notifications?limit=${limit}`),
    test: (channel: "panel" | "email" | "whatsapp" | "webhook", destination = "") => request<{ id: number; status: string }>("/api/notifications/test", { method: "POST", body: JSON.stringify({ channel, destination }) }),
  },
  scheduler: {
    list: () => request<SchedulerJob[]>("/api/scheduler"),
    create: (payload: { id?: string; name: string; kind: "backup" | "report" | "notification"; interval_seconds: number; payload?: Record<string, unknown>; enabled?: boolean }) => request<SchedulerJob>("/api/scheduler", { method: "POST", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/api/scheduler/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  apiTokens: {
    list: () => request<ApiTokenItem[]>("/api/api-tokens"),
    create: (payload: { name: string; scopes: string[]; rateLimit?: number; expiresAt?: number }) => request<ApiTokenItem>("/api/api-tokens", { method: "POST", body: JSON.stringify(payload) }),
    revoke: (id: string) => request<void>(`/api/api-tokens/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  system: {
    health: () => request<SystemDiagnostics>("/api/system/health"),
    diagnostics: () => request<SystemDiagnostics>("/api/system/diagnostics"),
    version: () => request<SystemDiagnostics["version"]>("/api/system/version"),
  },
};
