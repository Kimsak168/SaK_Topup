import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-inspect4-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9368',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9368/json/list')).json();
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

    const fInfo = await evaluate(`(() => {
      const f = document.querySelector('.dreamy-falling-flower');
      const cs = getComputedStyle(f);
      const parentCs = getComputedStyle(f.parentElement);
      return {
        className: f.className,
        styleAttr: f.getAttribute('style'),
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        animationPlayState: cs.animationPlayState,
        display: cs.display,
        parentDisplay: parentCs.display,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    })()`);

    console.log('FLOWER INFO 4:', JSON.stringify(fInfo, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
