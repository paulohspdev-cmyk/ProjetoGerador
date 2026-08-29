const API_BASE = (import.meta.env["VITE_RC_API_BASE_URL"] ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // resposta sem JSON
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type AssetKind =
  | "genset"
  | "mains"
  | "ats"
  | "bus"
  | "bess"
  | "engine"
  | "switchgear"
  | "light_tower"
  | "pump"
  | "microgrid"
  | "field_gateway"
  | "other";

export type AssetV3 = {
  id: string;
  tag: string;
  name: string;
  kind: AssetKind;
  site: string;
  site_id?: string | null;
  customer: string;
  legacy_generator_id?: string | null;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  controllers?: ControllerInstanceV3[];
};

export type ControllerConnectionV3 = {
  id: string;
  controller_id: string;
  name: string;
  transport: string;
  host: string;
  listen_port: number;
  modbus_unit: number;
  rapid_device_num?: number | null;
  enabled: boolean;
  config?: Record<string, unknown>;
};

export type ControllerInstanceV3 = {
  id: string;
  asset_id?: string | null;
  asset_tag?: string | null;
  asset_site?: string | null;
  manufacturer: string;
  family: string;
  model: string;
  firmware: string;
  pack_id?: string | null;
  pack_lifecycle?: "production" | "lab" | null;
  state: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  connections?: ControllerConnectionV3[];
};

export type TopologyV3 = {
  assets: AssetV3[];
  links: Array<{ id: string; from_asset_id: string; to_asset_id: string; relation: string; metadata?: Record<string, unknown> }>;
  counts: { assets: number; controllers: number; connections: number; links: number };
};

export type EquipmentBundlePayload = {
  asset: {
    tag: string;
    name?: string;
    kind: AssetKind;
    site: string;
    customer?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  };
  controller: {
    manufacturer?: string;
    family?: string;
    model: string;
    firmware?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  };
  connection?: {
    name?: string;
    transport: "reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp" | "modbus_rtu_serial";
    host?: string;
    listen_port: number;
    modbus_unit: number;
    rapid_device_num?: number;
    enabled?: boolean;
    config?: Record<string, unknown>;
  };
};

export type EquipmentBundleResult = {
  asset: AssetV3;
  controller: ControllerInstanceV3;
  connection: ControllerConnectionV3 | null;
  provisionable: boolean;
  pack: { id?: string | null; lifecycle?: string | null; status?: string | null } | null;
};

export const domainApi = {
  topology: () => request<TopologyV3>("/api/topology"),
  createBundle: (payload: EquipmentBundlePayload) =>
    request<EquipmentBundleResult>("/api/equipment-bundles", { method: "POST", body: JSON.stringify(payload) }),
};
