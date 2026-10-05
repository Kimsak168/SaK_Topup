// Read-only public endpoint benchmark. Run with a base URL and output label.
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'https://saksuuu-topup.vercel.app';
const label = process.argv[3] || 'production-before';
const samples = [];
for (const path of ['/', '/api/games', '/api/games/vizo/freefire_global/packages', '/api/games/g2bulk/mlbb/packages', '/games/vizo/freefire_global']) {
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    const ttfb = performance.now() - start;
    const body = await response.text();
    const sample = { path, run, status: response.status, ttfbMs: Math.round(ttfb), totalMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(body), cache: response.headers.get('x-vercel-cache'), serverTiming: response.headers.get('server-timing') };
    if (path.startsWith('/api/')) {
      try { const json = JSON.parse(body); sample.items = json.games?.length ?? json.packages?.length; } catch {}
    }
    samples.push(sample);
    console.log(JSON.stringify(sample));
  }
}
await mkdir('artifacts/performance', { recursive: true });
await writeFile(`artifacts/performance/${label}-http.json`, JSON.stringify({ base, at: new Date().toISOString(), samples }, null, 2));
