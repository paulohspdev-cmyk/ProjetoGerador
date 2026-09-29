import http from "node:http";

const listenPort = Number(process.env.E2E_PROXY_PORT || 13100);
const apiPort = Number(process.env.E2E_API_PORT || 18090);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 13000);

const server = http.createServer((req, res) => {
  const targetPort = (req.url || "/").startsWith("/api/") ? apiPort : frontendPort;
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`upstream unavailable: ${error.message}`);
  });
  req.pipe(upstream);
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(`[e2e-proxy] http://127.0.0.1:${listenPort}`);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
