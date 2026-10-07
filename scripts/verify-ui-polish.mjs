// Local browser audit. Only reads app data; all mutation requests are blocked.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:3107';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local server required');
const secret = process.env.AUTH_SECRET || process.env.ADMIN_SECRET;
if (!secret) throw new Error('Configure AUTH_SECRET for the local admin audit');
const output = 'artifacts/ui-polish';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-ui-'));
const port = 9357;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const results = [], errors = [], interactions = {};
try {
  let target;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0, trackRequests = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const task = pending.get(data.id); pending.delete(data.id);
      if (data.error) task?.reject(data.error); else task?.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === 'Fetch.requestPaused') {
      const { requestId, request } = data.params;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      } else if (request.url.includes('/api/orders/track')) {
        const failed = ++trackRequests === 1;
        void send('Fetch.fulfillRequest', { requestId, responseCode: failed ? 503 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(failed ? { success: false, error: 'Temporary test outage' } : { success: true, orders: [] })).toString('base64') });
      } else void send('Fetch.continueRequest', { requestId });
    }
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  };
  const navigate = async path => {
    await send('Page.navigate', { url: base + path });
    await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('main')`);
    await delay(650);
  };
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'));
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const now = Math.floor(Date.now() / 1000);
  const message = [{ alg: 'HS256', typ: 'JWT' }, { username: 'ui-audit', role: 'Admin', name: 'UI audit', iat: now, exp: now + 3600 }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const token = `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`;
  const catalogue = await (await fetch(`${base}/api/games`)).json();
  const gamePath = catalogue.games?.find(game => game.path?.startsWith('/games/'))?.path;
  assert.ok(gamePath, 'An active game is required to check the top-up screen');
  const paths = ['/', '/games', gamePath, '/orders', '/payment/success', '/payment/cancel', '/admin', '/admin/games', '/admin/packages', '/admin/orders', '/admin/payments', '/admin/banners', '/admin/suppliers', '/admin/settings'];
  for (const width of [320, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 768 });
    await send('Network.setCookie', { name: 'saksuuu_admin_token', value: token, url: base, httpOnly: true, sameSite: 'Lax' });
    for (const path of paths) {
      await navigate(path);
      const result = await evaluate(`(() => {
        const nav = document.querySelector('.public-navbar');
        const heading = document.querySelector('main h1, main h2');
        return { path: location.pathname, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          title: heading?.textContent.trim(), overflow: document.documentElement.scrollWidth > innerWidth,
          navOverlap: !!nav && !!heading && nav.getBoundingClientRect().bottom > heading.getBoundingClientRect().top,
          smallInput: innerWidth < 640 && [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio])')].some(input => parseFloat(getComputedStyle(input).fontSize) < 16) };
      })()`);
      results.push(result);
      if (['/', gamePath, '/admin', '/admin/packages'].includes(path)) await screenshot(`${width}-${path.replaceAll('/', '-') || 'home'}`);
    }
    console.log(`${width}px: ${paths.length} pages checked`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate('/admin');
  await evaluate(`(() => { const trigger = document.querySelector('[aria-label="Open admin navigation"]'); trigger.focus(); trigger.click(); })()`);
  await waitFor(`!!document.querySelector('[role=dialog][aria-label="Admin navigation"]')`);
  interactions.drawerFocus = await evaluate(`!!document.activeElement.closest('[role=dialog]')`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(150);
  interactions.drawerEscape = await evaluate(`!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label') === 'Open admin navigation'`);
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]').click()`);
  await delay(200);
  interactions.lightTheme = await evaluate(`getComputedStyle(document.querySelector('.admin-shell')).colorScheme === 'light'`);
  await screenshot('390-admin-light');
  await navigate('/');
  await evaluate(`(() => { const input = document.querySelector('[name=gameQuery]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'not-a-real-game-xyz'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`document.querySelectorAll('#game-results .game-card').length === 0`);
  await evaluate(`document.querySelector('[aria-label="Clear search input"]').click()`);
  await waitFor(`document.querySelectorAll('#game-results .game-card').length > 0`);
  interactions.gameSearch = true;
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(150);
  interactions.reducedMotion = await evaluate(`getComputedStyle(document.querySelector('.game-card')).transitionDuration.split(',').every(value => parseFloat(value) < .01) && !document.querySelector('[aria-label="Pause slideshow"]')`);
  await navigate('/orders');
  await evaluate(`(() => { const input = document.querySelector('main input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'ORD-UI-TEST'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await delay(100);
  await evaluate(`document.querySelector('main form').requestSubmit()`);
  await waitFor(`!!document.querySelector('main [role=alert]')`);
  await screenshot('390-order-error');
  await evaluate(`[...document.querySelectorAll('main button')].find(button => button.textContent === 'Try again').click()`);
  await waitFor(`!document.querySelector('main [role=alert]') && document.querySelector('main').textContent.includes('No orders found')`);
  interactions.orderRetry = true;
  await navigate(gamePath);
  await waitFor(`!!document.querySelector('.package-option:not(:disabled)')`);
  await evaluate(`document.querySelector('.package-option:not(:disabled)').click()`);
  await waitFor(`!!document.querySelector('.package-option[aria-pressed=true]')`);
  interactions.packageSelection = true;
  await send('Network.deleteCookies', { name: 'saksuuu_admin_token', url: base });
  await send('Page.navigate', { url: `${base}/admin/login` });
  await waitFor(`location.pathname === '/admin/login' && !!document.querySelector('#admin-username')`);
  interactions.loginLayout = await evaluate(`document.documentElement.scrollWidth <= innerWidth`);
  await screenshot('390-login');
  await writeFile(`${output}/report.json`, JSON.stringify({ results, interactions, errors }, null, 2));
  assert.ok(results.every(row => row.title && !row.overflow && !row.navOverlap && !row.smallInput), 'Layout check failed; see report.json');
  assert.ok(Object.values(interactions).every(Boolean), 'Interaction check failed');
  assert.equal(errors.length, 0, 'Browser exceptions detected');
  console.log(JSON.stringify({ pagesChecked: results.length, interactions, browserErrors: errors.length }));
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); chrome.kill();
}
