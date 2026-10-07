import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://localhost:3000';
const output = 'artifacts/mobile-packages';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-pkg-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--remote-debugging-port=9359', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const results = [], errors = [];
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9359/json/list')).json()).find(item => item.type === 'page'); } catch {}
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

  const gameUrl = `${base}/games/vizo/freefire_sgmy`;
  await send('Page.navigate', { url: gameUrl });
  await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.package-option').length > 0 && (document.querySelector('.package-option')?.getBoundingClientRect().height || 0) > 0`);

  for (const width of [320, 340, 360, 375, 390, 430, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await delay(400);

    const data = await evaluate(`(() => {
      const options = [...document.querySelectorAll('.package-option')];
      if (!options.length) return null;
      const grid = options[0].parentElement;
      const computedColumns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const heights = options.slice(0, 3).map(el => Math.round(el.getBoundingClientRect().height));
      const overflow = document.documentElement.scrollWidth > innerWidth;
      return {
        width: innerWidth,
        columns: computedColumns,
        firstThreeHeights: heights,
        overflow,
        optionsCount: options.length,
      };
    })()`);

    results.push(data);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${output}/packages-${width}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`${width}px: ${data.columns} cols, heights: [${data.firstThreeHeights.join(', ')}], overflow: ${data.overflow}`);
  }

  // Interactive package selection test:
  // 1. Click first option -> becomes selected
  await evaluate(`document.querySelector('.package-option:not(:disabled)').click()`);
  await delay(150);
  const isSelected = await evaluate(`document.querySelector('.package-option:not(:disabled)').getAttribute('aria-pressed') === 'true'`);
  assert.ok(isSelected, 'Package must be selected on click');

  // 2. Click selected package again -> deselects
  await evaluate(`document.querySelector('.package-option[aria-pressed=true]').click()`);
  await delay(150);
  const isDeselected = await evaluate(`document.querySelector('.package-option:not(:disabled)').getAttribute('aria-pressed') === 'false'`);
  assert.ok(isDeselected, 'Package must be deselected when clicked again');

  // Verify responsive columns
  for (const row of results) {
    assert.ok(!row.overflow, `Horizontal overflow at ${row.width}px`);
    if (row.width < 340) {
      assert.equal(row.columns, 2, `Expected 2 columns below 340px (got ${row.columns})`);
    } else if (row.width < 768) {
      assert.equal(row.columns, 3, `Expected 3 columns between 340px and 767px (got ${row.columns})`);
    } else {
      assert.equal(row.columns, 2, `Expected 2 columns on tablet 768px (got ${row.columns})`);
    }
  }

  console.log('All responsive package checks passed successfully!');
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); chrome.kill();
}
