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

export type AssetLinkV3 = {
  id: string;
  from_asset_id: string;
  to_asset_id: string;
  relation: string;
  metadata?: Record<string, unknown>;
};

export type TopologyV3 = {
  assets: AssetV3[];
  links: AssetLinkV3[];
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
    request<EquipmentBundleResult>("/api/equipment-bundles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createLink: (
    fromAssetId: string,
    toAssetId: string,
    relation: string,
    metadata: Record<string, unknown> = {},
  ) =>
    request<AssetLinkV3>("/api/asset-links", {
      method: "POST",
      body: JSON.stringify({
        from_asset_id: fromAssetId,
        to_asset_id: toAssetId,
        relation,
        metadata,
      }),
    }),
  updateAsset: (
    id: string,
    payload: Partial<
      Pick<AssetV3, "tag" | "name" | "kind" | "site" | "customer" | "enabled" | "metadata">
    >,
  ) =>
    request<AssetV3>(`/api/assets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  removeAsset: (id: string) =>
    request<void>(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateController: (
    id: string,
    payload: Partial<Pick<ControllerInstanceV3, "asset_id" | "firmware" | "enabled" | "metadata">>,
  ) =>
    request<ControllerInstanceV3>(`/api/controllers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  removeController: (id: string) =>
    request<void>(`/api/controllers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateConnection: (
    id: string,
    payload: Partial<
      Pick<
        ControllerConnectionV3,
        | "name"
        | "transport"
        | "host"
        | "listen_port"
        | "modbus_unit"
        | "rapid_device_num"
        | "enabled"
        | "config"
      >
    >,
  ) =>
    request<ControllerConnectionV3>(`/api/connections/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  removeConnection: (id: string) =>
    request<void>(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  removeLink: (id: string) =>
    request<void>(`/api/asset-links/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
