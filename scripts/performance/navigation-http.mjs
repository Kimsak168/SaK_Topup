// Public reads only: compare server rendering and route cache hits without
// creating orders, starting checkout, or changing catalogue data.
import { mkdir, writeFile } from "node:fs/promises";

const base = process.argv[2] || "http://127.0.0.1:3118";
const label = process.argv[3] || "navigation";
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Invalid report label");
const samples = [];
for (const path of ["/", "/games/webbuilder/freefire_khsgmy", "/services/tiktok"]) {
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    const headersMs = Math.round(performance.now() - start);
    const body = await response.text();
    const sample = {
      path, run, status: response.status, headersMs,
      totalMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(body),
      cache: response.headers.get("x-nextjs-cache"),
      edgeCache: response.headers.get("x-vercel-cache"),
      cacheControl: response.headers.get("cache-control"),
    };
    samples.push(sample);
    console.log(JSON.stringify(sample));
    if (!response.ok) process.exitCode = 1;
  }
}
await mkdir(".local-backups/navigation", { recursive: true });
await writeFile(`.local-backups/navigation/${label}-http.json`, JSON.stringify({ base, samples }, null, 2));
