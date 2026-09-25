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
  let requestId = response.headers.get("x-request-id")?.trim() || "";
  try {
    const payload = (await response.json()) as { detail?: unknown; requestId?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) message = payload.detail;
    if (typeof payload.requestId === "string" && payload.requestId.trim()) {
      requestId = payload.requestId.trim();
    }
  } catch {
    // Corpo não JSON: mantém status HTTP sem expor HTML/proxy body ao operador.
  }
  if (response.status >= 500 && requestId) {
    message += ` (ref: ${requestId})`;
  }
  return message;
}

function notifyUnauthorized(path: string) {
  if (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/password/reset")) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rc:unauthorized"));
  }
}

async function withResponse<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  if (externalSignal?.aborted) throw new HttpError(499, "Requisição cancelada");
  let timedOut = false;
  const abortExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortExternal, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
    });
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) throw new HttpError(408, "Tempo limite da requisição excedido");
      throw new HttpError(499, "Requisição cancelada");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortExternal);
  }
}

export async function httpRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  return withResponse(
    path,
    {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    },
    timeoutMs,
    async (response) => {
      if (!response.ok) {
        const message = await errorMessage(response);
        if (response.status === 401) notifyUnauthorized(path);
        throw new HttpError(response.status, message);
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
  );
}

export async function httpDownload(path: string, fallback: string, timeoutMs = 60_000) {
  const result = await withResponse(path, {}, timeoutMs, async (response) => {
    if (!response.ok) {
      const message = await errorMessage(response);
      if (response.status === 401) notifyUnauthorized(path);
      throw new HttpError(response.status, message);
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const matched = /filename="?([^";]+)"?/i.exec(disposition);
    return { filename: matched?.[1] ?? fallback, blob: await response.blob() };
  });
  const href = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
