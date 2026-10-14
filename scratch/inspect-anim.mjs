import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-inspect3-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9367',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9367/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await delay(100);
    }
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:3000/' });
    await delay(1000);

    const animInfo = await evaluate(`(() => {
      const flowers = [...document.querySelectorAll('.dreamy-falling-flower')];
      return flowers.map((f, i) => {
        const anims = f.getAnimations();
        const anim = anims[0];
        const timing = anim ? anim.effect.getTiming() : null;
        const rect = f.getBoundingClientRect();
        const cs = getComputedStyle(f);
        return {
          index: i,
          animsCount: anims.length,
          playState: anim ? anim.playState : null,
          currentTime: anim ? anim.currentTime : null,
          timing: timing ? {
            duration: timing.duration,
            delay: timing.delay,
            iterations: timing.iterations,
            fill: timing.fill
          } : null,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          opacity: cs.opacity,
          transform: cs.transform
        };
      });
    })()`);

    console.log('ANIM INFO:', JSON.stringify(animInfo, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
