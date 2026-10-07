// Public GETs only. Measures first bytes, streamed shell, complete response and service headers.
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'https://saksuuu-topup.vercel.app';
const label = process.argv[3] || 'production-audit';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid output label');
const samples = [];
for (const path of ['/', '/api/games', '/api/banners', '/games/g2bulk/mlbb', '/api/games/g2bulk/mlbb/packages', '/games/vizo/freefire_sgmy', '/api/games/vizo/freefire_sgmy/packages']) {
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    const res = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    const headersMs = performance.now() - start;
    let firstByteMs, shellMs, bytes = 0, body = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      firstByteMs ??= performance.now() - start;
      bytes += chunk.length;
      body += decoder.decode(chunk, { stream: true });
      if (shellMs === undefined && body.includes('<nav') && body.includes('<main')) shellMs = performance.now() - start;
    }
    body += decoder.decode();
    const totalMs = performance.now() - start;
    let items;
    if (path.startsWith('/api/')) { const data = JSON.parse(body); items = data.games?.length ?? data.packages?.length ?? data.banners?.length; }
    const sample = { path, run, status: res.status, headersMs: +headersMs.toFixed(1), firstByteMs: +firstByteMs?.toFixed(1), shellMs: shellMs === undefined ? undefined : +shellMs.toFixed(1), totalMs: +totalMs.toFixed(1), bytes, items, serverTiming: res.headers.get('server-timing'), cache: res.headers.get('x-vercel-cache'), region: res.headers.get('x-vercel-id')?.split('::').slice(0, 2).join('::') };
    sample.nextCache = res.headers.get('x-nextjs-cache');
    samples.push(sample);
    console.log(JSON.stringify(sample));
  }
}
await mkdir('artifacts/performance', { recursive: true });
await writeFile(`artifacts/performance/${label}-requests.json`, JSON.stringify({ base, at: new Date().toISOString(), samples }, null, 2));
