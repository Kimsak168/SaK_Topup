// Chrome DevTools Protocol benchmark; clicks package buttons only, never checkout.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.argv[2] || 'https://saksuuu-topup.vercel.app';
const label = process.argv[3] || 'production-before';
const viewportWidth = Number(process.argv[4]) || 390;
const port = 9337;
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-perf-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 50; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    await delay(100);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const requests = [];
  const errors = [];
  let intercept;
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(m.error); else p.resolve(m.result); }
    if (m.method === 'Network.requestWillBeSent') requests.push({ url: m.params.request.url, method: m.params.request.method, type: m.params.type });
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Fetch.requestPaused' && intercept) void intercept(m.params);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: viewportWidth, height: viewportWidth > 600 ? 1000 : 844, deviceScaleFactor: 1, mobile: viewportWidth <= 600 });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__perf = { lcp: 0, longTasks: [], commits: [] };
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.lcp = e.startTime)).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.longTasks.push({start:e.startTime, duration:e.duration}))).observe({ type: 'longtask', buffered: true });
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject(r) { this.renderers.set(1,r); return 1; }, onCommitFiberRoot(id, root) {
      const rendered = [];
      const packageCards = [];
      const visit = f => { if (!f) return; if ((f.flags & 1) && typeof f.type === 'function') { rendered.push(f.type.displayName || f.type.name || 'anonymous'); if (f.memoizedProps?.pkg && f.memoizedProps !== f.alternate?.memoizedProps) packageCards.push(f.memoizedProps.pkg.id); } visit(f.child); visit(f.sibling); };
      visit(root.current);
      window.__perf.commits.push({ at: performance.now(), rendered, packageCards,
        reactRenderMs: typeof root.current.actualDuration === 'number' ? root.current.actualDuration : null,
        reactBaseMs: typeof root.current.treeBaseDuration === 'number' ? root.current.treeBaseDuration : null });
    }, onCommitFiberUnmount() {} };
  ` });
  const waitFor = async expression => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(150); }
    console.error(await evaluate(`({url:location.href,title:document.title,text:document.body?.innerText.slice(0,1200)})`));
    throw new Error('Timed out: ' + expression);
  };
  const metrics = () => evaluate(`({ ...window.__perf, paints: performance.getEntriesByType('paint').map(e => ({ name:e.name, at:e.startTime })), navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), images: [...document.images].map(i=>({src:i.currentSrc, width:i.naturalWidth, complete:i.complete})), resources: performance.getEntriesByType('resource').map(e=>({url:e.name,type:e.initiatorType,ms:e.duration,transfer:e.transferSize,bytes:e.encodedBodySize})) })`);
  const result = { base, at: new Date().toISOString(), viewportWidth, cpuSlowdown: 4, browserCache: 'disabled' };
  await mkdir('artifacts/performance', { recursive: true });
  await send('Page.navigate', { url: base });
  await waitFor(`document.querySelectorAll('#games a[href^="/games/"]').length > 0`);
  result.homeGamesReadyMs = await evaluate('performance.now()');
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`performance.getEntriesByType('paint').length > 0`);
  await delay(1200);
  result.home = await metrics();
  result.activeGames = await evaluate(`document.querySelectorAll('#games a[href^="/games/"]').length`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`artifacts/performance/${label}-home.png`, Buffer.from(shot.data, 'base64'));
  const navStart = performance.now();
  await evaluate(`document.querySelector('a[href="/games/g2bulk/mlbb"]').click()`);
  await waitFor(`document.querySelectorAll('button[aria-pressed]').length > 0`);
  result.detailNavigationMs = Math.round(performance.now() - navStart);
  await delay(1200);
  result.detail = await metrics();
  result.initialSelectionCount = await evaluate(`document.querySelectorAll('button[aria-pressed="true"]').length`);
  const requestCount = requests.length;
  await send('Profiler.enable');
  await send('Profiler.start');
  result.selection = await evaluate(`(async () => {
    const buttons = [...document.querySelectorAll('button[aria-pressed]')];
    const results = [];
    for (let i=0;i<12;i++) {
      const button = buttons[i % buttons.length];
      button.scrollIntoView({block:'center', behavior:'instant'});
      await new Promise(r => setTimeout(r,100));
      const before = window.__perf.commits.length;
      const start = performance.now();
      const updated = new Promise(resolve => {
        const observer = new MutationObserver(() => { if (button.getAttribute('aria-pressed') === 'true') { observer.disconnect(); resolve(performance.now() - start); } });
        observer.observe(button, { attributes:true, attributeFilter:['aria-pressed'] });
      });
      button.click();
      const domMs = await updated;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const summary = [...document.querySelectorAll('h3')].find(h => h.textContent === 'Order Summary').parentElement.parentElement;
      const expectedPrice = button.textContent.match(/\\$[\\d.]+/)[0];
      const summaryPrice = summary.querySelector('span.text-2xl').textContent.trim();
      if (summaryPrice !== expectedPrice) throw new Error('Order summary did not update with selection');
      results.push({ domMs, nextPaintMs:performance.now()-start, selectedCount:document.querySelectorAll('button[aria-pressed="true"]').length, summaryMatches:summaryPrice===expectedPrice, commits:window.__perf.commits.slice(before) });
    }
    return results;
  })()`);
  const cpu = await send('Profiler.stop');
  await writeFile(`artifacts/performance/${label}-selection.cpuprofile`, JSON.stringify(cpu.profile));
  result.selectionRequests = requests.slice(requestCount);
  const toggleRequestCount = requests.length;
  result.toggle = await evaluate(`(async () => {
    const selected = document.querySelector('button[aria-pressed="true"]');
    if (!selected) throw new Error('No selected package for toggle check');
    const summary = [...document.querySelectorAll('h3')].find(h => h.textContent === 'Order Summary').parentElement.parentElement;
    const start = performance.now();
    selected.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const packageCleared = document.querySelectorAll('button[aria-pressed="true"]').length === 0 && summary.textContent.includes('Select a package');
    const payment = [...document.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.includes('ABA Pay / KHQR'));
    payment.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const paymentSelected = payment.getAttribute('aria-pressed') === 'true' && summary.textContent.includes('ABA Pay / KHQR');
    payment.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const paymentCleared = payment.getAttribute('aria-pressed') === 'false' && summary.textContent.includes('Select a payment method');
    const payDisabled = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Pay with ABA / KHQR'))?.disabled === true;
    return { packageCleared, paymentSelected, paymentCleared, payDisabled, totalMs: performance.now() - start };
  })()`);
  result.toggleRequests = requests.slice(toggleRequestCount);
  result.errors = errors;
  if (errors.length) throw new Error('Browser errors: ' + errors.join('\n'));
  if (result.initialSelectionCount !== 0 || result.selection.some(s => s.selectedCount !== 1)) throw new Error('Package selection invariant failed');
  if (result.selectionRequests.some(r => r.url.includes('/api/') || r.url.includes('anajakpay'))) throw new Error('Package click made a backend request');
  if (Object.entries(result.toggle).some(([key, value]) => key !== 'totalMs' && value !== true) || result.toggleRequests.length)
    throw new Error('Package/payment toggles or zero-network behavior failed');
  await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
  await delay(150);
  const detailShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`artifacts/performance/${label}-game.png`, Buffer.from(detailShot.data, 'base64'));
  if (process.argv.includes('--smoke')) {
    const mocked = [];
    const plugin = `window.KhqrPayway={openCheckout(o){window.__mockCheckout=o;},closeCheckout(){}};`;
    intercept = async ({ requestId, request }) => {
      let body, contentType = 'application/json';
      if (request.url.includes('/api/player/verify')) body = JSON.stringify({ success: true, playerName: 'Performance Test' });
      else if (request.url.includes('/api/payment/anajakpay/create')) body = JSON.stringify({ success: true, orderNumber: 'PERF-MOCK', transactionId: 'PERF-TXN', amount: 2, checkoutUrl: 'https://example.test/mock-checkout' });
      else if (request.url.includes('/api/payment/anajakpay/check')) body = JSON.stringify({ success: true, paymentStatus: 'PAID', fulfillmentStatus: 'PROCESSING' });
      else if (request.url.includes('anajakpay.com/khqrcc-plugin.js')) { body = plugin; contentType = 'application/javascript'; }
      if (body !== undefined) {
        mocked.push({ url: request.url, method: request.method });
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: contentType }], body: Buffer.from(body).toString('base64') });
      } else if (request.method !== 'GET') await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      else await send('Fetch.continueRequest', { requestId });
    };
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    // Toggle checks above intentionally leave both selections empty.
    await evaluate(`[...document.querySelectorAll('button[aria-pressed]')].find(b=>!b.textContent.includes('ABA Pay / KHQR')).click()`);
    await evaluate(`[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.textContent.includes('ABA Pay / KHQR')).click()`);
    await evaluate(`for(const [id,value] of [['player-id','123456'],['server-id','1234']]){const el=document.getElementById(id);if(el){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}}`);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Check & Verify Nickname')).click()`);
    await waitFor(`document.body.textContent.includes('Verified: Performance Test')`);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pay with ABA / KHQR')).click()`);
    await waitFor(`Boolean(window.__mockCheckout)`);
    await evaluate(`window.__mockCheckout.onSuccess({})`);
    await waitFor(`document.body.textContent.includes('Top-Up Dispatched!')`);
    result.smoke = { verification: true, lazyPluginLoaded: mocked.some(r=>r.url.includes('khqrcc-plugin.js')), checkoutOpened: true, paymentConfirmation: true, interceptedRequests: mocked };
    // A real empty catalogue must remain empty, without a second package fetch.
    const requestStart = requests.length;
    await send('Page.navigate', { url: base + '/games/g2bulk/valorant' });
    await waitFor(`document.body?.textContent.includes('No customer-ready packages')`);
    await delay(500);
    result.smoke.emptyGamePackageFetches = requests.slice(requestStart).filter(r=>r.url.includes('/api/games/') && r.url.includes('/packages')).length;
    if (result.smoke.emptyGamePackageFetches !== 0) throw new Error('Empty catalogue retried automatically');
  }
  result.requests = requests;
  await writeFile(`artifacts/performance/${label}-browser.json`, JSON.stringify(result, null, 2));
  const median = values => {
    const sorted = [...values].sort((a,b)=>a-b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  console.log(JSON.stringify({ homeGamesReadyMs: result.homeGamesReadyMs, homeFcpMs: result.home.paints, homeLcpMs: result.home.lcp, activeGames:result.activeGames, detailNavigationMs:result.detailNavigationMs, initialSelectionCount:result.initialSelectionCount, selectionMedianDomMs:median(result.selection.map(s=>s.domMs)), selectionMedianPaintMs:median(result.selection.map(s=>s.nextPaintMs)), selectionApiRequests:result.selectionRequests.filter(r=>r.url.includes('/api/')) }, null, 2));
  await send('Browser.close').catch(()=>{});
} finally { ws?.close(); chrome.kill(); }
