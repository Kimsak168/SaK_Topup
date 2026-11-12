// Production preview regression checks. Reads local catalogue data only;
// every non-GET browser request is blocked, including orders and payments.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3118";
const label = process.argv[3] || "navigation";
const width = Number(process.argv[4]) || 390;
const verify = process.argv.includes("--verify");
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(label, /^[a-z0-9-]+$/i);
const profile = await mkdtemp(join(tmpdir(), "saksuuu-navigation-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9453", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt++) {
    try { target = (await (await fetch("http://127.0.0.1:9453/json/list")).json()).find(item => item.type === "page"); } catch {}
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
      resolve: result => { clearTimeout(timer); resolve(result); },
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
    if (message.method === "Network.requestWillBeSent") requests.push({
      url: message.params.request.url, method: message.params.request.method,
      prefetch: Object.entries(message.params.request.headers).some(([key, value]) => key.toLowerCase() === 'next-router-prefetch' && value === '1'),
    });
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      void send(request.method === "GET" ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId, ...(request.method === "GET" ? {} : { errorReason: "BlockedByClient" }),
      }).catch(error => errors.push(String(error)));
    }
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  await send("Page.enable");
  await send("Page.bringToFront");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__audit = { commits: [], packages: [] };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(),
      inject(renderer) { this.renderers.set(1, renderer); return 1; },
      onCommitFiberRoot(id, root) {
        const changed = new Set();
        const packages = new Map();
        function visit(fiber) {
          if (!fiber) return;
          if (fiber.memoizedProps?.pkg && typeof fiber.memoizedProps.onSelect === 'function') {
            const pkg = fiber.memoizedProps.pkg;
            packages.set(pkg.id, { id: pkg.id, name: pkg.name });
            if (fiber.flags & 1) changed.add(pkg.id);
          }
          visit(fiber.child); visit(fiber.sibling);
        }
        visit(root.current);
        window.__audit.commits.push([...changed]);
        window.__audit.packages = [...packages.values()];
      }, onCommitFiberUnmount() {},
    };
  ` });
  const result = { base, width, cpuSlowdown: 4 };
  await send("Page.navigate", { url: base });
  const gamePath = "/games/webbuilder/freefire_khsgmy";
  const linkSelector = `a.game-card[href="${gamePath}"]`;
  await waitFor(`document.querySelector(${JSON.stringify(linkSelector)}) && window.__audit.commits.length > 0`);
  await delay(1200);
  const beforeFocus = requests.length;
  await evaluate(`document.querySelector(${JSON.stringify(linkSelector)}).focus()`);
  await delay(1200);
  result.intentRequests = requests.slice(beforeFocus).filter(request => request.prefetch || request.url.includes(gamePath));
  result.intentPrefetch = result.intentRequests.some(request => request.url.includes(gamePath) && (request.prefetch || request.url.includes("_rsc=")));
  const navigationStart = performance.now();
  await evaluate(`document.querySelector(${JSON.stringify(linkSelector)}).click()`);
  await waitFor("document.querySelectorAll('button.package-option').length > 1 && window.__audit.packages.length > 1");
  result.navigationMs = Math.round(performance.now() - navigationStart);
  await delay(1200);
  result.initialSelected = await evaluate("document.querySelectorAll('button.package-option[aria-pressed=true]').length");
  assert.equal(result.initialSelected, 0, "Ordinary game navigation never selects a package");
  const beforeSelection = requests.length;
  result.selections = await evaluate(`(async () => {
    const buttons = [...document.querySelectorAll('button.package-option')];
    const samples = [];
    for (let i = 0; i < Math.min(8, buttons.length); i++) {
      const button = buttons[i];
      const commitStart = window.__audit.commits.length;
      const start = performance.now();
      button.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rendered = [...new Set(window.__audit.commits.slice(commitStart).flat())];
      samples.push({ ms: performance.now() - start, renderedCards: rendered.length,
        selected: button.getAttribute('aria-pressed') === 'true',
        summaryMatches: document.querySelector('.topup-summary-total')?.textContent.trim() === button.querySelector('.package-option-selling-price')?.textContent.trim(),
        selectedCount: document.querySelectorAll('button.package-option[aria-pressed=true]').length });
    }
    buttons[Math.min(8, buttons.length) - 1].click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { samples, totalCards: buttons.length, deselected: document.querySelectorAll('button.package-option[aria-pressed=true]').length === 0 };
  })()`);
  assert.ok(result.selections.samples.every(sample => sample.selected && sample.selectedCount === 1 && sample.summaryMatches));
  assert.ok(result.selections.deselected, "Clicking the chosen package deselects it");
  result.selectionApiRequests = requests.slice(beforeSelection).filter(request => new URL(request.url).pathname.startsWith("/api/"));
  assert.equal(result.selectionApiRequests.length, 0, "Selecting packages makes no backend requests");
  const pkg = await evaluate("window.__audit.packages[1]");
  await send("Page.navigate", { url: new URL(`${gamePath}?package=${encodeURIComponent(pkg.id)}`, base).href });
  await waitFor(`document.querySelector('button.package-option[aria-pressed=true]')?.title === ${JSON.stringify(pkg.name)}`);
  await delay(250);
  await evaluate("document.querySelector('button.package-option[aria-pressed=true]').click()");
  await delay(250);
  assert.equal(await evaluate("document.querySelectorAll('button.package-option[aria-pressed=true]').length"), 0, "Featured package can be deselected");
  result.featuredPackageSelection = true;
  await send("Page.navigate", { url: new URL(`${gamePath}?package=missing-package`, base).href });
  await waitFor("document.querySelectorAll('button.package-option').length > 1 && window.__audit.packages.length > 1");
  await delay(300);
  assert.equal(await evaluate("document.querySelectorAll('button.package-option[aria-pressed=true]').length"), 0, "Unknown package IDs stay unselected");
  result.invalidPackageSelection = true;
  if (verify) {
    const beforeQueryChange = requests.length;
    await evaluate(`window.history.pushState(null, '', '?package=' + ${JSON.stringify(pkg.id)})`);
    await waitFor(`document.querySelector('button.package-option[aria-pressed=true]')?.title === ${JSON.stringify(pkg.name)}`);
    assert.equal(requests.slice(beforeQueryChange).filter(request => new URL(request.url).pathname.startsWith('/api/')).length, 0);
    result.clientQuerySelection = true;
  }
  await evaluate("window.dispatchEvent(new CustomEvent('open-lucky-draw'))");
  await waitFor("document.querySelector('[aria-label=\"Lucky Draw Wheel Modal\"] canvas')");
  result.luckyDrawOpens = true;
  if (verify) {
    await send("Page.navigate", { url: new URL('/checkout', base).href });
    await waitFor("location.pathname === '/checkout' && document.querySelector('.payment-method-title')?.textContent === 'KHQR' && window.__audit.commits.length > 0");
    await delay(500);
    result.customerHealthRequests = requests.filter(request => new URL(request.url).pathname === '/api/payment/vngzz2/health').length;
    assert.equal(result.customerHealthRequests, 0, "Game and checkout pages never probe the live payment provider on load");
  }
  assert.deepEqual(errors, [], "No browser exceptions");
  assert.ok(requests.every(request => request.method === "GET"), "No mutable requests were made");
  result.errors = errors;
  await mkdir(".local-backups/navigation", { recursive: true });
  await writeFile(`.local-backups/navigation/${label}-browser.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (verify) {
    assert.ok(result.intentPrefetch, "Focusing a catalogue link preloads its destination");
    assert.ok(result.selections.samples.some(sample => sample.renderedCards > 0), "React render instrumentation is active");
    assert.ok(result.selections.samples.every(sample => sample.renderedCards <= 2), "Only the old and new package cards rerender");
  }
  await send("Browser.close");
} finally {
  ws?.close();
  chrome.kill();
}
