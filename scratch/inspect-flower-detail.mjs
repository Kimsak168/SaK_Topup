import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-inspect2-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9366',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9366/json/list')).json();
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
    await delay(3000);

    const info = await evaluate(`(() => {
      const flower = document.querySelector('.dreamy-falling-flower');
      if (!flower) return 'No flower found';
      const cs = getComputedStyle(flower);
      const parentCs = getComputedStyle(flower.parentElement);
      return {
        outerHTML: flower.outerHTML.slice(0, 300),
        parentClass: flower.parentElement.className,
        parentDisplay: parentCs.display,
        parentWidth: parentCs.width,
        parentHeight: parentCs.height,
        parentPosition: parentCs.position,
        parentZIndex: parentCs.zIndex,
        flowerWidth: cs.width,
        flowerHeight: cs.height,
        flowerPosition: cs.position,
        flowerTop: cs.top,
        flowerLeft: cs.left,
        flowerOpacity: cs.opacity,
        flowerDisplay: cs.display,
        flowerAnimation: cs.animation,
        flowerAnimationName: cs.animationName,
        varFlowerSize: cs.getPropertyValue('--flower-size'),
        varFlowerMobileSize: cs.getPropertyValue('--flower-mobile-size'),
        varFlowerDur: cs.getPropertyValue('--flower-dur'),
        varFlowerDelay: cs.getPropertyValue('--flower-delay'),
        rect: flower.getBoundingClientRect()
      };
    })()`);

    console.log('FLOWER INFO:', JSON.stringify(info, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
