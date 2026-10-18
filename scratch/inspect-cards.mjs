import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';

async function test() {
  const profile = await mkdtemp(join(tmpdir(), 'sak-cards-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9411',
    `--user-data-dir=${profile}`,
    'http://localhost:3000'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9411/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!target) throw new Error('Target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));

    let id = 0;
    const send = (method, params = {}) => new Promise((resolve) => {
      const curId = ++id;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    await send('Page.enable');

    const outDir = 'artifacts/cards';
    await mkdir(outDir, { recursive: true });

    // Desktop
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise(r => setTimeout(r, 1000));

    await send('Runtime.evaluate', {
      expression: `window.scrollTo(0, 650); document.documentElement.scrollTop = 650; document.body.scrollTop = 650;`
    });
    await new Promise(r => setTimeout(r, 600));

    const desktopInfo = (await send('Runtime.evaluate', {
      expression: `(() => {
        const cards = Array.from(document.querySelectorAll('.game-card'));
        if (!cards.length) return null;
        return cards.slice(0, 3).map((card, i) => {
          const title = card.querySelector('h3');
          const btn = card.querySelector('div.flex.h-7, div.flex.h-8, div[class*="Top Up"]') || card.querySelector('div:last-child > div:last-child');
          return {
            index: i,
            cardHeight: card.offsetHeight,
            cardWidth: card.offsetWidth,
            titleText: title ? title.textContent.trim() : null,
            titleHeight: title ? title.offsetHeight : null,
            titleColor: title ? window.getComputedStyle(title).color : null,
            borderRadius: window.getComputedStyle(card).borderRadius,
          };
        });
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Desktop Cards:', JSON.stringify(desktopInfo, null, 2));

    const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, 'cards-desktop-before.png'), Buffer.from(shotDesktop.data, 'base64'));

    // Mobile
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise(r => setTimeout(r, 500));

    await send('Runtime.evaluate', {
      expression: `document.querySelector('#game-results').scrollIntoView({ behavior: 'instant', block: 'start' })`
    });
    await new Promise(r => setTimeout(r, 500));

    const mobileInfo = (await send('Runtime.evaluate', {
      expression: `(() => {
        const cards = Array.from(document.querySelectorAll('.game-card'));
        if (!cards.length) return null;
        return {
          count: cards.length,
          cardHeight: cards[0].offsetHeight,
          cardWidth: cards[0].offsetWidth,
        };
      })()`,
      returnByValue: true
    })).result.value;
    console.log('Mobile Cards:', mobileInfo);

    const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, 'cards-mobile-before.png'), Buffer.from(shotMobile.data, 'base64'));

    ws.close();
  } finally {
    chrome.kill();
  }
}

test().catch(console.error);
