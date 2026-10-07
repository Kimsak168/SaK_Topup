// Read-only storefront audit using the locally installed Chrome DevTools protocol.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:3000';
const baseline = process.argv.includes('--baseline');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Local server required');
const output = 'artifacts/mobile-responsive';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-mobile-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=9358', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const results = [], errors = [], gameRequests = [];
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9358/json/list')).json()).find(item => item.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
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
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method === 'Network.requestWillBeSent' && new URL(data.params.request.url).pathname === '/api/games') gameRequests.push(data.params.request.url);
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const path of ['/', '/games']) {
    await send('Page.navigate', { url: base + path });
    await waitFor(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && document.querySelectorAll('#game-results .game-card').length > 0 && (document.querySelector('.public-navbar')?.getBoundingClientRect().height || 0) > 0`);
    await evaluate('document.fonts.ready.then(() => true)');
    const requestsBeforeResize = gameRequests.length;
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
      await delay(450);
      const row = await evaluate(`(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const nav = document.querySelector('.public-navbar');
        const input = document.querySelector('[name=gameQuery]');
        const form = input.closest('form');
        const cards = [...document.querySelectorAll('#game-results .game-card')];
        const banner = document.querySelector('[aria-roledescription=carousel]');
        const dimensions = {
          navbar: rect(nav), input: rect(input), search: rect(form.querySelector('[type=submit]')),
          grid: rect(cards[0].parentElement), card: rect(cards[0]), heading: rect(document.querySelector('#games h2')),
          ...(banner ? { banner: rect(banner.firstElementChild) } : {}),
        };
        const navLinks = [...nav.querySelectorAll('[aria-label="Main Navigation"] a')];
        return { path: location.pathname, width: innerWidth, dimensions,
          columns: getComputedStyle(cards[0].parentElement).gridTemplateColumns.split(' ').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          contentOverflow: [...document.querySelectorAll('#games input, #games button, #games h3, .public-navbar a')].some(el => el.scrollWidth > el.clientWidth + 1),
          navFits: navLinks.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
          navOverlap: nav.getBoundingClientRect().bottom > (banner || document.querySelector('main h1')).getBoundingClientRect().top,
          uniformCards: new Set(cards.map(el => Math.round(el.getBoundingClientRect().height))).size === 1,
          imagesCover: cards.every(el => getComputedStyle(el.querySelector('img')).objectFit === 'cover'),
          inputFont: getComputedStyle(input).fontSize,
        };
      })()`);
      results.push(row);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${output}/${baseline ? 'before' : 'after'}-${path === '/' ? 'home' : 'games'}-${width}.png`, Buffer.from(shot.data, 'base64'));
      console.log(`${path} ${width}px: ${row.columns} columns, navbar ${row.dimensions.navbar.height}px, overflow ${row.overflow}`);
    }
    assert.equal(gameRequests.length, requestsBeforeResize, 'Resizing must not refetch games');
  }
  if (!baseline) {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 1000, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('.public-navbar button[aria-expanded]').click()`);
    await delay(250);
    const supportFits = await evaluate(`(() => { const r = document.querySelector('[aria-label="Support social links"]').getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })()`);
    assert.ok(supportFits, 'Support menu must fit at 320px');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`document.querySelector('.public-navbar button[aria-expanded]').getAttribute('aria-expanded')`), 'false');
    await evaluate(`(() => { const input = document.querySelector('[name=gameQuery]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'not-a-real-game-xyz'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(`document.querySelectorAll('#game-results .game-card').length === 0`);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    await evaluate(`document.querySelector('[aria-label="Clear search input"]').click()`);
    await waitFor(`document.querySelectorAll('#game-results .game-card').length > 0`);
  }
  await writeFile(`${output}/${baseline ? 'baseline' : 'report'}.json`, JSON.stringify({ results, errors, gameRequests }, null, 2));
  if (!baseline) {
    for (const row of results) {
      assert.equal(row.columns, row.width < 360 ? 2 : row.width < 768 ? 3 : row.width < 1024 ? 4 : 5);
      assert.ok(!row.overflow && !row.contentOverflow && row.navFits && !row.navOverlap && row.uniformCards && row.imagesCover, `Layout failed at ${row.path} ${row.width}px`);
      if (row.width < 640) {
        assert.ok(row.dimensions.navbar.height <= 110);
        assert.equal(row.dimensions.input.height, 44);
        assert.equal(row.dimensions.search.height, 44);
        if (row.dimensions.banner) assert.ok(row.dimensions.banner.height >= 130 && row.dimensions.banner.height <= 162);
      }
    }
    const previous = JSON.parse(await readFile(`${output}/baseline.json`, 'utf8'));
    for (const row of results.filter(row => row.width >= 768)) {
      assert.deepEqual(row.dimensions, previous.results.find(before => before.path === row.path && before.width === row.width).dimensions, `Tablet/desktop dimensions changed at ${row.path} ${row.width}px`);
    }
    assert.equal(errors.length, 0, 'Browser exceptions');
  }
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); chrome.kill();
}
