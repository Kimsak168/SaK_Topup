// Real browser -> verification API timing. Explicit supplied account only; no purchase actions.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [base, label, code, userId, serverId] = process.argv.slice(2);
if (!base || !code || !userId || !/^[a-z0-9-]+$/i.test(label)) throw new Error('BASE LABEL GAME PLAYER_ID [SERVER_ID] required');
const port = 9347;
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-verification-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('Chrome failed to start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const call = pending.get(message.id); pending.delete(message.id);
    if (!call) return;
    clearTimeout(call.timer);
    if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 45000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: base });
  let ready = false;
  for (let i = 0; i < 200; i++) {
    ready = await evaluate(`location.origin === ${JSON.stringify(new URL(base).origin)} && document.readyState === 'complete'`);
    if (ready) break; await sleep(150);
  }
  if (!ready) throw new Error('Page did not finish loading');
  const samples = [];
  for (let run = 0; run < 3; run++) {
    const sample = await evaluate(`(async () => {
      performance.clearResourceTimings();
      const start = performance.now();
      const res = await fetch('/api/player/verify', {method:'POST', headers:{'Content-Type':'application/json'}, body:${JSON.stringify(JSON.stringify({code, userId, serverId}))}, signal:AbortSignal.timeout(40000)});
      const data = await res.json();
      const elapsed = performance.now() - start;
      const resource = performance.getEntriesByName(location.origin + '/api/player/verify').at(-1);
      return { status:res.status, totalMs:+elapsed.toFixed(1), serverTiming:res.headers.get('server-timing'), requestToResponseMs:resource ? +(resource.responseStart-resource.requestStart).toFixed(1) : null, responseTransferMs:resource ? +(resource.responseEnd-resource.responseStart).toFixed(1) : null, result:data.success ? 'verified' : data.isInvalidId ? 'invalid' : data.isUnavailable ? 'unavailable' : 'other' };
    })()`);
    samples.push({ run, ...sample }); console.log(JSON.stringify({ run, ...sample }));
  }
  await mkdir('artifacts/performance', { recursive: true });
  await writeFile(`artifacts/performance/${label}-browser-verification.json`, JSON.stringify({ base, code, at:new Date().toISOString(), samples }, null, 2));
  await send('Browser.close').catch(() => {});
} finally { ws?.close(); chrome.kill(); }
