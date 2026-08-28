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
  },
  audit: {
    list: (limit = 200) => request<AuditItem[]>(`/api/audit?limit=${limit}`),
  },
  events: {
    list: (limit = 200) => request<EventItemApi[]>(`/api/events?limit=${limit}`),
  },
};
