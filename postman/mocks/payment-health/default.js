// Status envelope follows the application's saved VNGZZ2 contract and adapter.
// Delay and failure bodies are test conditions, not observed provider behavior.
const http = require("node:http");
let probes = 0;
let delayMs = 550;
let mode = "healthy";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.local");
  const reply = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return reply(501, { error: "Health fixture supports reads only" });
  if (url.pathname === "/test/config") {
    mode = url.searchParams.get("mode") || "healthy";
    delayMs = Math.min(10_000, Math.max(0, Number(url.searchParams.get("delay")) || 0));
    return reply(200, { mode, delayMs });
  }
  if (url.pathname === "/test/state") return reply(200, { probes });
  if (url.pathname === "/v1/status") {
    probes++;
    return setTimeout(() => {
      if (mode === "unavailable") return reply(503, { message: "Fixture unavailable" });
      reply(200, { success: true, data: { state: "OPERATIONAL", service: "payment-health-fixture", version: "1.0" } });
    }, delayMs);
  }
  reply(501, { error: "Fixture does not model this endpoint" });
});
server.listen(Number(process.env.PORT || 4919), "127.0.0.1");
module.exports = server;
