// Explicit nickname checks only. Never log IDs, nicknames, credentials or raw responses.
import { mkdir, writeFile } from 'node:fs/promises';
const [base, label, code, userId, serverId] = process.argv.slice(2);
if (!base || !label || !code || !userId || !/^[a-z0-9-]+$/i.test(label)) {
  throw new Error('Usage: node verification-audit.mjs BASE LABEL GAME PLAYER_ID [SERVER_ID]');
}
const samples = [];
for (let run = 0; run < 3; run++) {
  const start = performance.now();
  const response = await fetch(new URL('/api/player/verify', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, userId, serverId }),
    signal: AbortSignal.timeout(40000),
  });
  const headersMs = performance.now() - start;
  const result = await response.json();
  const sample = {
    run, status: response.status, headersMs: +headersMs.toFixed(1), totalMs: +(performance.now() - start).toFixed(1),
    serverTiming: response.headers.get('server-timing'),
    result: result.success ? 'verified' : result.isInvalidId ? 'invalid' : result.isUnavailable ? 'unavailable' : result.isSupported === false ? 'unsupported' : result.isAuthError ? 'supplier-auth-error' : 'other',
  };
  samples.push(sample);
  console.log(JSON.stringify(sample));
}
await mkdir('artifacts/performance', { recursive: true });
await writeFile(`artifacts/performance/${label}-verification.json`, JSON.stringify({ base, code, at: new Date().toISOString(), samples }, null, 2));
