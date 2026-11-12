// Run the built Next.js health route against a local Postman dependency.
// Never loads live payment credentials or creates payments or orders.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const simulation = process.argv[2] || "http://127.0.0.1:4919/gateway";
assert.match(simulation, /^http:\/\/(localhost|127\.0\.0\.1):\d+\/gateway$/);
const base = "http://127.0.0.1:3128";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = async path => {
  const response = await fetch(simulation + path, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  return response.json();
};
await fixture("/test/config?mode=healthy&delay=550");
const initialProbes = (await fixture("/test/state")).probes;
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--port", "3128"], {
  env: { ...process.env, VNGZZ2_PRIMARY_API_KEY: "simulation-only-key", VNGZZ2_PAYMENT_BASE_URL: simulation },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", chunk => { log += chunk; });
server.stderr.on("data", chunk => { log += chunk; });
try {
  for (let attempt = 0; !log.includes("Ready") && attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, "Production server remains running");
    await delay(100);
  }
  assert.ok(log.includes("Ready"), "Production Next.js server starts");
  const request = async () => {
    const start = performance.now();
    const response = await fetch(base + "/api/payment/vngzz2/health", { signal: AbortSignal.timeout(8000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    return { ms: Math.round(performance.now() - start), body };
  };
  const concurrent = await Promise.all(Array.from({ length: 6 }, request));
  assert.ok(concurrent.every(result => result.body.available && result.body.service === "payment-health-fixture"));
  assert.equal((await fixture("/test/state")).probes - initialProbes, 1, "Concurrent route requests share one provider probe");
  const warm = [];
  for (let run = 0; run < 3; run++) warm.push(await request());
  assert.equal((await fixture("/test/state")).probes - initialProbes, 1, "Warm route requests never call the provider again");
  assert.ok(warm.every(result => result.ms < 300), "Warm route calls avoid the fixture's 550ms latency");
  await delay(15_050);
  await fixture("/test/config?mode=unavailable&delay=0");
  assert.equal((await request()).body.available, false, "An expired success never hides a provider failure");
  assert.equal((await fixture("/test/state")).probes - initialProbes, 2);
  await fixture("/test/config?mode=healthy&delay=0");
  assert.equal((await request()).body.available, false, "Unavailability is cached only briefly");
  await delay(3_050);
  assert.equal((await request()).body.available, true, "Failed probes recover after three seconds");
  assert.equal((await fixture("/test/state")).probes - initialProbes, 3);
  const report = {
    upstreamDelayMs: 550, concurrentRequests: 6, initialUpstreamProbes: 1,
    coldMs: concurrent.map(result => result.ms), warmMs: warm.map(result => result.ms),
    successExpires: true, failureExpires: true, totalUpstreamProbes: 3,
  };
  await mkdir(".local-backups/navigation", { recursive: true });
  await writeFile(".local-backups/navigation/payment-health.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.kill();
}
