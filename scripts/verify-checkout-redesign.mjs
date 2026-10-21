import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run against the real storefront with all mutable payment APIs routed to the
// repository-owned Postman simulation through the local preview proxy.
const origin = process.env.CHECKOUT_PREVIEW_ORIGIN || "http://localhost:3000";
const simulationOrigin = process.env.CHECKOUT_SIMULATION_ORIGIN || "http://127.0.0.1:4900/storefront";
const output = "artifacts/public-checkout";
const debugPort = Number(process.env.CHECKOUT_CHROME_DEBUG_PORT || 9391);
const chromeFlags = (process.env.CHECKOUT_CHROME_FLAGS || "").split(/\s+/).filter(Boolean);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "saksuuu-checkout-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, ...chromeFlags, "about:blank",
], { windowsHide: true, stdio: "ignore" });

let ws;
const checks = [];
try {
  let target;
  for (let attempt = 0; attempt < 80 && !target; attempt++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === "page");
    } catch { /* Chrome is starting. */ }
    if (!target) await delay(100);
  }
  assert.ok(target, "Headless Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(commandId);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 10000);
    pending.set(commandId, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    ws.send(JSON.stringify({ id: commandId, method, params }));
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
      const request = message.params.request;
      const url = new URL(request.url);
      const isSdk = url.hostname === "anajakpay.com" && url.pathname === "/khqrcc-plugin.js";
      const isCheckoutApi = url.origin === origin && [
        "/api/player/verify",
        "/api/payment/anajakpay/create",
        "/api/payment/anajakpay/check",
      ].includes(url.pathname);
      if (!isSdk && !isCheckoutApi) {
        void send("Fetch.continueRequest", { requestId: message.params.requestId });
        return;
      }
      void (async () => {
        try {
          const fixturePath = isSdk ? "/khqrcc-plugin.js" : url.pathname + url.search;
          const response = await fetch(simulationOrigin + fixturePath, {
            method: isSdk ? "GET" : request.method,
            headers: request.headers?.["content-type"] ? { "content-type": request.headers["content-type"] } : undefined,
            body: isSdk || request.method === "GET" ? undefined : request.postData,
          });
          const body = Buffer.from(await response.arrayBuffer()).toString("base64");
          await send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: response.status,
            responseHeaders: [{ name: "Content-Type", value: response.headers.get("content-type") || (isSdk ? "application/javascript" : "application/json") }],
            body,
          });
        } catch {
          await send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 502,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body: Buffer.from(JSON.stringify({ success: false, error: "Local payment simulation unavailable" })).toString("base64"),
          });
        }
      })();
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
    throw new Error("Timed out: " + message);
  };
  const mark = (description) => { checks.push(description); console.log("PASS: " + description); };
  const viewport = async (width) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 640 });
    await delay(180);
  };
  const click = async (selector) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing click target: '+${JSON.stringify(selector)});el.scrollIntoView({block:'center'});el.click();return true;})()`);
  const fill = async (selector, value) => {
    await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing input: '+${JSON.stringify(selector)});el.focus();el.select();})()`);
    await send("Input.insertText", { text: value });
    await delay(100);
  };
  const activeToasts = "[...document.querySelectorAll('[data-sonner-toast][data-removed=false]')]";
  const toastMatches = (title) => `${activeToasts}.filter(el=>el.querySelector('[data-title]')?.textContent===${JSON.stringify(title)})`;
  const waitToast = async (title, type) => {
    await waitFor(`${toastMatches(title)}.length===1`, "Toast: " + title);
    if (type) assert.equal(await evaluate(`${toastMatches(title)}[0].getAttribute('data-type')`), type);
  };
  const dismissToasts = async () => {
    await evaluate("document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(el=>el.click());true");
    await delay(350);
  };
  const control = async (settings) => {
    const response = await fetch(simulationOrigin + "/__control", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    assert.equal(response.status, 200);
  };
  const clickVerify = () => evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Verify Player')).click();true");
  const confirmPayment = () => evaluate("[...document.querySelectorAll('[role=dialog] button')].find(el=>el.textContent.includes('Pay Now')).click();true");

  await mkdir(output, { recursive: true });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Fetch.enable", { patterns: [
    { urlPattern: "https://anajakpay.com/khqrcc-plugin.js*", requestStage: "Request" },
    { urlPattern: origin + "/api/*", requestStage: "Request" },
  ] });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await control({ reset: true });
  await viewport(1440);
  await send("Page.navigate", { url: origin + "/" });
  await waitFor("document.querySelector('.game-card')", "Storefront game cards");
  await send("Page.navigate", { url: origin + "/games" });
  await waitFor("document.querySelector('a.game-card[href*=\\\"/mlbb\\\"]')", "Game catalogue");
  const gamePath = await evaluate("document.querySelector('a.game-card[href*=\\\"/mlbb\\\"]').getAttribute('href')");
  await send("Page.navigate", { url: origin + gamePath });
  await waitFor("document.querySelector('.package-option')", "Game package options");
  await waitFor("Object.keys(document.querySelector('#player-id')||{}).some(key=>key.startsWith('__reactProps'))", "Checkout form hydration");

  const responsiveWidths = [320, 360, 375, 390, 430, 768, 1024, 1440];
  for (const width of responsiveWidths) {
    await viewport(width);
    const layout = await evaluate("(() => {const header=document.querySelector('.public-navbar'),menu=header.querySelector('button[aria-label=\\\"Open navigation menu\\\"]'),nav=header.querySelector('nav[aria-label=\\\"Primary navigation\\\"]'),bar=document.querySelector('.topup-mobile-payment-bar');return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,menuVisible:menu.getBoundingClientRect().width>0,navVisible:getComputedStyle(nav).display!=='none',barVisible:getComputedStyle(bar).display!=='none',barDisabled:bar.querySelector('button').disabled,barAmount:bar.textContent.includes('$0.00')};})()");
    assert.ok(layout.pageWidth <= width, "Navbar has no horizontal overflow: " + JSON.stringify(layout));
    if (width < 768) {
      assert.equal(layout.menuVisible, true, "Mobile hamburger is visible at " + width);
      assert.equal(layout.navVisible, false, "Desktop links are hidden at " + width);
      assert.equal(layout.barVisible, true, "Mobile checkout bar is visible at " + width);
      assert.equal(layout.barDisabled, true, "Buy Now is disabled until checkout details are ready at " + width);
      assert.equal(layout.barAmount, true, "Empty checkout total is shown as $0.00 at " + width);
      await click("button[aria-label='Open navigation menu']");
      await waitFor("document.querySelector('[role=dialog][aria-label=\\\"Mobile navigation\\\"]')", "Mobile navigation drawer");
      const drawer = await evaluate("(() => {const el=document.querySelector('[role=dialog][aria-label=\\\"Mobile navigation\\\"]'),r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,bodyLocked:document.body.style.overflow==='hidden',pageWidth:document.documentElement.scrollWidth};})()");
      assert.ok(drawer.width >= 76 && drawer.width <= 88 && drawer.left >= width - 90 && drawer.right <= width && drawer.height <= 1000 && drawer.bodyLocked && drawer.pageWidth <= width, JSON.stringify(drawer));
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
      await waitFor("!document.querySelector('[role=dialog][aria-label=\\\"Mobile navigation\\\"]')", "Drawer closes with Escape");
      assert.equal(await evaluate("document.body.style.overflow!=='hidden'"), true, "Drawer restores background scrolling");
    } else {
      assert.equal(layout.menuVisible, false, "Mobile hamburger is hidden at " + width);
      assert.equal(layout.navVisible, true, "Desktop navigation is preserved at " + width);
      assert.equal(layout.barVisible, false, "Fixed mobile payment bar is hidden at " + width);
    }
  }
  mark("navbar, right-side drawer, and disabled mobile payment bar fit 320, 360, 375, 390, 430, 768, 1024, and 1440px");
  await viewport(1440);

  await clickVerify();
  await waitFor("document.querySelector('#player-id-error')", "Player ID required error");
  if (await evaluate("!!document.querySelector('#server-id')")) {
    await waitFor("document.querySelector('#server-id-error')", "Server ID required error");
  }
  assert.equal(await evaluate("!!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')"), false);
  await fill("#player-id", "12345678");
  if (await evaluate("!!document.querySelector('#server-id')")) await fill("#server-id", "1234");
  await click(".package-option");
  await waitFor("document.querySelector('.package-option[aria-pressed=true]')", "Selected package");
  assert.equal(await evaluate("!!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')"), false, "Unverified details do not open checkout");
  await control({ verification: "invalid" });
  await clickVerify(); await waitToast("Player not found", "error");
  assert.equal(await evaluate("!!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')"), false, "Invalid account does not open checkout");
  mark("blank IDs show inline errors; incomplete and invalid accounts cannot open checkout");

  await dismissToasts();
  await click(".package-option[aria-pressed=true]");
  await waitToast("Package deselected");
  await dismissToasts();
  await control({ verification: "success" });
  await clickVerify(); await waitToast("Player verified", "success");
  assert.equal(await evaluate("!!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')"), false, "A verified account without a package does not open checkout");
  await click(".package-option");
  await waitFor("document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')", "Automatic confirmation modal");
  assert.equal(await evaluate("document.querySelector('#checkout-review-title').textContent.trim()"), "Confirm Your Order");
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('12345678')"), true);
  mark("valid account alone stays closed; selecting a package opens confirmation automatically");
  await dismissToasts();

  const modalLayouts = [];
  for (const width of responsiveWidths) {
    await viewport(width);
    const layout = await evaluate("(() => {const dialog=document.querySelector('[role=dialog]'),r=dialog.getBoundingClientRect();return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,left:r.left,right:r.right,bottom:r.bottom,dialogWidth:dialog.clientWidth,scrollWidth:dialog.scrollWidth,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight};})()");
    assert.ok(layout.pageWidth <= width && layout.left >= 0 && layout.right <= width && layout.bottom <= 1000 && layout.scrollWidth <= layout.dialogWidth + 1, JSON.stringify(layout));
    modalLayouts.push(layout);
    if ([320, 390, 768, 1440].includes(width)) {
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: 1000, scale: 1 } });
      await writeFile(`${output}/checkout-${width}.png`, Buffer.from(shot.data, "base64"));
    }
  }
  mark("modal stays within the viewport at 320, 360, 375, 390, 430, 768, 1024, and 1440px");
  await viewport(390);

  await click("[role=dialog] button[aria-label='Close order review']");
  await waitFor("!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')", "Canceled checkout modal");
  await delay(300);
  assert.equal(await evaluate("!!document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')"), false, "Same selection does not repeatedly reopen the canceled modal");
  await evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Review order')).click();true");
  await waitFor("document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')", "Manual review reopen");
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(el=>el.textContent.trim()==='Change').click();true");
  const changedQuantity = await evaluate("(() => {const el=[...document.querySelectorAll('.package-option')].find(el=>!el.disabled&&el.getAttribute('aria-pressed')!=='true');if(!el)throw new Error('A second package option is required');const value=el.querySelector('.line-clamp-2')?.textContent.trim();el.click();return value;})()");
  await waitFor("document.querySelector('[role=dialog][aria-labelledby=checkout-review-title]')", "Updated package modal");
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes(" + JSON.stringify(changedQuantity) + ")"), true, "Modal uses the newly selected package");
  mark("cancel does not reopen for the same selection; changing package refreshes the confirmation");

  assert.equal(await evaluate("!!document.querySelector('[role=dialog] button[aria-pressed=true]')"), true, "ABA KHQR is the selected available method");
  await dismissToasts();
  await control({ checkout: "json-error", delay: 800 });
  await confirmPayment(); await waitToast("Preparing secure checkout...", "loading"); await waitToast("Unable to start payment", "error");
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes(" + JSON.stringify("couldn't start your payment") + ")"), true);
  await dismissToasts();
  await control({ checkout: "html-error" });
  await confirmPayment(); await waitToast("Preparing secure checkout...", "loading"); await waitToast("Unable to start payment", "error");
  mark("payment choice is required; JSON and HTML checkout errors stay safely inside the modal");

  await dismissToasts();
  await control({ checkout: "success" });
  await confirmPayment(); await waitToast("Preparing secure checkout...", "loading");
  await waitToast("Order created successfully", "success"); await waitToast("Checkout ready", "success");
  await control({ paid: true });
  await click("#simulation-confirm-payment");
  await waitToast("Payment verified", "success");
  await waitFor("document.querySelector('button[aria-label=\\\"Copy order number\\\"]')", "Verified order confirmation");
  const state = await (await fetch(simulationOrigin + "/__state")).json();
  assert.equal(state.orders.length, 1, "Only one successful simulated order was created");
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, modalLayouts, requests, simulatedOrders: state.orders.length, errors }, null, 2));
  mark("successful simulated payment is marked paid only after the existing payment-status check confirms it");
  console.log("Completed checkout redesign verification against local Postman fixtures.");
} finally {
  ws?.close();
  chrome.kill();
}
