// Read-only local dashboard smoke check. Never runs against a remote site.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error("The admin UI check accepts only a local server");
const port = 9341;
const profile = await mkdtemp(join(tmpdir(), "saksuuu-admin-ui-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = encode({ alg: "HS256", typ: "JWT" });
const payload = encode({ username: "ui-smoke", role: "admin", name: "UI smoke check", iat: now, exp: now + 3600 });
const message = `${header}.${payload}`;
const key = process.env.AUTH_SECRET || process.env.ADMIN_SECRET || "saksuuu-hq-secure-admin-portal-session-2025-token-key";
const token = `${message}.${createHmac("sha256", key).update(message).digest("base64url")}`;
const pages = ["", "/games", "/packages", "/orders", "/payments", "/banners", "/suppliers", "/settings"];
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === "page");
      if (target) break;
    } catch {}
    await delay(100);
  }
  if (!target) throw new Error("Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  ws.addEventListener("message", (event) => {
    const entry = JSON.parse(event.data);
    if (entry.id) {
      const task = pending.get(entry.id);
      pending.delete(entry.id);
      if (entry.error) task.reject(entry.error);
      else task.resolve(entry.result);
    }
    if (entry.method === "Runtime.exceptionThrown") errors.push(entry.params.exceptionDetails.text);
    if (entry.method === "Network.requestWillBeSent")
      requests.push({ url: entry.params.request.url, method: entry.params.request.method });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", {
    name: "saksuuu_admin_token", value: token, url: base, httpOnly: true, sameSite: "Lax",
  });
  await mkdir("artifacts/admin-redesign", { recursive: true });
  const results = [];
  for (const width of [1440, 900, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height: width > 600 ? 960 : 844, deviceScaleFactor: 1, mobile: width <= 600,
    });
    for (const path of pages) {
      await send("Page.navigate", { url: `${base}/admin${path}` });
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await evaluate("document.readyState === 'complete' && !!document.querySelector('h1')")) break;
        await delay(150);
      }
      const ready = path === "" ? "!!document.querySelector('.admin-stat') || !!document.querySelector('.admin-error')" :
        path === "/settings" ? "!!document.querySelector('main input') || !!document.querySelector('.admin-error')" :
        path === "/suppliers" ? "!document.querySelector('.admin-skeleton')" :
        path === "/banners" ? "!!document.querySelector('main article') || !document.body.textContent.includes('Loading banners')" :
        "!!document.querySelector('main table') || !document.body.textContent.includes('Loading')";
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await evaluate(ready)) break;
        await delay(150);
      }
      await delay(250);
      const details = await evaluate(`({
        path: location.pathname, title: document.querySelector('h1')?.textContent?.trim() || '',
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        links: document.querySelectorAll('a[href^="/admin"]').length,
        tables: document.querySelectorAll('table').length,
        fields: document.querySelectorAll('main input, main select, main textarea').length,
        cards: document.querySelectorAll('.admin-stat').length,
        banners: document.querySelectorAll('main article').length,
        error: document.querySelector('[role="alert"]')?.textContent?.trim() || null,
      })`);
      results.push(details);
      if (path === "" || path === "/suppliers" || (width === 390 && ["/games", "/packages", "/orders", "/payments", "/banners", "/settings"].includes(path))) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(`artifacts/admin-redesign/${width}-${path ? path.slice(1) : "overview"}.png`, Buffer.from(shot.data, "base64"));
      }
    }
  }
  const interactions = {};
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/admin` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("!!document.querySelector('.admin-stat')")) break;
    await delay(150);
  }
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button[aria-pressed]')].find(node => node.textContent.trim() === '30d');
    button.click();
    return true;
  })()`);
  await delay(200);
  interactions.rangeFilter = await evaluate("[...document.querySelectorAll('button[aria-pressed]')].some(node => node.textContent.trim() === '30d' && node.getAttribute('aria-pressed') === 'true')");
  await evaluate("document.querySelector('button[aria-label^=Collapse]').click()");
  await delay(100);
  const collapsed = await evaluate("!!document.querySelector('button[aria-label^=Expand]')");
  await evaluate("document.querySelector('button[aria-label^=Expand]').click()");
  await delay(100);
  interactions.collapse = collapsed && await evaluate("!!document.querySelector('button[aria-label^=Collapse]')");
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 960, deviceScaleFactor: 1, mobile: false });
  await delay(100);
  interactions.tabletSidebar = await evaluate(`(() => {
    const side = document.querySelector('aside');
    const nav = side?.querySelector('nav');
    const footer = side?.querySelector('.admin-sidebar-footer');
    return side?.getBoundingClientRect().width <= 80 && nav?.getBoundingClientRect().bottom <= footer?.getBoundingClientRect().top + 1 && footer?.getBoundingClientRect().bottom <= innerHeight + 1;
  })()`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('button[aria-label^=Switch]').click()");
  await delay(100);
  interactions.themeToggle = await evaluate("!!document.querySelector('.admin-shell-light')");
  const themeShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("artifacts/admin-redesign/1440-light-overview.png", Buffer.from(themeShot.data, "base64"));
  await evaluate("document.querySelector('button[aria-label^=Switch]').click()");
  await send("Page.navigate", { url: `${base}/admin/banners` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("document.querySelectorAll('main article').length === 4")) break;
    await delay(150);
  }
  await evaluate("document.querySelector('button[aria-label^=Edit]').click()");
  await delay(100);
  const dialogOpened = await evaluate("!!document.querySelector('dialog[open]')");
  await evaluate("document.querySelector('button[aria-label^=Close]').click()");
  await delay(100);
  interactions.bannerDialog = dialogOpened && await evaluate("!document.querySelector('dialog[open]')");
  await send("Page.navigate", { url: `${base}/admin/orders` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("!!document.querySelector('button[title^=View]')")) break;
    await delay(150);
  }
  await evaluate("document.querySelector('button[title^=View]').click()");
  await delay(100);
  interactions.orderDetails = await evaluate("!!document.querySelector('main .fixed h3')");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await delay(100);
  interactions.orderDetails = interactions.orderDetails &&
    await evaluate("!document.querySelector('[role=dialog][aria-label^=Order]')");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: `${base}/admin` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("!!document.querySelector('.admin-stat') && !!document.querySelector('button[aria-label^=Open]')")) break;
    await delay(150);
  }
  await evaluate("document.querySelector('button[aria-label^=Open]').click()");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await evaluate("!!document.querySelector('[role=dialog][aria-label^=Admin]')")) break;
    await delay(100);
  }
  const drawerLinks = await evaluate("document.querySelector('[role=dialog][aria-label^=Admin] nav').querySelectorAll('a').length");
  await evaluate("document.querySelector('button[aria-label^=Close]').click()");
  await delay(100);
  interactions.mobileDrawer = drawerLinks === 8 &&
    await evaluate("!document.querySelector('[role=dialog][aria-label^=Admin]')");
  await evaluate("document.querySelector('button[aria-label^=Open]').click()");
  await delay(100);
  await evaluate("document.querySelector('[role=dialog][aria-label^=Admin] nav a[href=\"/admin/packages\"]').click()");
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("location.pathname === '/admin/packages' && !document.querySelector('[role=dialog][aria-label^=Admin]')")) break;
    await delay(150);
  }
  interactions.navigation = await evaluate("location.pathname === '/admin/packages' && !document.querySelector('[role=dialog][aria-label^=Admin]')");
  await send("Page.navigate", { url: `${base}/admin/games` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("!!document.querySelector('button[aria-label^=\"Actions for\"]')")) break;
    await delay(150);
  }
  await evaluate("document.querySelector('button[aria-label^=\"Actions for\"]').click()");
  await delay(100);
  interactions.gameActions = await evaluate("!!document.querySelector('.admin-action-menu') && document.querySelector('.admin-action-menu').textContent.includes('Edit game details')");
  await evaluate("[...document.querySelectorAll('.admin-action-menu button')].find(button => button.textContent.includes('Edit game details')).click()");
  await delay(100);
  interactions.gameActions = interactions.gameActions && await evaluate("!document.querySelector('.admin-action-menu') && !!document.querySelector('[role=dialog][aria-label=\"Edit game\"]')");
  interactions.gameForm = await evaluate("document.querySelector('[role=dialog][aria-label=\"Edit game\"] input')?.value?.length > 0 && !!document.querySelector('[role=dialog][aria-label=\"Edit game\"] textarea')");
  await evaluate("[...document.querySelectorAll('[role=dialog][aria-label=\"Edit game\"] button')].find(button => button.textContent.includes('Cancel')).click()");
  await delay(100);
  interactions.gameForm = interactions.gameForm && await evaluate("!document.querySelector('[role=dialog][aria-label=\"Edit game\"]')");
  await send("Page.navigate", { url: `${base}/admin` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("!!document.querySelector('.admin-stat')")) break;
    await delay(150);
  }
  interactions.supplierStatus = await evaluate("!document.querySelector('.admin-supplier-dot.is-connected')");
  await evaluate(`(() => {
    sessionStorage.setItem('saksuuu_supplier_check', JSON.stringify({ timestamp: new Date().toISOString(), vizo: { status: 'connected' }, g2bulk: { status: 'connected' } }));
    window.dispatchEvent(new Event('saksuuu:supplier-status'));
  })()`);
  await delay(100);
  interactions.supplierStatus = interactions.supplierStatus && await evaluate("!!document.querySelector('.admin-supplier-dot.is-connected')");
  await evaluate("sessionStorage.removeItem('saksuuu_supplier_check'); window.dispatchEvent(new Event('saksuuu:supplier-status'))");
  await delay(100);
  interactions.supplierStatus = interactions.supplierStatus && await evaluate("!document.querySelector('.admin-supplier-dot.is-connected')");
  interactions.mobileTables = results.filter(result => result.viewport === 390 && result.tables).every(result => result.documentWidth === 390);
  await evaluate("document.querySelector('button[aria-label^=Open]').click()");
  await delay(100);
  await evaluate("document.querySelector('[role=dialog][aria-label^=Admin] button[aria-label=\"Sign out\"]').click()");
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate("location.pathname === '/admin/login'")) break;
    await delay(150);
  }
  interactions.logout = await evaluate("location.pathname === '/admin/login'");
  const automaticSupplierChecks = requests.filter((request) =>
    request.url.includes("/api/admin/suppliers") && request.method === "POST");
  let manualSupplierVerification;
  if (process.argv.includes("--verify-suppliers")) {
    const response = await fetch(`${base}/api/admin/suppliers`, {
      method: "POST", headers: { Cookie: `saksuuu_admin_token=${token}` },
    });
    const body = await response.json();
    manualSupplierVerification = {
      httpStatus: response.status,
      vizo: { status: body.vizo?.status, balanceAvailable: body.vizo?.reseller?.balance != null },
      g2bulk: { status: body.g2bulk?.status, balanceAvailable: body.g2bulk?.reseller?.balance != null },
    };
    if (!response.ok) throw new Error("Manual supplier verification request failed");
  }
  const summary = { results, interactions, automaticSupplierChecks, manualSupplierVerification, browserErrors: errors };
  await writeFile("artifacts/admin-redesign/smoke.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (results.some((result) => result.path === "/admin/login" || !result.title))
    throw new Error("An admin page did not render");
  if (Object.values(interactions).some((passed) => !passed))
    throw new Error("An admin interaction did not work");
  if (automaticSupplierChecks.length) throw new Error("A supplier check ran automatically");
  await send("Browser.close").catch(() => {});
} finally {
  ws?.close();
  chrome.kill();
}

