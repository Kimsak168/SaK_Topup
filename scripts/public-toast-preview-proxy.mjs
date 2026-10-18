import http from "node:http";

// Local verification only: preserve the real frontend and send mutable API
// traffic to Postman. No production configuration or fetch implementation changes.
const previewPort = Number(process.env.TOAST_PREVIEW_PORT || 3011);
const frontendPort = Number(process.env.TOAST_FRONTEND_PORT || 3010);
const simulationPort = Number(process.env.TOAST_SIMULATION_PORT || 4900);

http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const simulated = pathname.startsWith("/__simulation/") || pathname === "/khqrcc-plugin.js" ||
    (pathname.startsWith("/api/") && !(req.method === "GET" && pathname === "/api/games"));
  const path = simulated ? "/storefront" + req.url.replace(/^\/__simulation/, "") : req.url;
  const port = simulated ? simulationPort : frontendPort;
  const upstream = http.request({ hostname: "127.0.0.1", port, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Local simulation unavailable" }));
  });
  req.pipe(upstream);
}).listen(previewPort, "127.0.0.1", () => {
  console.log(`Notification preview listening at http://127.0.0.1:${previewPort}`);
});
