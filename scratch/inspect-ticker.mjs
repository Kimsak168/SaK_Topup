import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-tk-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9388',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9388/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await delay(100);
    }
    if (!target) throw new Error('Chrome target not found');

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
    await send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await send('Page.navigate', { url: 'http://localhost:3000' });
    await delay(2000);

    const layoutInfo = await evaluate(`(() => {
      const ticker = document.querySelector('.active-games-ticker');
      const track = document.querySelector('.active-games-track');
      const searchForm = document.querySelector('form[role="search"]');
      const gamesSection = document.getElementById('games');
      const results = document.getElementById('game-results');

      return {
        ticker: ticker ? {
          offsetHeight: ticker.offsetHeight,
          offsetWidth: ticker.offsetWidth,
          padding: window.getComputedStyle(ticker).padding,
          children: Array.from(ticker.children).map(c => ({
            tag: c.tagName,
            className: c.className,
            offsetHeight: c.offsetHeight,
            offsetWidth: c.offsetWidth,
            display: window.getComputedStyle(c).display,
            visibility: window.getComputedStyle(c).visibility
          }))
        } : null,
      };
    })()`);

    const outDir = 'artifacts/ticker';
    await mkdir(outDir, { recursive: true });

    // 1. Desktop test (1280x900)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(300);

    const desktopInfo = await evaluate(`(() => {
      const ticker = document.querySelector('.active-games-ticker');
      const track = document.querySelector('.active-games-track');
      return {
        height: ticker ? ticker.offsetHeight : null,
        width: ticker ? ticker.offsetWidth : null,
        trackHeight: track ? track.offsetHeight : null,
        anim: track ? window.getComputedStyle(track).animationName : null,
      };
    })()`);
    console.log('Desktop Layout:', desktopInfo);

    await evaluate(`document.querySelector('form[role="search"]').scrollIntoView({ behavior: 'instant', block: 'start' })`);
    await delay(300);
    const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, 'ticker-desktop.png'), Buffer.from(shotDesktop.data, 'base64'));

    // 2. Mobile test (375x667)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(300);

    const mobileInfo = await evaluate(`(() => {
      const ticker = document.querySelector('.active-games-ticker');
      const track = document.querySelector('.active-games-track');
      return {
        height: ticker ? ticker.offsetHeight : null,
        width: ticker ? ticker.offsetWidth : null,
        trackHeight: track ? track.offsetHeight : null,
      };
    })()`);
    console.log('Mobile Layout:', mobileInfo);

    await evaluate(`document.querySelector('form[role="search"]').scrollIntoView({ behavior: 'instant', block: 'start' })`);
    await delay(300);
    const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, 'ticker-mobile.png'), Buffer.from(shotMobile.data, 'base64'));

    console.log('Saved screenshots for desktop and mobile.');

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
