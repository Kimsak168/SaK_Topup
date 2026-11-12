// Compare local production rendering without creating orders or payments.
// Every mutable request and all order/payment/balance/cron API reads are blocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3118";
const label = process.argv[3] || "before";
const compare = process.argv[4];
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(label, /^[a-z0-9-]+$/i);
if (compare) assert.match(compare, /^[a-z0-9-]+$/i);
const output = ".local-backups/performance-20261103";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "saksuuu-rendering-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9464", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt++) {
    try { target = (await (await fetch("http://127.0.0.1:9464/json/list")).json()).find(item => item.type === "page"); } catch {}
    if (!target) await delay(100);
  }
  assert.ok(target, "Headless Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const requests = [];
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(requestId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error)));
      else task?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent") requests.push({ method: message.params.request.method, url: message.params.request.url });
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      const path = new URL(request.url).pathname;
      const safe = request.method === "GET" && !/^\/api\/(orders|payment|rewards|cron|admin|lucky-draw|smm\/orders|digital-shop\/orders|v1\/smm\/deposit)(\/|$)/.test(path);
      void send(safe ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId, ...(safe ? {} : { errorReason: "BlockedByClient" }),
      }).catch(error => errors.push(String(error)));
    }
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__rendering = { tickerRenders: 0, canvasReads: [], lcp: 0 };
    new PerformanceObserver(list => list.getEntries().forEach(entry => window.__rendering.lcp = entry.startTime))
      .observe({ type: 'largest-contentful-paint', buffered: true });
    const sources = new WeakMap();
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      sources.set(this, image.currentSrc || image.src || '');
      return draw.call(this, image, ...args);
    };
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      window.__rendering.canvasReads.push(sources.get(this));
      return read.apply(this, args);
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(),
      inject(renderer) { this.renderers.set(1, renderer); return 1; },
      onCommitFiberRoot(id, root) {
        function visit(fiber) {
          if (!fiber) return;
          if ((fiber.flags & 1) && fiber.memoizedProps?.games &&
              fiber.child?.memoizedProps?.className?.includes('ticker-wrapper')) window.__rendering.tickerRenders++;
          visit(fiber.child); visit(fiber.sibling);
        }
        visit(root.current);
      }, onCommitFiberUnmount() {},
    };
  ` });
  const snapshot = () => evaluate(`(async () => {
    await document.fonts.ready;
    return [...document.querySelectorAll('.storefront-search, .storefront-catalogue-heading, .storefront-grid > a, .topup-step-title, button.package-option')].map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { text: element.textContent.trim(), className: element.className,
        href: element.getAttribute('href'), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2),
        color: style.color, background: style.backgroundColor, font: style.font, borderRadius: style.borderRadius };
    });
  })()`);
  const result = { base, cpuSlowdown: 4, runs: [] };
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await send("Page.navigate", { url: base });
    await waitFor("document.querySelectorAll('a.game-card').length > 5 && window.__rendering.tickerRenders > 0");
    await delay(1200);
    const run = { width, homeSnapshot: await snapshot() };
    run.initial = await evaluate(`({ ...window.__rendering, scriptBytes: performance.getEntriesByType('resource')
      .filter(entry => entry.initiatorType === 'script').reduce((sum, entry) => sum + entry.decodedBodySize, 0) })`);
    for (const [section, href] of [["games", "/#games"], ["all-platforms", "/#services"]]) {
      await evaluate(`window.scrollTo(0, window.scrollY + document.getElementById(${JSON.stringify(section)}).getBoundingClientRect().top - window.innerHeight * 0.2)`);
      await waitFor(`document.querySelector('.public-navbar nav a[href="${href}"][aria-current="page"]')`);
    }
    await evaluate("window.scrollTo(0, 0)");
    await waitFor("document.querySelector('.public-navbar nav a[href=\"/\"][aria-current=\"page\"]')");
    run.scrollNavigation = true;
    if (width < 768) {
      await evaluate("document.querySelector('button[aria-label=\"Open navigation menu\"]').click()");
      await waitFor("document.querySelector('[role=dialog][aria-label=\"Site menu\"]')");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitFor("!document.querySelector('[role=dialog][aria-label=\"Site menu\"]') && document.activeElement?.getAttribute('aria-label') === 'Open navigation menu'");
      run.mobileMenu = true;
    }
    const requestStart = requests.length;
    await evaluate("document.querySelector('#game-search').focus()");
    const tickerStart = await evaluate("window.__rendering.tickerRenders");
    const typing = [];
    for (const text of "free") {
      const start = performance.now();
      await send("Input.insertText", { text });
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      typing.push(Math.round(performance.now() - start));
    }
    await delay(250);
    run.search = { tickerRenders: await evaluate("window.__rendering.tickerRenders") - tickerStart,
      inputRoundTripsMs: typing, results: await evaluate("[...document.querySelectorAll('#game-results a.game-card')].map(element => element.getAttribute('href'))"),
      apiRequests: requests.slice(requestStart).filter(request => new URL(request.url).pathname.startsWith('/api/')).length };
    await evaluate("document.querySelector('button[aria-label=\"Clear search input\"]').click()");
    await waitFor("document.querySelectorAll('a.game-card').length > 5");
    await evaluate("document.querySelector('a.game-card[href=\"/games/webbuilder/freefire_khsgmy\"]').click()");
    await waitFor("document.querySelectorAll('button.package-option').length > 5");
    await evaluate(`(async () => {
      for (let top = 0; top < document.documentElement.scrollHeight; top += 600) {
        window.scrollTo(0, top); await new Promise(resolve => setTimeout(resolve, 80));
      }
      window.scrollTo(0, 0);
    })()`);
    await delay(2500);
    run.packageSnapshot = await snapshot();
    run.images = await evaluate(`(async () => {
      const images = [...document.querySelectorAll('button.package-option img')];
      const hashes = await Promise.all(images.map(async image => {
        const bytes = new TextEncoder().encode(image.getAttribute('src'));
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }));
      return { count: images.length, processed: images.filter(image => image.src.startsWith('data:image/png')).length,
        hashes, canvasReads: window.__rendering.canvasReads.length,
        uniqueSources: new Set(window.__rendering.canvasReads).size,
        loaded: images.every(image => image.complete && image.naturalWidth > 0) };
    })()`);
    assert.ok(run.images.loaded, "Every package image loaded");
    if (compare) {
      const before = JSON.parse(await readFile(`${output}/${compare}-rendering.json`, "utf8")).runs.find(item => item.width === width);
      assert.deepEqual(run.homeSnapshot, before.homeSnapshot, "Homepage content and computed styling match");
      assert.deepEqual(run.packageSnapshot, before.packageSnapshot, "Package content, prices, sizes and styling match");
      assert.deepEqual(run.images.hashes, before.images.hashes, "Processed artwork is byte-for-byte identical");
      assert.deepEqual(run.search.results, before.search.results, "Search results match");
      assert.equal(run.search.tickerRenders, 0, "Typing no longer renders the unchanged ticker");
      assert.ok(run.images.canvasReads <= before.images.canvasReads, "Image processing work does not increase");
    }
    result.runs.push(run);
    console.log(JSON.stringify({ width, search: run.search, images: { ...run.images, hashes: undefined }, initial: run.initial }));
  }
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  result.errors = errors;
  result.logoRequests = requests.filter(request => new URL(request.url).pathname === '/api/settings/public-logo').length;
  await writeFile(`${output}/${label}-rendering.json`, JSON.stringify(result, null, 2));
  await send("Browser.close");
} finally {
  ws?.close();
  chrome.kill();
}
