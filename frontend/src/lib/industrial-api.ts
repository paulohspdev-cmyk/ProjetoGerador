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
  industrialStateConsistent?: boolean;
  canDeleteSafely: boolean;
};

export type LifecycleTransport =
  "reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp" | "modbus_rtu_serial";

type LifecycleOperation<T = Record<string, unknown>> = {
  operationId: string;
  generatorId: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result: T;
  error: string;
  createdAt: number;
  updatedAt: number;
};

const lifecycleDelay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function runLifecycle<T extends Record<string, unknown>>(
  generatorId: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const operationId = crypto.randomUUID();
  const start = () =>
    request<LifecycleOperation<T>>(
      path,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, operationId }),
      },
      20_000,
    );

  let operation: LifecycleOperation<T>;
  try {
    operation = await start();
  } catch {
    // Retry is idempotent because the same operationId is reused.
    operation = await start();
  }

  const deadline = Date.now() + 15 * 60_000;
  while (operation.status === "queued" || operation.status === "running") {
    if (Date.now() >= deadline) {
      throw new Error(
        `Operação ${operation.operationId} continua em andamento. Consulte novamente o estado antes de repetir.`,
      );
    }
    await lifecycleDelay(1_000);
    operation = await request<LifecycleOperation<T>>(
      `/api/generators/${encodeURIComponent(generatorId)}/operations/${encodeURIComponent(operationId)}`,
      {},
      20_000,
    );
  }
  if (operation.status === "failed") {
    throw new Error(
      operation.error || `Operação ${operation.operationId} falhou sem detalhe adicional.`,
    );
  }
  return operation.result;
}

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
      runLifecycle<Record<string, unknown>>(
        id,
        `/api/generators/${encodeURIComponent(id)}/provision`,
        { confirmation: "PROVISION" },
      ),
    deprovision: (id: string) =>
      runLifecycle<Record<string, unknown>>(
        id,
        `/api/generators/${encodeURIComponent(id)}/deprovision`,
        { confirmation: "DEPROVISION" },
      ),
    reconfigure: (
      id: string,
      tag: string,
      payload: {
        transport: LifecycleTransport;
        ip: string;
        listenPort: number;
        modbusUnit: number;
        enabled?: boolean;
      },
    ) =>
      runLifecycle<Record<string, unknown>>(
        id,
        `/api/generators/${encodeURIComponent(id)}/reconfigure`,
        { ...payload, confirmation: `RECONFIGURAR ${tag}` },
      ),
    retire: (id: string, tag: string) =>
      runLifecycle<{
        ok: boolean;
        generatorId: string;
        tag: string;
        deprovisioned: boolean;
        historyPreserved: boolean;
      }>(id, `/api/generators/${encodeURIComponent(id)}/retire`, {
        confirmation: `RETIRAR ${tag}`,
      }),
  },
  discovery: {
    modbusTcp: (cidr: string, port = 502, timeoutMs = 350) =>
      request<{
        cidr: string;
        port: number;
        scannedHosts: number;
        found: Array<{ host: string; port: number; latencyMs: number; state: "tcp_open" }>;
        method: "tcp_connect_only";
        readOnly: true;
      }>("/api/network-discovery/modbus-tcp", {
        method: "POST",
        body: JSON.stringify({
          cidr,
          port,
          timeoutMs,
          confirmation: "SCAN SOMENTE LEITURA",
        }),
      }),
  },
};
