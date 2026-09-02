const API_BASE = (import.meta.env["VITE_RC_API_BASE_URL"] ?? "").replace(/\/$/, "");

export class HttpError extends Error {
  status: number;
  detail: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.detail = message;
  }
}

async function errorMessage(response: Response) {
  let message = `HTTP ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) message = payload.detail;
  } catch {
    // Corpo não JSON: mantém status HTTP sem expor HTML/proxy body ao operador.
  }
  return message;
}

async function fetchWithTimeout(path: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortExternal, { once: true });
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new HttpError(408, "Tempo limite da requisição excedido");
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortExternal);
  }
}

export async function httpRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const response = await fetchWithTimeout(
    path,
    {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    },
    timeoutMs,
  );
  if (!response.ok) throw new HttpError(response.status, await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function httpDownload(path: string, fallback: string, timeoutMs = 60_000) {
  const response = await fetchWithTimeout(path, {}, timeoutMs);
  if (!response.ok) throw new HttpError(response.status, await errorMessage(response));
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = matched?.[1] ?? fallback;
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
