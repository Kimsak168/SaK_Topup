import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The existing preview proxy sends API mutations to the local Postman simulation.
const origin = "http://127.0.0.1:3011";
const output = "artifacts/storefront-redesign";
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
const checks = [], layouts = [], requests = [], errors = [], selectionTimes = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const control = async (settings) => {
  const response = await fetch(origin + "/__simulation/__control", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
  });
  assert.equal(response.status, 200, "The local Postman simulation is available");
  return response.json();
};
await control({ reset: true });
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "saksuuu-storefront-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9367", "--user-data-dir=" + profile, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 100 && !target; attempt++) {
    try { target = (await (await fetch("http://127.0.0.1:9367/json/list")).json()).find((page) => page.type === "page"); } catch { /* Chrome startup. */ }
    if (!target) await delay(100);
  }
  assert.ok(target, "Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const task = pending.get(data.id); pending.delete(data.id);
      if (data.error) task?.reject(new Error(JSON.stringify(data.error)));
      else task?.resolve(data.result);
    }
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails);
    if (data.method === "Network.requestWillBeSent") {
      const { url, method } = data.params.request;
      if (new URL(url).pathname.startsWith("/api/")) requests.push({ path: new URL(url).pathname, method });
    }
    if (data.method === "Fetch.requestPaused") {
      void send("Fetch.continueRequest", { requestId: data.params.requestId, url: origin + "/khqrcc-plugin.js" });
    }
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate("Boolean(" + expression + ")")) return;
      await delay(100);
    }
    throw new Error("Timed out: " + expression);
  };
  const viewport = async (width) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await delay(300);
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
  };
  const navigate = async (path, ready) => {
    await send("Page.navigate", { url: origin + path });
    await waitFor(ready);
    await waitFor("document.readyState==='complete'");
    await evaluate("document.fonts.ready.then(()=>true)");
    await delay(400);
  };
  const screenshot = async (name) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(output + "/" + name + ".png", Buffer.from(shot.data, "base64"));
  };
  const click = async (selector) => evaluate("(() => {const el=document.querySelector(" + JSON.stringify(selector) + ");el.scrollIntoView({block:'center',behavior:'instant'});el.click();return true;})()");
  const fill = async (selector, value) => {
    await evaluate("document.querySelector(" + JSON.stringify(selector) + ").focus()");
    await send("Input.insertText", { text: value });
    await delay(100);
  };
  const mark = (description) => { checks.push(description); console.log("PASS: " + description); };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://anajakpay.com/khqrcc-plugin.js*" }] });
  for (const path of ["/", "/games"]) {
    await viewport(1440);
    await navigate(path, "document.querySelectorAll('#game-results a.game-card').length>5");
    await waitFor("document.querySelector('#game-results .storefront-grid')");
    const beforeResizing = requests.length;
    for (const width of widths) {
      await viewport(width);
      await evaluate("window.scrollTo({top:0,behavior:'instant'})");
      const layout = await evaluate("(() => {const grid=document.querySelector('#game-results .storefront-grid');const cards=[...grid.children];const nav=document.querySelector('.public-navbar > div');const nr=nav.getBoundingClientRect();const links=[...document.querySelectorAll('.public-navbar nav a')].map(el=>el.getBoundingClientRect());const input=document.querySelector('[name=gameQuery]'),ir=input.getBoundingClientRect(),button=document.querySelector('.storefront-search-submit').getBoundingClientRect();const frame=document.querySelector('[aria-label=Promotions] .aspect-video')?.getBoundingClientRect();return {path:location.pathname,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,navHeight:nr.height,navOneRow:links.every(r=>r.top>=nr.top&&r.bottom<=nr.bottom)&&links.every((r,i)=>i===0||r.left>=links[i-1].right),searchHeight:ir.height,searchInline:Math.abs(ir.top-button.top)<1,inputFont:getComputedStyle(input).fontSize,tickerHeight:document.querySelector('.ticker-wrapper').getBoundingClientRect().height,cardHeights:cards.map(el=>el.getBoundingClientRect().height),imageFit:getComputedStyle(cards[0].querySelector('img')).objectFit,titleBackground:getComputedStyle(cards[0].querySelector('.game-card-title')).backgroundColor,cardExtras:cards.some(el=>el.querySelector('button,svg,p')),banner:frame?{width:frame.width,height:frame.height}:null};})()");
      assert.equal(layout.overflow, false, JSON.stringify(layout));
      assert.equal(layout.columns, width < 340 ? 2 : width < 768 ? 3 : width < 1024 ? 4 : 5);
      if (!layout.navOneRow || layout.navHeight < 64 || layout.navHeight > 72) await screenshot("navbar-diagnostic-" + width);
      assert.ok(layout.navOneRow && layout.navHeight >= 64 && layout.navHeight <= 72, JSON.stringify(layout));
      assert.equal(layout.searchHeight, 44);
      assert.ok(layout.searchInline);
      assert.ok(layout.tickerHeight >= 36 && layout.tickerHeight <= 40);
      assert.ok(Math.max(...layout.cardHeights) - Math.min(...layout.cardHeights) <= 1);
      assert.equal(layout.imageFit, "cover");
      assert.equal(layout.titleBackground, "rgb(255, 255, 255)");
      assert.equal(layout.cardExtras, false);
      if (layout.banner) {
        assert.ok(layout.banner.width <= 1100);
        assert.ok(Math.abs(layout.banner.width / layout.banner.height - 16 / 9) < .01);
      }
      layouts.push(layout);
      if ([320, 390, 1440].includes(width)) await screenshot((path === "/" ? "home" : "catalogue") + "-" + width);
    }
    assert.equal(requests.length, beforeResizing, "Responsive layout never refetches the catalogue");
  }
  mark("Home and catalogue fit 320/360/375/390/430/768/1024/1440px; compact one-row navbar, search, ticker and equal-height game grids");
  await viewport(390);
  const count = await evaluate("document.querySelectorAll('.game-card').length");
  await fill("[name=gameQuery]", "Free Fire");
  await waitFor("document.querySelectorAll('.game-card').length>0 && document.querySelectorAll('.game-card').length<" + count);
  await click('[aria-label="Clear search input"]');
  await waitFor("document.querySelectorAll('.game-card').length===" + count);
  assert.equal(await evaluate("document.querySelectorAll('.falling-flowers-background').length"), 0);
  const gamePath = await evaluate("document.querySelector('a.game-card[href*=mlbb]').getAttribute('href')");
  mark("Search and clear filter locally; decorative falling particles removed");
  await click('a.game-card[href="' + gamePath + '"]');
  await waitFor("document.querySelectorAll('.package-option').length>0");
  await delay(600);
  const beforeSelection = requests.length;
  assert.equal(await evaluate("document.querySelectorAll('.package-option[aria-pressed=true]').length"), 0);
  for (const width of widths) {
    await viewport(width);
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    const layout = await evaluate("(() => {const options=[...document.querySelectorAll('.package-option')],grid=options[0].parentElement;return {path:location.pathname,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,packageColumns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,heights:[...grid.children].map(el=>el.getBoundingClientRect().height),steps:[...document.querySelectorAll('[data-topup-step]')].map(el=>el.dataset.topupStep),paymentMethods:document.querySelectorAll('[data-topup-step=\"3\"] button[aria-pressed]').length,abaSource:document.querySelector('img[alt=\"ABA Bank\"]').getAttribute('src'),abaFilter:getComputedStyle(document.querySelector('img[alt=\"ABA Bank\"]')).filter};})()");
    assert.equal(layout.overflow, false, JSON.stringify(layout));
    assert.equal(layout.packageColumns, width < 360 ? 2 : 3);
    assert.deepEqual(layout.steps, ["1", "2", "3"]);
    assert.equal(layout.paymentMethods, 1);
    assert.ok(layout.abaSource.includes("aba-logo.png"));
    assert.equal(layout.abaFilter, "none");
    assert.ok(Math.max(...layout.heights) - Math.min(...layout.heights) <= 1);
    layouts.push(layout);
    if ([320, 390, 1440].includes(width)) await screenshot("game-" + width);
  }
  for (let index = 0; index < 5; index++) {
    const selected = await evaluate("(async () => {const el=document.querySelectorAll('.package-option')[" + index + "],start=performance.now();el.click();await new Promise(requestAnimationFrame);return {ms:performance.now()-start,selected:el.getAttribute('aria-pressed'),count:document.querySelectorAll('.package-option[aria-pressed=true]').length};})()");
    assert.equal(selected.selected, "true");
    assert.equal(selected.count, 1);
    selectionTimes.push(selected.ms);
  }
  assert.equal(requests.length, beforeSelection, "Package selection and viewport changes make no API request");
  mark("Three compact steps, 2 package columns at 320px and 3 from 360px; instant exclusive package selection with zero API requests; original ABA artwork");
  await viewport(390);
  const verify = '[data-topup-step="1"] button:not([aria-expanded])';
  const payment = '[data-topup-step="3"] button[aria-pressed]';
  const checkout = ".topup-summary button";
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(checkout) + ").disabled"), true);
  await fill("#player-id", "12345678");
  if (await evaluate("!!document.querySelector('#server-id')")) await fill("#server-id", "1234");
  await click(verify);
  await waitFor("document.body.textContent.includes('Verified: Toast Test Player')");
  await click(payment);
  await waitFor("document.querySelector(" + JSON.stringify(checkout) + ").disabled===false");
  await click(checkout);
  await waitFor("document.querySelector('#simulation-confirm-payment')");
  await control({ paid: true });
  await click("#simulation-confirm-payment");
  await waitFor("document.body.textContent.includes('Top-Up Dispatched!')");
  const state = await (await fetch(origin + "/__simulation/__state")).json();
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].playerId, "12345678");
  assert.ok(state.orders[0].supplierProductCode);
  mark("Real frontend completes player verification, package/payment selection, order creation and payment confirmation against existing Postman fixtures");
  await send("Page.navigate", { url: origin + "/" });
  await waitFor("document.querySelectorAll('.game-card').length>5");
  await viewport(1440);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  const initialTicker = await evaluate("getComputedStyle(document.querySelector('.ticker-track')).transform");
  await delay(300);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.ticker-track')).transform"), initialTicker);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.ticker-track')).animationName"), "none");
  mark("Ticker continuously animates and honors reduced motion");
  assert.deepEqual(errors, []);
  await writeFile(output + "/verification.json", JSON.stringify({ checks, layouts, requests, selectionTimes, simulatedOrders: state.orders.length, errors }, null, 2));
} catch (error) {
  await writeFile(output + "/verification.json", JSON.stringify({ checks, layouts, requests, selectionTimes, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  ws?.close();
  chrome.kill();
}
