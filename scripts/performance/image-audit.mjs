// Compare a legacy banner source with its responsive image-optimizer response.
import { readFile, writeFile } from 'node:fs/promises';
const [base, label] = process.argv.slice(2);
if (!base || !/^[a-z0-9-]+$/i.test(label)) throw new Error('BASE LABEL required');
const reference = JSON.parse(await readFile('artifacts/performance/production-20261005-before-browser.json', 'utf8'));
const optimized = reference.home.resources.map(r => new URL(r.url)).find(url => url.searchParams.get('url')?.startsWith('/api/banners/'));
const samples = [];
for (const path of [optimized.searchParams.get('url'), optimized.pathname + optimized.search]) {
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000), headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
    const headersMs = performance.now() - start;
    const body = Buffer.from(await response.arrayBuffer());
    const sample = { source: path.startsWith('/api/') ? 'original' : 'optimized', run, status: response.status, headersMs: +headersMs.toFixed(1), totalMs: +(performance.now() - start).toFixed(1), bytes: body.length, type: response.headers.get('content-type'), cache: response.headers.get('x-vercel-cache'), error: response.ok ? undefined : body.toString('utf8').slice(0,150) };
    samples.push(sample); console.log(JSON.stringify(sample));
  }
}
await writeFile(`artifacts/performance/${label}-images.json`, JSON.stringify({ base, at: new Date().toISOString(), samples }, null, 2));
