import "./lib/error-capture";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const RETAINED_ASSET_CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveRetainedAssetFallback(request: Request, response: Response): Promise<Response> {
  if (response.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) {
    return response;
  }

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/assets/")) return response;

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(url.pathname.slice("/assets/".length));
  } catch {
    return response;
  }
  if (!relativePath || relativePath.includes("\0")) return response;

  const assetRoot = resolve(process.cwd(), ".output/public/assets");
  const candidatePath = resolve(assetRoot, relativePath);
  if (!candidatePath.startsWith(`${assetRoot}${sep}`)) return response;

  try {
    const [realAssetRoot, realCandidatePath] = await Promise.all([
      realpath(assetRoot),
      realpath(candidatePath),
    ]);
    if (!realCandidatePath.startsWith(`${realAssetRoot}${sep}`)) return response;

    const body = await readFile(realCandidatePath);
    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(body.byteLength),
      "Content-Type":
        RETAINED_ASSET_CONTENT_TYPES[extname(realCandidatePath).toLowerCase()] ??
        "application/octet-stream",
      "X-RC-Retained-Asset": "1",
    });
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") console.error(error);
    return response;
  }
}

function withDeploymentSafeCacheHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) return response;

  // HTML aponta para chunks com hash de uma release específica. Ele não pode
  // ficar cacheado enquanto um deploy substitui os assets; senão o navegador
  // tenta carregar chunks que já não existem e cai na tela de erro.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function catastrophicErrorResponse() {
  return withDeploymentSafeCacheHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const compatible = await serveRetainedAssetFallback(request, normalized);
      return withDeploymentSafeCacheHeaders(compatible);
    } catch (error) {
      console.error(error);
      return catastrophicErrorResponse();
    }
  },
};
