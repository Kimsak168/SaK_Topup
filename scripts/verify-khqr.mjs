// Runs the real local storefront against the Postman checkout simulation.
// All mutable browser API calls are intercepted before they reach the app.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.argv[2] || "http://127.0.0.1:3116";
const simulation = process.argv[3] || "http://127.0.0.1:4916/checkout";
for (const value of [origin, simulation]) assert.match(value, /^http:\/\/(localhost|127\.0\.0\.1):\d+(\/checkout)?$/);
const output = ".local-backups/khqr";
const port = 9356;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "khqr-ui-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const checks = [];
const errors = [];
const mutations = [];
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === "page"); } catch {}
    if (target) break;
    await delay(100);
  }
  assert.ok(target, "Chrome starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const command = ++id;
    const timer = setTimeout(() => { pending.delete(command); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(command, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id: command, method, params }));
  });
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error)));
      else task?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    if (message.method === "Fetch.requestPaused") {
      const { request, requestId } = message.params;
      if (request.method === "GET" || request.method === "HEAD") { void send("Fetch.continueRequest", { requestId }); return; }
      const path = new URL(request.url).pathname;
      mutations.push({ path, intercepted: true });
      void (async () => {
        const allowed = ["/api/player/verify", "/api/payment/vngzz2/create", "/api/payment/vngzz2/check"].includes(path);
        if (!allowed) throw new Error(`Unexpected mutable request: ${path}`);
        const response = await fetch(simulation + path, { method: request.method, headers: { "Content-Type": "application/json" }, body: request.postData });
        await send("Fetch.fulfillRequest", { requestId, responseCode: response.status, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(await response.text()).toString("base64") });
      })().catch(async error => {
        // Closing the dialog aborts an in-flight check. Chrome then retires
        // that interception ID before the simulated slow response arrives.
        if (String(error).includes("Invalid InterceptionId")) return;
        errors.push(String(error));
        await send("Fetch.fulfillRequest", { requestId, responseCode: 502, body: Buffer.from('{"success":false}').toString("base64") }).catch(() => {});
      });
    }
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 200; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  const control = async config => {
    const response = await fetch(simulation + "/__control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    assert.equal(response.status, 200);
    const actual = await response.json();
    for (const [key, value] of Object.entries(config)) assert.equal(actual[key], value, `Simulation control: ${key}`);
  };
  const mark = description => { checks.push(description); console.log("PASS " + description); };
  const viewport = async (width, height = 900) => { await send("Emulation.setDeviceMetricsOverride", { width, height, mobile: width < 640, deviceScaleFactor: 1 }); };
  const shot = async name => { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(join(output, name + ".png"), Buffer.from(result.data, "base64")); };
  const close = async () => { await evaluate('document.querySelector("dialog button").click()'); await waitFor('!document.querySelector("dialog[open]")'); };
  const open = async () => {
    await evaluate('document.querySelector(".topup-desktop-checkout").click()');
    await waitFor('document.querySelector("dialog[open]")');
  };

  await mkdir(output, { recursive: true });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/*", requestStage: "Request" }] });
  await viewport(1440);
  await control({ status: "PENDING", expireInSec: 180, qrMode: "string", checkHttpStatus: 200, delayMs: 0 });
  await send("Page.navigate", { url: origin + "/games/webbuilder/hok" });
  await waitFor('document.querySelector(".package-option") && Object.keys(document.querySelector("#player-id")||{}).some(k=>k.startsWith("__reactProps"))');
  for (const selector of ["#player-id", "#server-id"]) {
    if (!await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) continue;
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await send("Input.insertText", { text: "12345678" });
  }
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Verify Player")).click()');
  await waitFor('document.body.textContent.includes("Verified: Preview Player")');
  await evaluate('document.querySelector(".package-option").click()');
  await waitFor('!document.querySelector(".topup-desktop-checkout").disabled');
  await evaluate('window.__qr=()=>[...document.querySelectorAll("dialog img")].find(i=>i.alt.startsWith("Payment QR"))');
  await open();
  await waitFor('window.__qr()?.complete');
  const style = await evaluate('(() => {const d=document.querySelector("dialog"),qr=window.__qr(),logo=d.querySelector("img[alt=KHQR]");return {modal:d.matches(":modal"),logo:logo.complete&&logo.naturalWidth>0,merchant:d.textContent.includes("ASURA STORE QA"),qrWidth:qr.getBoundingClientRect().width,qrBackground:getComputedStyle(qr.parentElement).backgroundColor,merchantColor:getComputedStyle([...d.querySelectorAll("p")].find(p=>p.textContent==="ASURA STORE QA")).color,qrChildren:qr.parentElement.children.length};})()');
  assert.equal(style.modal, true); assert.equal(style.logo, true); assert.equal(style.merchant, true);
  assert.equal(style.qrBackground, "rgb(255, 255, 255)"); assert.equal(style.merchantColor, "rgb(23, 23, 23)"); assert.equal(style.qrChildren, 1);
  await shot("khqr-desktop");
  mark("Official logo, actual payload merchant name, neutral card and unobstructed QR render");
  for (const width of [390, 320]) {
    await viewport(width);
    const overflow = await evaluate('(() => {const d=document.querySelector("dialog"),q=window.__qr().getBoundingClientRect();return {dialog:d.scrollWidth<=innerWidth,qr:q.left>=0&&q.right<=innerWidth};})()');
    assert.equal(overflow.dialog, true); assert.equal(overflow.qr, true);
    await shot("khqr-" + width);
  }
  await viewport(700, 440);
  assert.equal(await evaluate('document.querySelector("dialog").scrollHeight>document.querySelector("dialog").clientHeight'), true);
  mark("QR fits 320px and 390px screens; short screens scroll");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor('!document.querySelector("dialog[open]")');
  assert.notEqual(await evaluate("document.body.style.overflow"), "hidden");
  mark("Escape closes the dialog and restores page scrolling");

  await viewport(390);
  await control({ delayMs: 3000 });
  await open(); await delay(7600);
  const state = await (await fetch(simulation + "/__state")).json();
  assert.equal(state.maxActiveChecks, 1);
  await close();
  const checksAtClose = (await (await fetch(simulation + "/__state")).json()).requests.filter(r => r.path.endsWith("/check")).length;
  await delay(2200);
  assert.equal((await (await fetch(simulation + "/__state")).json()).requests.filter(r => r.path.endsWith("/check")).length, checksAtClose);
  mark("Slow status requests never overlap; closing stops polling");

  await control({ delayMs: 0, checkHttpStatus: 503 });
  await open(); await delay(2400);
  assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("Waiting for payment")'), true);
  mark("A status-service error keeps the payment pending");
  await close();
  await control({ checkHttpStatus: 200, expireInSec: 180 });
  await open();
  await evaluate('window.__originalNow=Date.now;Date.now=()=>window.__originalNow()+181000');
  await waitFor('document.querySelector("dialog").textContent.includes("QR code expired")');
  assert.equal(await evaluate('!!window.__qr()'), false);
  await shot("khqr-expired");
  await evaluate('Date.now=window.__originalNow');
  await evaluate('[...document.querySelectorAll("dialog button")].find(b=>b.textContent.includes("Get a new QR code")).click()');
  await waitFor('window.__qr()');
  mark("Expiry follows wall-clock time, removes the QR and can generate a fresh code");
  await close();
  await control({ qrMode: "missing" });
  await open(); await waitFor('document.querySelector("dialog").textContent.includes("QR code unavailable")');
  mark("Missing QR data shows a recovery state");
  await close();
  await control({ qrMode: "image", status: "FAILED" });
  await open(); await waitFor('window.__qr()');
  await waitFor('document.querySelector("dialog").textContent.includes("Payment unsuccessful")');
  mark("Provider image fallback renders; failed payment removes the code");
  await close();
  await control({ qrMode: "string", status: "PAID" });
  await open(); await waitFor('document.querySelector("dialog").textContent.includes("Payment received")');
  await shot("khqr-paid");
  await waitFor('!document.querySelector("dialog[open]")');
  mark("Verified paid response shows confirmation and completes the parent checkout");
  assert.deepEqual(errors, []);
  const report = { checks, errors, mutations, limitations: "UI runs against local simulated API responses. No real bank payment, settlement or provider QR validity was tested." };
  await writeFile(join(output, "verification.json"), JSON.stringify(report, null, 2));
} finally {
  ws?.close(); chrome.kill();
}
