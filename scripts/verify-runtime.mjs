// Read-only production smoke checks. Never creates payments, orders, or supplier requests.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3100";
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.ok(process.env.AUTH_SECRET, "AUTH_SECRET is needed to inspect the local admin pages");
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const message = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ username: "runtime-smoke", role: "Super Admin", name: "Runtime smoke check", iat: now, exp: now + 600 })}`;
const token = `${message}.${createHmac("sha256", process.env.AUTH_SECRET).update(message).digest("base64url")}`;
const headers = { Authorization: `Bearer ${token}` };

for (const route of ["games", "packages", "orders", "payments"]) {
  const response = await fetch(`${base}/api/admin/${route}?page=invalid&limit=NaN&search=%5B`, { headers });
  assert.equal(response.status, 200, route);
  const data = await response.json();
  assert.equal(data.success, true, route);
  assert.ok(Number.isFinite(data.pagination.page) && Number.isFinite(data.pagination.limit), route);
}
for (const route of ["/api/orders", "/api/payment/anajakpay/create", "/api/payment/anajakpay/check"]) {
  const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  assert.equal(response.status, 400, route);
}
const contact = await fetch(base + "/contact", { redirect: "manual" });
const contactTarget = contact.headers.get("location") ||
  (await contact.text()).match(/id="__next-page-redirect"[^>]*content="\d;url=([^"]+)"/)?.[1];
assert.ok([200, 307, 308].includes(contact.status), "Contact redirect status");
assert.match(contactTarget || "", /^https?:\/\//, "Contact redirect target");
for (const route of ["/game/freefire_sgmy", "/games/g2bulk/freefire_sgmy"]) {
  const response = await fetch(base + route, { redirect: "manual" });
  assert.equal(response.status, 307, route);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/games/webbuilder/freefire_sgmy", route);
}

const port = 9364;
const profile = await mkdtemp(join(tmpdir(), "saksuuu-runtime-"));
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === "page"); } catch {}
    if (!target) await delay(100);
  }
  assert.ok(target, "Headless Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  ws.addEventListener("message", event => {
    const entry = JSON.parse(event.data);
    if (entry.id) {
      const task = pending.get(entry.id);
      if (task) {
        clearTimeout(task.timer);
        pending.delete(entry.id);
        if (entry.error) task.reject(new Error(entry.error.message)); else task.resolve(entry.result);
      }
    }
    if (entry.method === "Runtime.exceptionThrown") errors.push(entry.params.exceptionDetails.exception?.description || entry.params.exceptionDetails.text);
    if (entry.method === "Runtime.consoleAPICalled" && entry.params.type === "error") errors.push(entry.params.args.map(arg => arg.value || arg.description).join(" "));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  const routes = ["/", "/games", "/orders", "/checkout", "/payment/success", "/payment/cancel", "/admin/login"];
  const results = [];
  for (const width of [1440, 390]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
    for (const path of routes) {
      await send("Page.navigate", { url: base + path });
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && document.body.innerText.length > 40`)) break;
        await delay(100);
      }
      await delay(200);
      const state = await evaluate("({ path: location.pathname, overflow: document.documentElement.scrollWidth > innerWidth + 1, rendered: !!document.querySelector('h1, h2') })");
      assert.equal(state.path, path);
      assert.equal(state.overflow, false, `${path} at ${width}px overflows`);
      assert.equal(state.rendered, true, path);
      results.push({ path, width });
    }
  }
  await send("Network.setCookie", { name: "saksuuu_admin_token", value: token, url: base });
  for (const path of ["/admin", "/admin/games", "/admin/packages", "/admin/orders", "/admin/payments", "/admin/banners", "/admin/suppliers", "/admin/settings"]) {
    await send("Page.navigate", { url: base + path });
    let rendered = false;
    for (let i = 0; i < 100; i++) {
      rendered = await evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('h1') && !document.querySelector('.admin-skeleton')`);
      if (rendered) break;
      await delay(100);
    }
    assert.equal(rendered, true, path);
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false, path);
    results.push({ path, width: 390 });
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(JSON.stringify({ browserChecks: results.length, apiChecks: 10, browserErrors: errors, results }, null, 2));
  await send("Browser.close").catch(() => {});
} finally {
  ws?.close();
  chrome.kill();
}
