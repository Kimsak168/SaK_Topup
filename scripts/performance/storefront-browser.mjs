// Local production-browser checks. Mutable requests go only to the retained
// Postman storefront simulation; no real order or payment is created.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3100";
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const label = process.argv[3] || "20261029-after";
assert.match(label, /^[a-z0-9-]+$/i);
const verify = process.argv.includes("--verify");
const simulation = "http://127.0.0.1:4900/storefront";
const output = "artifacts/performance";
const debugPort = 9439;
const profile = await mkdtemp(join(tmpdir(), "saksuuu-storefront-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === "page"); } catch {}
    if (!target) await delay(100);
  }
  assert.ok(target, "Headless Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
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
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      requests.push({ method: request.method, path: url.pathname, search: url.search });
      void (async () => {
        if (url.searchParams.get("search") === "slow-search-fixture") await delay(800);
        // All API traffic is isolated. Unknown requests are rejected by the mock.
        const response = await fetch(simulation + url.pathname + url.search, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body: request.method === "GET" ? undefined : request.postData,
        });
        await send("Fetch.fulfillRequest", { requestId, responseCode: response.status,
          responseHeaders: [{ name: "Content-Type", value: response.headers.get("content-type") || "application/json" }],
          body: Buffer.from(await response.arrayBuffer()).toString("base64") });
      })().catch(error => {
        // A changed search aborts its browser request before fulfillment.
        if (!String(error).includes("Invalid InterceptionId")) errors.push(String(error));
      });
    }
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  };
  await fetch(simulation + "/__control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true, delay: 0 }) });
  await send("Page.enable");
  await send("Page.bringToFront");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: base + "/api/*" }] });
  await mkdir(output, { recursive: true });
  const result = { base, at: new Date().toISOString(), home: [] };
  for (const width of [390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await send("Page.navigate", { url: base });
    await waitFor("document.querySelector('#all-platforms a') && document.querySelector('#games a')");
    await delay(1000);
    const metrics = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      games:document.querySelectorAll('#games a[href^="/games/"]').length,
      platforms:document.querySelectorAll('#all-platforms a').length,
      navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),
      scripts:performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').map(e=>({file:e.name.split('/').pop(),bytes:e.encodedBodySize})),
      paints:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime}))})`);
    assert.equal(metrics.platforms, 5);
    assert.ok(metrics.scrollWidth <= width, `No overflow at ${width}px`);
    result.home.push(metrics);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(`${output}/${label}-home-${width}.png`, Buffer.from(shot.data, "base64"));
  }
  await send("Page.navigate", { url: base + "/services" });
  await waitFor("document.querySelectorAll('[data-service-id]').length === 12");
  await evaluate("document.querySelector('button[aria-label=\"Next page\"]').click()");
  await waitFor("document.querySelectorAll('[data-service-id]').length === 3");
  const selection = await evaluate(`({selected:document.querySelectorAll('[data-service-id][aria-pressed="true"]').length,
    quantity:Number(document.querySelector('#service-quantity').value),
    min:Number(document.querySelector('#service-quantity').min),max:Number(document.querySelector('#service-quantity').max)})`);
  result.pagination = selection;
  if (verify) {
    assert.equal(selection.selected, 1, "Checkout selection belongs to the visible page");
    assert.ok(selection.quantity >= selection.min && selection.quantity <= selection.max, "Quantity fits the selected service");
    const beforeCheckoutScripts = await evaluate("performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').length");
    const selectedServiceId = await evaluate("document.querySelector('[data-service-id][aria-pressed=\"true\"]').dataset.serviceId");
    await evaluate("document.querySelector('#target-link').focus()");
    await send("Input.insertText", { text: "https://t.me/simulation" });
    await waitFor("!document.querySelector('form button[type=submit]').disabled");
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('PENDING')");
    result.lazyCheckoutOpened = true;
    result.checkoutExtraScripts = await evaluate("performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').length") - beforeCheckoutScripts;
    assert.ok(result.checkoutExtraScripts > 0, "Checkout code loads on demand");
    const state = await (await fetch(simulation + "/__state")).json();
    assert.equal(state.smmOrders.length, 1);
    assert.equal(state.smmOrders[0].serviceId, selectedServiceId);
    assert.equal(state.smmOrders[0].paymentStatus, "PENDING");
    await evaluate("document.querySelector('button[aria-label=\"Close KHQR payment\"]').click()");
    await waitFor("!document.querySelector('[role=dialog]')");
    await evaluate("document.querySelector('button[aria-label=\"Previous page\"]').click()");
    await waitFor("document.querySelectorAll('[data-service-id]').length === 12");
    const fillSearch = async text => {
      await evaluate("document.querySelector('input[aria-label=\"Search services\"]').focus()");
      await send("Input.insertText", { text });
    };
    await fillSearch("no-fixture-matches-this");
    await waitFor("document.querySelector('#service-catalog').innerText.includes('No services match your filters')");
    assert.equal(await evaluate("document.querySelectorAll('[data-service-id][aria-pressed=\"true\"]').length"), 0);
    assert.equal(await evaluate("Number(document.querySelector('#service-quantity').value)"), 0);
    assert.equal(await evaluate("document.querySelector('form button[type=submit]').disabled"), true);
    await evaluate("document.querySelector('button[aria-label=\"Clear service search\"]').click()");
    await waitFor("document.querySelectorAll('[data-service-id]').length === 12");
    // Abort an already-started search and return to the last successful query.
    await fillSearch("slow-search-fixture");
    await waitFor("Boolean(document.querySelector('[aria-label=\"Loading service catalogue\"]'))");
    await evaluate("document.querySelector('button[aria-label=\"Clear service search\"]').click()");
    await waitFor("document.querySelectorAll('[data-service-id]').length === 12 && !document.querySelector('[aria-label=\"Loading service catalogue\"]')");
    await delay(900);
    assert.equal(await evaluate("document.querySelectorAll('[data-service-id]').length"), 12, "Aborted results do not replace the restored catalog");
    result.emptyAndCancelledSearches = true;
  }
  result.requests = requests;
  result.errors = errors;
  await writeFile(`${output}/${label}-browser.json`, JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ home: result.home.map(({ width, scripts, paints, games, platforms }) => ({ width, javascriptBytes: scripts.reduce((sum, script) => sum + script.bytes, 0), scripts: scripts.length, paints, games, platforms })), pagination: selection, lazyCheckoutOpened: result.lazyCheckoutOpened, errors }));
} finally {
  ws?.close();
  chrome.kill();
}
