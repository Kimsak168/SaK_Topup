import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'saksuuu-nb-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9375',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9375/json/list')).json();
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
    const outDir = 'artifacts/navbar-banner';
    await mkdir(outDir, { recursive: true });

    const viewports = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 390, height: 844 }
    ];

    const measurements = {};

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768
      });
      await send('Page.navigate', { url: 'http://localhost:3000/' });
      await delay(2000);

      const data = await evaluate(`(() => {
        const nav = document.querySelector('.public-navbar > div');
        const navRect = nav ? nav.getBoundingClientRect() : null;
        const supportBtn = document.querySelector('.public-navbar button[aria-controls]');
        const supportRect = supportBtn ? supportBtn.getBoundingClientRect() : null;
        const banner = document.querySelector('[role=\"region\"][aria-label=\"Promotions\"] .group');
        const bannerRect = banner ? banner.getBoundingClientRect() : null;
        const homeLink = document.querySelector('.public-navbar nav a');
        const homeCs = homeLink ? getComputedStyle(homeLink) : null;
        const arrow = document.querySelector('[aria-label=\"Previous banner\"]');
        const arrowRect = arrow ? arrow.getBoundingClientRect() : null;
        const dots = document.querySelectorAll('[aria-label^=\"Go to banner\"]');
        const flowerLayer = document.querySelector('.falling-flowers-background');

        return {
          navbarHeight: navRect ? Math.round(navRect.height) : null,
          navbarWidth: navRect ? Math.round(navRect.width) : null,
          supportHeight: supportRect ? Math.round(supportRect.height) : null,
          supportWidth: supportRect ? Math.round(supportRect.width) : null,
          bannerHeight: bannerRect ? Math.round(bannerRect.height) : null,
          bannerWidth: bannerRect ? Math.round(bannerRect.width) : null,
          homeOutline: homeCs ? homeCs.outlineStyle : null,
          homeColor: homeCs ? homeCs.color : null,
          homeFontWeight: homeCs ? homeCs.fontWeight : null,
          arrowWidth: arrowRect ? Math.round(arrowRect.width) : null,
          arrowHeight: arrowRect ? Math.round(arrowRect.height) : null,
          dotCount: dots.length,
          flowerZIndex: flowerLayer ? getComputedStyle(flowerLayer).zIndex : null,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`);

      measurements[vp.name] = data;

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${outDir}/${vp.name}.png`, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot ${outDir}/${vp.name}.png:`, data);
    }

    await writeFile(`${outDir}/measurements.json`, JSON.stringify(measurements, null, 2));
    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
