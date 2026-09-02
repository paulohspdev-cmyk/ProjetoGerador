import { httpRequest as request } from "@/lib/http-client";

export type IndustrialAlarm = {
  alarm_key: string;
  generator_id?: string | null;
  asset_id?: string | null;
  source: string;
  code: string;
  severity: "warning" | "alarm" | "fault" | "info" | string;
  message: string;
  active: boolean;
  first_seen: number;
  last_seen: number;
  cleared_at?: number | null;
  acked_by?: string | null;
  acked_at?: number | null;
  metadata?: Record<string, unknown>;
};

export type ProcessEvent = {
  id: number;
  created_at: number;
  generator_id?: string | null;
  asset_id?: string | null;
  source: string;
  event_type: string;
  severity: string;
  code: string;
  message: string;
  value?: Record<string, unknown>;
};

export type MaintenancePlan = {
  id: string;
  generator_id?: string | null;
  asset_id?: string | null;
  generator_tag?: string | null;
  name: string;
  kind: string;
  interval_hours?: number | null;
  interval_days?: number | null;
  warning_hours: number;
  warning_days: number;
  last_service_hours?: number | null;
  last_service_at?: number | null;
  notes: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
  current_hours?: number | null;
  hour_remaining?: number | null;
  day_remaining?: number | null;
  state?: "due" | "warning" | "ok" | "unknown" | string;
};

export type MaintenanceHistory = {
  id: number;
  plan_id: string;
  generator_id?: string | null;
  asset_id?: string | null;
  serviced_hours?: number | null;
  serviced_at: number;
  notes: string;
  actor: string;
};

export type EscalationPolicy = {
  id: string;
  name: string;
  severity: "warning" | "alarm" | "fault" | "any" | string;
  after_seconds: number;
  channel: "panel" | "email" | "whatsapp" | "webhook" | string;
  destination: string;
  repeat_seconds: number;
  max_repeats: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
};

export type GeneratorLifecycle = {
  generatorId: string;
  tag: string;
  provisioned: boolean;
  binding?: unknown;
  canDeleteSafely: boolean;
};

export const industrialApi = {
  alarms: {
    list: (activeOnly = true) =>
      request<IndustrialAlarm[]>(
        `/api/industrial/alarms?activeOnly=${activeOnly ? "true" : "false"}`,
      ),
    ack: (alarmKey: string) =>
      request<IndustrialAlarm>("/api/industrial/alarms/ack", {
        method: "POST",
        body: JSON.stringify({ alarmKey }),
      }),
  },
  processEvents: {
    list: (limit = 500, generatorId = "", severity = "") => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (generatorId) params.set("generatorId", generatorId);
      if (severity) params.set("severity", severity);
      return request<ProcessEvent[]>(`/api/industrial/process-events?${params.toString()}`);
    },
  },
  maintenance: {
    list: () => request<MaintenancePlan[]>("/api/industrial/maintenance"),
    history: (planId = "") =>
      request<MaintenanceHistory[]>(
        `/api/industrial/maintenance-history${planId ? `?planId=${encodeURIComponent(planId)}` : ""}`,
      ),
    create: (payload: {
      generatorId?: string;
      assetId?: string;
      name: string;
      kind?: string;
      intervalHours?: number;
      intervalDays?: number;
      warningHours?: number;
      warningDays?: number;
      lastServiceHours?: number;
      notes?: string;
    }) =>
      request<MaintenancePlan>("/api/industrial/maintenance", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: Partial<{
        name: string;
        kind: string;
        intervalHours: number;
        intervalDays: number;
        warningHours: number;
        warningDays: number;
        notes: string;
        enabled: boolean;
      }>,
    ) =>
      request<MaintenancePlan>(`/api/industrial/maintenance/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    complete: (id: string, servicedHours?: number, notes = "") =>
      request<MaintenancePlan>(`/api/industrial/maintenance/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        body: JSON.stringify({ ...(servicedHours != null ? { servicedHours } : {}), notes }),
      }),
  },
  escalations: {
    list: () => request<EscalationPolicy[]>("/api/industrial/escalations"),
    create: (payload: {
      name: string;
      severity: string;
      afterSeconds: number;
      channel: string;
      destination?: string;
      repeatSeconds?: number;
      maxRepeats?: number;
    }) =>
      request<EscalationPolicy>("/api/industrial/escalations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: Partial<{
        name: string;
        severity: string;
        afterSeconds: number;
        channel: string;
        destination: string;
        repeatSeconds: number;
        maxRepeats: number;
        enabled: boolean;
      }>,
    ) =>
      request<EscalationPolicy>(`/api/industrial/escalations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`/api/industrial/escalations/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  lifecycle: {
    get: (id: string) =>
      request<GeneratorLifecycle>(`/api/generators/${encodeURIComponent(id)}/lifecycle`),
    provision: (id: string) =>
      request<Record<string, unknown>>(`/api/generators/${encodeURIComponent(id)}/provision`, {
        method: "POST",
        body: JSON.stringify({ confirmation: "PROVISION" }),
      }),
    deprovision: (id: string) =>
      request<Record<string, unknown>>(`/api/generators/${encodeURIComponent(id)}/deprovision`, {
        method: "POST",
        body: JSON.stringify({ confirmation: "DEPROVISION" }),
      }),
    retire: (id: string, tag: string) =>
      request<{
        ok: boolean;
        generatorId: string;
        tag: string;
        deprovisioned: boolean;
        historyPreserved: boolean;
      }>(`/api/generators/${encodeURIComponent(id)}/retire`, {
        method: "POST",
        body: JSON.stringify({ confirmation: `RETIRAR ${tag}` }),
      }),
  },
};
