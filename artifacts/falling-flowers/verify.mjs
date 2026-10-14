import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const output = 'artifacts/falling-flowers';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'saksuuu-flowers-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--remote-debugging-port=9363', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const keepAlive = setInterval(() => {}, 1000);
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9363/json/list')).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  assert(target, 'Chrome started');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const task = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) task.reject(msg.error); else task.resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const results = [];
  const motionResults = [];
  for (const path of ['/', '/games/vizo/freefire_sgmy', '/orders', '/checkout']) {
    await send('Page.navigate', { url: `http://127.0.0.1:3000${path}` });
    let ready = false;
    for (let i = 0; i < 450; i++) {
      ready = await evaluate(`location.pathname === ${JSON.stringify(path)} && (document.querySelector('.dreamy-falling-flower')?.getBoundingClientRect().width || 0) > 0 && !!document.querySelector('footer')`);
      if (ready) break;
      await delay(100);
    }
    assert(ready, `Page ready: ${path}`);
    await evaluate('document.fonts.ready.then(() => true)');
    for (const width of [320, 390, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
      await delay(200);
      const state = await evaluate(`(() => {
        const layer = document.querySelector('.falling-flowers-background');
        const flowers = [...layer.children].filter(e => getComputedStyle(e).display !== 'none');
        return {
          count: flowers.length,
          layerDisplay: getComputedStyle(layer).display,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          flowerStyle: flowers[0].getAttribute('style'),
          computedWidth: getComputedStyle(flowers[0]).width,
          maxSize: Math.max(...flowers.map(e => e.getBoundingClientRect().width)),
          overflow: document.documentElement.scrollWidth > innerWidth,
          pointerEvents: getComputedStyle(layer).pointerEvents,
          layerZ: getComputedStyle(layer).zIndex,
          mainZ: getComputedStyle(document.querySelector('main')).zIndex,
          navZ: getComputedStyle(document.querySelector('.public-navbar')).zIndex,
          footerZ: getComputedStyle(document.querySelector('footer')).zIndex,
          duration: getComputedStyle(flowers[0]).animationDuration,
          background: getComputedStyle(document.querySelector('.public-theme')).backgroundImage
        };
      })()`);
      assert.equal(state.count, width < 768 ? 6 : width < 1024 ? 10 : 16);
      assert.equal(state.overflow, false);
      assert.equal(state.pointerEvents, 'none');
      assert(+state.mainZ > +state.layerZ && +state.navZ > +state.layerZ && +state.footerZ > +state.layerZ);
      assert(state.maxSize <= (width < 768 ? 18 : 28));
      assert(state.maxSize > 0, JSON.stringify(state));
      assert(parseFloat(state.duration) >= 8 && parseFloat(state.duration) <= 16);
      assert(state.background.includes('linear-gradient'));
      results.push({ path, width, ...state });
      if (path === '/' && [390, 1440].includes(width)) {
        // Observe natural movement before inspecting the start/end of a cycle.
        const sampleExpression = `(() => {
          const flower = document.querySelector('.dreamy-falling-flower');
          const rect = flower.getBoundingClientRect();
          return { top: rect.top, opacity: Number(getComputedStyle(flower).opacity), time: flower.getAnimations()[0].currentTime };
        })()`;
        const before = await evaluate(sampleExpression);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`${output}/home-${width}.png`, Buffer.from(shot.data, 'base64'));
        await delay(1000);
        const after = await evaluate(sampleExpression);
        assert(after.time > before.time + 800, 'Animation clock advances naturally');
        const travel = (after.top - before.top + 1200) % 1200;
        assert(travel > 80 && travel < 300, `Visible downward travel: ${travel}`);
        const nextShot = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(`${output}/home-${width}-after.png`, Buffer.from(nextShot.data, 'base64'));
        const cycle = await evaluate(`(() => {
          const flower = document.querySelector('.dreamy-falling-flower');
          const animation = flower.getAnimations()[0];
          const timing = animation.effect.getTiming();
          const previous = animation.currentTime;
          animation.pause();
          const positions = [0, 0.5, 0.999, 1.001].map(progress => {
            animation.currentTime = timing.delay + timing.duration * progress;
            const rect = flower.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, opacity: Number(getComputedStyle(flower).opacity) };
          });
          animation.currentTime = previous;
          animation.play();
          return { positions, infinite: timing.iterations === Infinity, delay: timing.delay, duration: timing.duration };
        })()`);
        assert(cycle.positions[0].bottom < 0, 'Starts above viewport');
        assert(cycle.positions[1].top > 400 && cycle.positions[1].opacity >= 0.25);
        assert(cycle.positions[2].top > 1000, 'Reaches below viewport');
        assert(cycle.positions[3].bottom < 0, 'Repeats from above viewport');
        assert(cycle.infinite && cycle.delay < 0);
        const clickable = await evaluate(`(() => {
          const targets = [...document.querySelectorAll('.public-navbar a[href], .public-navbar button, .game-card')].filter(e => {
            const r = e.getBoundingClientRect();
            return !e.closest('[inert]') && r.width && r.height && r.top >= 0 && r.bottom < innerHeight;
          });
          return targets.length > 3 && targets.every(e => {
            const r = e.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return hit === e || e.contains(hit);
          });
        })()`);
        assert(clickable, 'Navbar, buttons and game cards accept pointer hits');
        motionResults.push({ width, before, after, travel, cycle, clickable });
      }
    }
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert(await evaluate(`getComputedStyle(document.querySelector('.falling-flowers-background')).display === 'none' && getComputedStyle(document.querySelector('.dreamy-falling-flower')).animationName === 'none'`));
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/admin/login' });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`location.pathname === '/admin/login' && !!document.querySelector('input')`)) break;
    await delay(100);
  }
  assert(await evaluate(`location.pathname === '/admin/login' && !document.querySelector('.falling-flowers-background')`));
  await writeFile(`${output}/verification.json`, JSON.stringify({ results, motionResults, reducedMotion: 'passed', adminExcluded: true }, null, 2));
  console.log(JSON.stringify({ checked: results.length, widths: [320, 390, 768, 1440], naturalMotion: motionResults.map(r => ({ width: r.width, downwardTravel: r.travel })), fullCycle: 'passed', reducedMotion: 'passed', adminExcluded: true, overflow: 'none', layering: 'passed' }));
} finally {
  clearInterval(keepAlive);
  ws?.close();
  chrome.kill();
}
