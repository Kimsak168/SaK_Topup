import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';

async function test() {
  const profile = await mkdtemp(join(tmpdir(), 'sak-diag-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=9399',
    `--user-data-dir=${profile}`,
    'http://localhost:3000'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9399/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
      if (target) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!target) throw new Error('Target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));

    let id = 0;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
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
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise(r => setTimeout(r, 2000));

    const checkAnimation = async () => {
      return (await send('Runtime.evaluate', {
        expression: `(() => {
          const wrapper = document.querySelector('.ticker-wrapper');
          const track = document.querySelector('.ticker-track');
          if (!track) return { error: 'No ticker-track found' };
          const cs = window.getComputedStyle(track);
          return {
            wrapperHeight: wrapper ? wrapper.offsetHeight : null,
            wrapperWidth: wrapper ? wrapper.offsetWidth : null,
            trackWidth: track.offsetWidth,
            animationName: cs.animationName,
            animationDuration: cs.animationDuration,
            animationPlayState: cs.animationPlayState,
            transform: cs.transform,
            bodyScrollWidth: document.body.scrollWidth,
            windowInnerWidth: window.innerWidth
          };
        })()`,
        returnByValue: true
      })).result.value;
    };

    const initial = await checkAnimation();
    console.log('Sample 1 (t=0ms):', initial);

    await new Promise(r => setTimeout(r, 600));

    const after = await checkAnimation();
    console.log('Sample 2 (t=600ms):', after);

    const isTransformChanging = initial.transform !== after.transform;
    console.log('Is transform changing over time?', isTransformChanging);

    // Test mobile (375x667)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise(r => setTimeout(r, 1000));
    const mobileCheck = await checkAnimation();
    console.log('Mobile Sample:', mobileCheck);

    // Save screenshot
    const outDir = 'artifacts/ticker';
    await mkdir(outDir, { recursive: true });
    await send('Runtime.evaluate', {
      expression: `document.querySelector('form[role="search"]').scrollIntoView({ behavior: 'instant', block: 'start' })`
    });
    await new Promise(r => setTimeout(r, 300));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, 'ticker-animated.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved animated screenshot to artifacts/ticker/ticker-animated.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

test().catch(console.error);
