import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-inspect-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9365',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9365/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await delay(100);
    }
    if (!target) throw new Error('Could not connect to Chrome target');

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

    // Wait for page
    await delay(3000);

    const diagnostics = await evaluate(`(() => {
      const bg = document.querySelector('.falling-flowers-background');
      const flowers = [...document.querySelectorAll('.dreamy-falling-flower')];
      const html = document.documentElement;
      const body = document.body;
      const publicTheme = document.querySelector('.public-theme');
      const contentWrapper = publicTheme?.children[2];

      const flowerData = flowers.map((f, i) => {
        const r = f.getBoundingClientRect();
        const cs = getComputedStyle(f);
        const topEl = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          idx: i,
          rect: { top: r.top, left: r.left, width: r.width, height: r.height },
          opacity: cs.opacity,
          display: cs.display,
          visibility: cs.visibility,
          transform: cs.transform,
          zIndex: cs.zIndex,
          topElement: topEl ? {
            tag: topEl.tagName,
            className: topEl.className,
            id: topEl.id
          } : null
        };
      });

      return {
        bgExists: !!bg,
        bgRect: bg?.getBoundingClientRect(),
        bgZIndex: bg ? getComputedStyle(bg).zIndex : null,
        bodyBg: getComputedStyle(body).backgroundColor,
        publicThemeBg: publicTheme ? getComputedStyle(publicTheme).background : null,
        contentWrapperZIndex: contentWrapper ? getComputedStyle(contentWrapper).zIndex : null,
        flowerCount: flowers.length,
        flowerData: flowerData.slice(0, 5)
      };
    })()`);

    console.log('DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));

    await mkdir('artifacts/falling-flowers', { recursive: true });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('artifacts/falling-flowers/current-inspect.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot to artifacts/falling-flowers/current-inspect.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
