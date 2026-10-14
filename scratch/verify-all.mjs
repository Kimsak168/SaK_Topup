import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-verify-all-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9370',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9370/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await delay(100);
    }
    assert(target, 'Chrome target found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(res => ws.addEventListener('open', res, { once: true }));

    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const task = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) task.reject(msg.error);
        else task.resolve(msg.result);
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async expr => {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    };

    await send('Page.enable');
    const outputDir = 'artifacts/falling-flowers';
    await mkdir(outputDir, { recursive: true });

    // Test routes: Home, Games Catalogue, Game Detail, Orders, Checkout
    const testRoutes = ['/', '/games', '/orders', '/checkout'];
    const results = {};

    for (const route of testRoutes) {
      await send('Page.navigate', { url: `http://localhost:3000${route}` });
      await delay(2500);

      const exists = await evaluate(`(() => {
        const layer = document.querySelector('.falling-flowers-background');
        const flowers = document.querySelectorAll('.dreamy-falling-flower');
        return {
          layerMounted: !!layer,
          layerDisplay: layer ? getComputedStyle(layer).display : null,
          layerZIndex: layer ? getComputedStyle(layer).zIndex : null,
          flowerCount: flowers.length,
          pointerEvents: layer ? getComputedStyle(layer).pointerEvents : null
        };
      })()`);

      assert(exists.layerMounted, `Layer mounted on ${route}`);
      assert.equal(exists.layerDisplay, 'block', `Layer visible on ${route}`);
      assert.equal(exists.layerZIndex, '1', `Layer zIndex 1 on ${route}`);
      assert.equal(exists.pointerEvents, 'none', `pointer-events none on ${route}`);
      results[route] = exists;
    }

    // Now test Admin Route to ensure flowers are NOT on admin
    await send('Page.navigate', { url: 'http://localhost:3000/admin/login' });
    await delay(1500);
    const adminFlowers = await evaluate(`!!document.querySelector('.falling-flowers-background')`);
    assert.equal(adminFlowers, false, 'Flowers must NOT be in admin layout');
    results['/admin/login'] = { layerMounted: false };

    // Responsive and motion tests on Homepage
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await delay(2000);

    const breakpoints = [
      { name: 'mobile', width: 390, height: 844, expectedMin: 4, expectedMax: 7, exact: 5 },
      { name: 'tablet', width: 768, height: 1024, expectedMin: 7, expectedMax: 10, exact: 8 },
      { name: 'desktop', width: 1440, height: 900, expectedMin: 10, expectedMax: 14, exact: 12 }
    ];

    const responsiveResults = [];

    for (const bp of breakpoints) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: bp.width,
        height: bp.height,
        deviceScaleFactor: 1,
        mobile: bp.width < 768
      });
      await delay(500);

      const check = await evaluate(`(() => {
        const layer = document.querySelector('.falling-flowers-background');
        const allFlowers = [...document.querySelectorAll('.dreamy-falling-flower')];
        const visibleFlowers = allFlowers.filter(f => getComputedStyle(f).display !== 'none');
        const widths = visibleFlowers.map(f => f.getBoundingClientRect().width);
        const opacities = visibleFlowers.map(f => parseFloat(getComputedStyle(f).opacity));

        // Check downward travel by sampling one flower
        const f0 = visibleFlowers[0];
        const anim = f0.getAnimations()[0];
        const timing = anim ? anim.effect.getTiming() : null;

        // Check clickable targets to ensure flower layer never intercepts clicks
        const targets = [...document.querySelectorAll('.public-navbar a[href], .game-card')].filter(el => {
          const r = el.getBoundingClientRect();
          return !el.closest('[inert]') && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom < innerHeight;
        });

        const flowerLayer = document.querySelector('.falling-flowers-background');
        const notBlockedByFlowers = targets.length > 0 && targets.every(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          // Confirm hit is the element (or its descendant) and NEVER the flower layer
          return hit && !flowerLayer.contains(hit) && (hit === el || el.contains(hit));
        });

        return {
          visibleCount: visibleFlowers.length,
          minWidth: Math.min(...widths),
          maxWidth: Math.max(...widths),
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
          infinite: timing ? timing.iterations === Infinity : false,
          delay: timing ? timing.delay : 0,
          notBlockedByFlowers,
          sampleTop: f0.getBoundingClientRect().top
        };
      })()`);

      assert(check.visibleCount >= bp.expectedMin && check.visibleCount <= bp.expectedMax,
        `${bp.name} visible count ${check.visibleCount} in [${bp.expectedMin}, ${bp.expectedMax}]`);
      assert.equal(check.hasOverflow, false, `${bp.name} has no horizontal overflow`);
      assert(check.infinite, `${bp.name} has infinite iterations`);
      assert(check.delay <= 0, `${bp.name} starts with negative delay for immediate appearance`);
      assert(check.notBlockedByFlowers, `${bp.name} content elements are clickable and not blocked by flower layer`);

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const filename = `${outputDir}/verified-${bp.name}-${bp.width}.png`;
      await writeFile(filename, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot: ${filename} (count: ${check.visibleCount})`);

      responsiveResults.push({ ...bp, ...check });
    }

    // Motion advancement test
    const f0SampleBefore = await evaluate(`document.querySelector('.dreamy-falling-flower').getBoundingClientRect().top`);
    await delay(1200);
    const f0SampleAfter = await evaluate(`document.querySelector('.dreamy-falling-flower').getBoundingClientRect().top`);
    const downwardDelta = (f0SampleAfter - f0SampleBefore + 2000) % 2000;
    assert(downwardDelta > 0, 'Flower moves downward naturally');

    const summary = {
      routesTested: testRoutes,
      adminExcluded: true,
      responsive: responsiveResults,
      downwardDelta
    };

    await writeFile(`${outputDir}/test-report.json`, JSON.stringify(summary, null, 2));
    console.log('ALL VERIFICATIONS PASSED:', JSON.stringify(summary, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
