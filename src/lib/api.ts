import type { Generator } from "@/data/generators";

const API_BASE = (import.meta.env.VITE_RC_API_BASE_URL ?? "").replace(/\/$/, "");

function url(path: string) {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url(path), {
    ...init,
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
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type CreateGeneratorPayload = {
  tag: string;
  controller: string;
  site: string;
  ip?: string;
};

export const rcApi = {
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
  },
};
