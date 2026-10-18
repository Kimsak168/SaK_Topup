// Read-only storefront audit using the locally installed Chrome DevTools protocol.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:3000';
const baseline = process.argv.includes('--baseline');
const cardsMode = process.argv.includes('--cards');
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Local server required');
const output = cardsMode ? 'artifacts/game-card-polish' : 'artifacts/mobile-responsive';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-mobile-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=9358', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const results = [], errors = [], warnings = [], gameRequests = [];
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
    for (const width of cardsMode ? [320, 340, 360, 375, 390, 430, 768, 1024, 1440] : [320, 360, 375, 390, 430, 768, 1440]) {
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
        // A clamped title intentionally hides text; check its visible bounds separately.
        const overflowElements = [...document.querySelectorAll('#games input, #games button, #games h3, .public-navbar a')]
          .filter(el => el.scrollWidth > el.clientWidth + 1)
          .filter(el => !(el.matches('.game-card h3.line-clamp-2') && getComputedStyle(el).overflow === 'hidden'))
          .map(el => ({ tag: el.tagName, text: el.textContent, width: el.clientWidth, scrollWidth: el.scrollWidth }));
        return { path: location.pathname, width: innerWidth, dimensions,
          columns: getComputedStyle(cards[0].parentElement).gridTemplateColumns.split(' ').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          contentOverflow: overflowElements.length > 0,
          overflowElements,
          navFits: navLinks.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
          navOverlap: nav.getBoundingClientRect().bottom > (banner || document.querySelector('main h1')).getBoundingClientRect().top,
          uniformCards: Math.max(...cards.map(el => el.getBoundingClientRect().height)) - Math.min(...cards.map(el => el.getBoundingClientRect().height)) <= 1,
          imagesCover: cards.every(el => getComputedStyle(el.querySelector('img')).objectFit === 'cover'),
          inputFont: getComputedStyle(input).fontSize,
          cardStyles: cards.map(card => {
            const image = card.querySelector('img');
            const title = card.querySelector('h3');
            const titleArea = card.querySelector('.game-card-title');
            const button = card.querySelector('.game-card-cta');
            const style = getComputedStyle(card);
            const buttonStyle = button && getComputedStyle(button);
            return { radius: style.borderTopLeftRadius, background: style.backgroundColor, border: style.borderTopColor,
              shadow: style.boxShadow, animation: style.animationName, imageHeight: image.getBoundingClientRect().height,
              objectFit: getComputedStyle(image).objectFit, imageTransform: getComputedStyle(image).transform,
              titleSize: parseFloat(getComputedStyle(title).fontSize), titleWeight: getComputedStyle(title).fontWeight,
              titleColor: getComputedStyle(title).color, lineClamp: getComputedStyle(title).webkitLineClamp,
              titleOverflow: getComputedStyle(title).overflow,
              titleFits: !!titleArea && title.getBoundingClientRect().left >= titleArea.getBoundingClientRect().left - 0.1 && title.getBoundingClientRect().right <= titleArea.getBoundingClientRect().right + 0.1,
              titleHeight: titleArea?.getBoundingClientRect().height, buttonHeight: button?.getBoundingClientRect().height,
              buttonText: button?.textContent.trim(), buttonColor: buttonStyle?.backgroundColor,
              buttonTextColor: buttonStyle?.color, buttonRadius: buttonStyle?.borderRadius,
              imageTitleGap: titleArea && titleArea.getBoundingClientRect().top - image.parentElement.getBoundingClientRect().bottom,
              titleButtonGap: titleArea && button && button.getBoundingClientRect().top - titleArea.getBoundingClientRect().bottom,
              bottomPadding: button && card.getBoundingClientRect().bottom - button.getBoundingClientRect().bottom - parseFloat(style.borderBottomWidth),
              extraContent: !!card.querySelector('svg, p, .game-card-border'),
            };
          }),
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
    await delay(450);
    await evaluate(`document.querySelector('.public-navbar button[aria-expanded]').click()`);
    await waitFor(`document.querySelector('.public-navbar button[aria-expanded]').getAttribute('aria-expanded') === 'true'`);
    const supportBounds = await evaluate(`(() => { const r = document.querySelector('[aria-label="Support social links"]').getBoundingClientRect(); return { width: r.width, left: r.left, right: r.right, viewport: innerWidth }; })()`);
    const supportFits = supportBounds.width > 0 && supportBounds.left >= 0 && supportBounds.right <= supportBounds.viewport;
    if (cardsMode && !supportFits) {
      warnings.push({ message: 'Existing support menu extends beyond the viewport at 320px', bounds: supportBounds });
    } else {
      assert.ok(supportFits, `Support menu must fit at 320px: ${JSON.stringify(supportBounds)}`);
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`document.querySelector('.public-navbar button[aria-expanded]').getAttribute('aria-expanded')`), 'false');
    await evaluate(`(() => { const input = document.querySelector('[name=gameQuery]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'not-a-real-game-xyz'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(`document.querySelectorAll('#game-results .game-card').length === 0`);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    await evaluate(`document.querySelector('[aria-label="Clear search input"]').click()`);
    await waitFor(`document.querySelectorAll('#game-results .game-card').length > 0`);
  }
  await writeFile(`${output}/${baseline ? 'baseline' : 'report'}.json`, JSON.stringify({ results, errors, warnings, gameRequests }, null, 2));
  if (!baseline) {
    for (const row of results) {
      assert.equal(row.columns, row.width < 340 ? 2 : row.width < 768 ? 3 : row.width < 1024 ? 4 : 5);
      assert.ok(!row.overflow && !row.contentOverflow && row.navFits && !row.navOverlap && row.uniformCards && row.imagesCover, `Layout failed at ${row.path} ${row.width}px: ${JSON.stringify(row.overflowElements)}`);
      if (!cardsMode && row.width < 640) {
        assert.ok(row.dimensions.navbar.height <= 110);
        assert.equal(row.dimensions.input.height, 44);
        assert.equal(row.dimensions.search.height, 44);
        if (row.dimensions.banner) assert.ok(row.dimensions.banner.height >= 130 && row.dimensions.banner.height <= 162);
      }
      if (cardsMode) {
        for (const card of row.cardStyles) {
          assert.equal(card.radius, '13px');
          assert.equal(card.background, 'rgb(255, 255, 255)');
          assert.equal(card.border, 'rgb(187, 247, 208)');
          assert.ok(card.shadow.includes('rgba(22, 163, 74, 0.08) 0px 6px 18px 0px'));
          assert.equal(card.animation, 'none');
          assert.equal(card.objectFit, 'cover');
          assert.equal(card.imageTransform, 'none');
          assert.equal(card.titleSize, row.width < 640 ? 13 : 14);
          assert.equal(card.titleWeight, '600');
          assert.equal(card.titleColor, 'rgb(23, 32, 51)');
          assert.equal(card.lineClamp, '2');
          assert.equal(card.titleOverflow, 'hidden');
          assert.equal(card.titleFits, true);
          assert.equal(card.titleHeight, row.width < 640 ? 36 : 40);
          assert.equal(card.buttonHeight, row.width < 640 ? 36 : 40);
          assert.equal(card.buttonText, 'Top Up');
          assert.equal(card.buttonColor, 'rgb(34, 197, 94)');
          assert.equal(card.buttonTextColor, 'rgb(255, 255, 255)');
          assert.equal(card.buttonRadius, '8px');
          assert.equal(card.imageTitleGap, 8);
          assert.equal(card.titleButtonGap, 8);
          assert.ok(Math.abs(card.bottomPadding - 10) <= 0.1);
          assert.equal(card.extraContent, false);
        }
        assert.ok(Math.max(...row.cardStyles.map(card => card.imageHeight)) - Math.min(...row.cardStyles.map(card => card.imageHeight)) <= 1);
      }
    }
    if (!cardsMode) {
      const previous = JSON.parse(await readFile(`${output}/baseline.json`, 'utf8'));
      for (const row of results.filter(row => row.width >= 768)) {
        assert.deepEqual(row.dimensions, previous.results.find(before => before.path === row.path && before.width === row.width).dimensions, `Tablet/desktop dimensions changed at ${row.path} ${row.width}px`);
      }
    }
    assert.equal(errors.length, 0, 'Browser exceptions');
  }
  console.log(JSON.stringify({ passed: results.length, browserErrors: errors, warnings, output }));
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); chrome.kill();
}
