import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run with the production frontend, local preview proxy, and Postman simulation.
// All mutable API requests go through the proxy to fixtures, never production.
const origin = process.env.TOAST_PREVIEW_ORIGIN || "http://127.0.0.1:3011";
const output = "artifacts/public-toasts";
const startedAt = new Date().toISOString();
const debugPort = Number(process.env.TOAST_CHROME_DEBUG_PORT || 9391);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "saksuuu-toasts-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let ws;
const checks = [];
try {
  let target;
  for (let attempt = 0; attempt < 80 && !target; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === "page"); } catch { /* Chrome is starting. */ }
    if (!target) await delay(100);
  }
  assert.ok(target, "Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(JSON.stringify(message.error)));
      else task.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params.request;
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) requests.push({ method: request.method, path: url.pathname });
    }
    if (message.method === "Fetch.requestPaused") {
      // The external SDK is a simulation member too. The real SakSuuu plugin
      // wrapper, fetch calls, response handling, and Sonner rendering still run.
      void send("Fetch.continueRequest", { requestId: message.params.requestId, url: origin + "/khqrcc-plugin.js" });
    }
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, message = expression) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    console.error(JSON.stringify(await evaluate("({url:location.href,ready:document.readyState,sections:[...document.querySelectorAll('section')].map(el=>({label:el.getAttribute('aria-label'),html:el.outerHTML.slice(0,200)})),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)})")));
    console.error(JSON.stringify(errors));
    throw new Error("Timed out: " + message);
  };
  const mark = (description) => { checks.push(description); console.log("PASS: " + description); };
  const viewport = async (width) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 640 });
    await delay(250);
  };
  const navigate = async (path, selector) => {
    await send("Page.navigate", { url: origin + path });
    await waitFor(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`);
    await evaluate("document.fonts.ready.then(() => true)");
    await delay(250);
  };
  const click = async (selector) => {
    await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing click target');el.scrollIntoView({block:'center'});el.click();return true;})()`);
  };
  const fill = async (selector, value) => {
    await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select();})()`);
    await send("Input.insertText", { text: value });
    await delay(120);
  };
  const activeToasts = "[...document.querySelectorAll('[data-sonner-toast][data-removed=false]')]";
  const toastMatches = (title) => `${activeToasts}.filter(el=>el.querySelector('[data-title]')?.textContent===${JSON.stringify(title)})`;
  const waitToast = async (title, type) => {
    await waitFor(`${toastMatches(title)}.length===1`, "Toast: " + title);
    if (type) assert.equal(await evaluate(`${toastMatches(title)}[0].getAttribute('data-type')`), type);
  };
  const dismiss = async () => {
    await evaluate("document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(el=>el.click());true");
    await delay(420);
  };
  const control = async (settings) => {
    const response = await fetch(origin + "/__simulation/__control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    assert.equal(response.status, 200);
  };
  const selectPayment = () => evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('ABA Pay / KHQR')).click();true");
  const verify = () => evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Verify Player')).click();true");
  const checkout = () => evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Pay with ABA / KHQR')).click();true");

  await mkdir(output, { recursive: true });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://anajakpay.com/khqrcc-plugin.js*", requestStage: "Request" }] });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await control({ reset: true }); await viewport(1440);
  await navigate("/", ".game-card");
  await waitFor("document.querySelectorAll('section[aria-label^=Notifications]').length===1", "Root Sonner hydration");
  assert.equal(await evaluate("document.querySelectorAll('section[aria-label^=Notifications]').length"), 1);
  assert.equal(await evaluate(activeToasts + ".length"), 0);
  for (const path of ["/games", "/orders", "/"]) {
    await click(`.public-navbar nav a[href="${path}"]`);
    await waitFor(`location.pathname===${JSON.stringify(path)}`); await delay(300);
    assert.equal(await evaluate(activeToasts + ".length"), 0, "Navigation stays quiet");
  }
  mark("one Toaster; initial load and Home/Games/Orders navigation stay quiet");
  await click('.public-navbar nav a[href="/orders"]'); await waitFor("location.pathname==='/orders'");
  await evaluate("document.querySelector('form').requestSubmit();true"); await waitToast("Please enter an Order Number or Player ID", "error");
  await evaluate("document.querySelector('form').requestSubmit();true");
  assert.equal(await evaluate(toastMatches("Please enter an Order Number or Player ID") + ".length"), 1);
  await dismiss(); await click('.public-navbar nav a[href="/"]'); await waitFor("location.pathname==='/' && document.querySelector('.game-card')");
  await click(".public-navbar button"); await delay(200);
  assert.equal(await evaluate(activeToasts + ".length"), 0, "Opening the social toolbar stays quiet");
  const unavailableLinks = await evaluate("[...document.querySelectorAll('nav[aria-label=\"Support toolbar\"] li button[aria-label=\"Support\"]')].map(el=>el.getAttribute('aria-label'))");
  for (const label of unavailableLinks) {
    await click(`nav[aria-label="Support toolbar"] button[aria-label="${label}"]`);
    await waitToast("Link unavailable", "error");
    await click(`nav[aria-label="Support toolbar"] button[aria-label="${label}"]`);
    assert.equal(await evaluate(toastMatches("Link unavailable") + ".length"), 1, "Unavailable links reuse one toast");
    assert.equal(await evaluate("location.pathname"), "/", "Unavailable links never navigate");
    await dismiss();
  }
  const configuredLinks = await evaluate("[...document.querySelectorAll('nav[aria-label=\"Support toolbar\"] li a')].map(el=>({href:el.href,target:el.target,rel:el.rel}))");
  for (const link of configuredLinks) {
    assert.ok(["http:", "https:"].includes(new URL(link.href).protocol));
    assert.equal(link.target, "_blank");
    assert.ok(link.rel.includes("noopener"));
  }
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  mark("toolbar opening stays quiet; unavailable support notifies once and configured links retain normal destinations");
  await fill('input[name="gameQuery"]', "zz-no-matching-game-zz");
  assert.equal(await evaluate(activeToasts + ".length"), 0, "No keystroke toast");
  await click('form[role="search"] button[type="submit"]'); await waitToast("No games found", "info");
  assert.equal(await evaluate("document.querySelectorAll('[data-sonner-toaster]').length"), 1);
  await click('form[role="search"] button[type="submit"]');
  assert.equal(await evaluate(toastMatches("No games found") + ".length"), 1);
  await evaluate("document.querySelector('button[aria-label=\"Clear search input\"]').click();true");
  await waitFor("document.querySelectorAll('.game-card').length>5"); await dismiss();
  const game = await evaluate("(() => {const el=document.querySelector('a.game-card[href*=\"/mlbb\"]');return {name:el.title,path:el.getAttribute('href')};})()");
  await click(`a.game-card[href="${game.path}"]`);
  await waitFor("document.querySelectorAll('.package-option').length>0");
  await waitToast("Game selected", "success");
  assert.equal(await evaluate(toastMatches("Game selected") + "[0].querySelector('[data-description]').textContent"), game.name);
  mark("search only toasts submitted empty results; game selection toasts without delaying navigation");
  await dismiss();
  const beforeSelection = requests.filter((request) => request.method !== "GET").length;
  await click(".package-option"); await waitToast("Package selected", "success");
  await click(".package-option"); await waitToast("Package deselected");
  assert.equal(await evaluate(toastMatches("Package selected") + ".length"), 0);
  await click(".package-option"); await waitToast("Package selected", "success");
  await selectPayment(); await waitToast("Payment method selected", "success");
  await selectPayment();
  assert.equal(await evaluate(toastMatches("Payment method selected") + ".length"), 1, "Repeated payment selection stays deduplicated");
  assert.equal(requests.filter((request) => request.method !== "GET").length, beforeSelection, "Selections never create API requests");
  mark("package selection/deselection replaces one toast; payment selection creates no order or API request");
  await dismiss();
  for (const width of [320,360,375,390,430,1440]) {
    await viewport(width); await evaluate("window.scrollTo(0,0);true");
    await evaluate("document.querySelector('.package-option').click();true"); await delay(450);
    const layout = await evaluate("(() => {const el=[...document.querySelectorAll('[data-sonner-toast][data-removed=false]')].find(el=>el.getAttribute('data-front')==='true'),r=el.getBoundingClientRect(),header=document.querySelector('.public-navbar > div').getBoundingClientRect(),button=document.querySelector('.public-navbar button'),b=button.getBoundingClientRect();return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,headerBottom:header.bottom,close:!!el.querySelector('[data-close-button]'),overflow:[...el.querySelectorAll('[data-title],[data-description]')].some(text=>text.scrollWidth>text.clientWidth+1),clickable:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.public-navbar')!==null};})()");
    assert.ok(layout.pageWidth<=width && layout.left>=0 && layout.right<=width && layout.top>=layout.headerBottom+4 && layout.close && !layout.overflow && layout.clickable, JSON.stringify(layout));
    if ([320,390,1440].includes(width)) {
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: 260, scale: 1 } });
      await writeFile(`${output}/toast-${width}.png`, Buffer.from(shot.data, "base64"));
    }
    await dismiss();
  }
  mark("toasts fit 320, 360, 375, 390, 430, and 1440px; navbar controls stay clear and clickable");
  await viewport(390);
  await fill("#player-id", "12345678");
  if (await evaluate("!!document.querySelector('#server-id')")) await fill("#server-id", "1234");
  await control({ verification: "success", delay: 900 });
  await verify(); await waitToast("Checking Player ID...", "loading");
  await evaluate("window.__loadingToast=document.querySelector('[data-sonner-toast][data-type=loading]');true");
  await waitToast("Player verified", "success");
  assert.equal(await evaluate("window.__loadingToast===" + toastMatches("Player verified") + "[0]"), true, "Loading replaced in place");
  assert.equal(await evaluate("document.querySelectorAll('[data-sonner-toast][data-type=loading]').length"), 0);
  await control({ verification: "invalid" }); await verify(); await waitToast("Player not found", "error");
  assert.equal(await evaluate("document.body.textContent.includes('TEST_INTERNAL_SECRET_DO_NOT_SHOW')"), false);
  await control({ verification: "unavailable" }); await verify(); await waitToast("Verification temporarily unavailable", "warning");
  await control({ verification: "html-error" }); await verify(); await waitToast("Verification temporarily unavailable", "warning");
  await control({ verification: "success", delay: 1000 }); await verify(); await waitToast("Checking Player ID...", "loading");
  await fill("#player-id", "87654321"); await delay(1100);
  assert.equal(await evaluate(toastMatches("Player verified") + ".length"), 0, "Stale verification stays dismissed");
  await verify(); await waitToast("Player verified", "success"); await dismiss();
  mark("verification loading becomes success/error/warning in place; stale responses and raw internal errors stay hidden");
  if (!await evaluate("!!document.querySelector('.package-option[aria-pressed=true]')")) await click(".package-option");
  if (!await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('ABA Pay / KHQR')).getAttribute('aria-pressed')==='true'")) await selectPayment();
  await control({ checkout: "json-error", delay: 900 }); await checkout(); await waitToast("Preparing secure checkout...", "loading");
  await evaluate("window.__checkoutToast=document.querySelector('[data-sonner-toast][data-type=loading]');true");
  await waitToast("Unable to start payment", "error");
  assert.equal(await evaluate("window.__checkoutToast===" + toastMatches("Unable to start payment") + "[0]"), true);
  assert.equal(await evaluate("document.body.textContent.includes('TEST_INTERNAL_SECRET_DO_NOT_SHOW')"), false);
  await control({ checkout: "html-error" }); await checkout(); await waitToast("Preparing secure checkout...", "loading"); await waitToast("Unable to start payment", "error");
  await control({ checkout: "success" }); await checkout(); await waitToast("Preparing secure checkout...", "loading");
  await waitToast("Order created successfully", "success"); await waitToast("Checkout ready", "success");
  assert.equal(await evaluate("document.querySelectorAll('[data-sonner-toast][data-type=loading]').length"), 0);
  mark("checkout JSON/HTML errors replace loading safely; successful simulated order creation and checkout readiness both notify");
  await control({ paid: true }); await click("#simulation-confirm-payment");
  await waitToast("Payment verified", "success");
  await waitFor("document.querySelector('button[aria-label=\"Copy order number\"]')");
  await click('button[aria-label="Copy order number"]'); await waitToast("Copied to clipboard", "success");
  const state = await (await fetch(origin + "/__simulation/__state")).json();
  assert.equal(state.orders.length, 1, "Only the intended simulated order was created");
  const order = state.orders[0];
  await navigate("/orders/" + order.orderNumber, 'button[title="Copy Order ID"]');
  await click('button[title="Copy Order ID"]'); await waitToast("Copied to clipboard", "success");
  await click('button[aria-label="Copy transaction ID"]'); await waitToast("Copied to clipboard", "success");
  assert.equal(await evaluate("navigator.clipboard.readText()"), order.transactionId);
  await navigate("/payment/success?orderNumber=" + order.orderNumber, 'button[title="Copy Order ID"]');
  await click('button[title="Copy Order ID"]'); await waitToast("Copied to clipboard", "success");
  mark("simulated payment confirmation and clipboard success use existing order controls");
  await control({ paid: false, checkout: "json-error" });
  await navigate("/checkout", ".public-navbar");
  await checkout(); await waitToast("Preparing secure checkout...", "loading"); await waitToast("Unable to start payment", "error");
  await control({ checkout: "success" }); await checkout();
  await waitToast("Order created successfully", "success"); await waitToast("Checkout ready", "success");
  mark("standalone checkout uses the same loading, order-created, ready, and safe-error notifications");
  const finalState = await (await fetch(origin + "/__simulation/__state")).json();
  assert.equal(finalState.orders.length, 2);
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  await writeFile(`${output}/results.json`, JSON.stringify({ startedAt, checks, requests, simulatedOrders: finalState.orders.length, errors }, null, 2));
  console.log("Completed public Sonner verification against local Postman fixtures.");
} finally {
  ws?.close();
  chrome.kill();
}
