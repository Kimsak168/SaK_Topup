// Read-only local dashboard smoke check. Never runs against a remote site.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:3000";
const typography = process.argv.includes("--typography");
const output = process.argv.find(arg => arg.startsWith("--output="))?.slice("--output=".length) || "artifacts/admin-ui";
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
const payload = encode({ username: "ui-smoke", role: "Super Admin", name: "UI smoke check", iat: now, exp: now + 3600 });
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
  await mkdir(output, { recursive: true });
  const results = [];
  for (const width of typography ? [1440, 1024, 768, 430, 390, 375] : [1440, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height: width > 600 ? 960 : 844, deviceScaleFactor: 1, mobile: width <= 600,
    });
    for (const path of pages) {
      await send("Page.navigate", { url: `${base}/admin${path}` });
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await evaluate("document.readyState === 'complete' && !!document.querySelector('h1')")) break;
        await delay(150);
      }
      const ready = path === "" ? "document.querySelectorAll('.admin-stat').length === 4 || !!document.querySelector('[role=alert]')" :
        path === "/settings" ? "!!document.querySelector('main input') || !!document.querySelector('.admin-error')" :
        path === "/suppliers" ? "!document.querySelector('.admin-skeleton')" :
        path === "/banners" ? "!!document.querySelector('main article') || !document.body.textContent.includes('Loading banners')" :
        "!!document.querySelector('main table') || !document.body.textContent.includes('Loading')";
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await evaluate(ready)) break;
        await delay(150);
      }
      await evaluate("document.fonts.ready.then(() => true)");
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
        heading: (() => { const style = getComputedStyle(document.querySelector('h1')); return { size: parseFloat(style.fontSize), weight: style.fontWeight, family: style.fontFamily }; })(),
        sections: [...document.querySelectorAll('main h2')].map(node => ({ size: parseFloat(getComputedStyle(node).fontSize), weight: getComputedStyle(node).fontWeight })),
        metrics: [...document.querySelectorAll('.admin-metric')].map(node => ({ size: parseFloat(getComputedStyle(node).fontSize), clipped: node.scrollWidth > node.clientWidth + 1 })),
        tableHeaderSize: document.querySelector('th') ? parseFloat(getComputedStyle(document.querySelector('th')).fontSize) : null,
        tableRowSize: document.querySelector('td') ? parseFloat(getComputedStyle(document.querySelector('td')).fontSize) : null,
        cardHeights: [...document.querySelectorAll('.admin-stat')].map(node => Math.round(node.getBoundingClientRect().height)),
        clippedLabels: [...document.querySelectorAll('.admin-stat-top, .admin-supplier-details > div > span, .admin-nav-heading')].filter(node => node.getBoundingClientRect().width && node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim()),
        sidebarClear: (() => {
          const sidebar = document.querySelector('.admin-sidebar');
          if (!sidebar?.getBoundingClientRect().width) return true;
          return ['.admin-sidebar-header', '.admin-sidebar-profile'].every(selector => {
            const nodes = [...sidebar.querySelector(selector).children].filter(node => node.getBoundingClientRect().width);
            if (nodes.length !== 2) return true;
            const [a, b] = nodes.map(node => node.getBoundingClientRect());
            return a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
          });
        })(),
      })`);
      results.push(details);
      if (path === "" || path === "/suppliers") {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(`${output}/${width}-${path ? "suppliers" : "overview"}.png`, Buffer.from(shot.data, "base64"));
      }
    }
  }
  const interactions = {};
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/admin` });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate("document.readyState === 'complete' && !!document.querySelector('h1')")) break;
    await delay(150);
  }
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate("!!document.querySelector('.admin-stat') && !!document.querySelector('button[aria-pressed]')")) break;
    await delay(150);
  }
  await delay(250);
  if (typography) {
    const beforeResize = requests.filter(request => request.url.includes("/api/admin/overview")).length;
    for (const width of [1024, 768, 430, 390, 375, 1440]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: width < 768 });
      await delay(100);
    }
    interactions.noRefetchOnResize = requests.filter(request => request.url.includes("/api/admin/overview")).length === beforeResize;
  }
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button[aria-pressed]')].find(node => node.textContent.trim().toLowerCase() === '30d');
    button.click();
    return true;
  })()`);
  await delay(200);
  interactions.rangeFilter = await evaluate("[...document.querySelectorAll('button[aria-pressed]')].some(node => node.textContent.trim().toLowerCase() === '30d' && node.getAttribute('aria-pressed') === 'true')");
  await evaluate("document.querySelector('button[aria-label^=Expand]')?.click()");
  await delay(150);
  await evaluate("document.querySelector('button[aria-label^=Collapse]').click()");
  await delay(100);
  const collapsed = await evaluate("!!document.querySelector('button[aria-label^=Expand]')");
  await evaluate("document.querySelector('button[aria-label^=Expand]').click()");
  await delay(100);
  interactions.collapse = collapsed && await evaluate("!!document.querySelector('button[aria-label^=Collapse]')");
  await evaluate("document.querySelector('button[aria-label^=Switch]').click()");
  await delay(100);
  interactions.themeToggle = await evaluate("!!document.querySelector('.admin-shell-light')");
  const themeShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${output}/1440-light-overview.png`, Buffer.from(themeShot.data, "base64"));
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
  const drawerLinks = await evaluate("[...document.querySelector('[role=dialog][aria-label^=Admin]').querySelectorAll('nav a')].filter(a => a.getAttribute('href').startsWith('/admin')).length");
  await evaluate("document.querySelector('button[aria-label^=Close]').click()");
  await delay(100);
  interactions.mobileDrawer = drawerLinks === 8 &&
    await evaluate("!document.querySelector('[role=dialog][aria-label^=Admin]')");
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
  await writeFile(`${output}/smoke.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(typography ? { pageChecks: results.length, viewports: [1440, 1024, 768, 430, 390, 375], interactions, browserErrors: errors, report: `${output}/smoke.json` } : summary, null, 2));
  if (results.some((result) => result.path === "/admin/login" || !result.title))
    throw new Error("An admin page did not render");
  if (Object.values(interactions).some((passed) => !passed))
    throw new Error("An admin interaction did not work");
  if (automaticSupplierChecks.length) throw new Error("A supplier check ran automatically");
  if (typography) {
    for (const row of results) {
      if (row.documentWidth > row.viewport + 1) throw new Error(`Page overflows at ${row.path} ${row.viewport}px`);
      if (!row.sidebarClear) throw new Error(`Sidebar controls overlap at ${row.path} ${row.viewport}px`);
      if (row.heading.size !== (row.viewport >= 768 ? 30 : 23) || row.heading.weight !== "700") throw new Error(`Incorrect title hierarchy at ${row.path} ${row.viewport}px`);
      if (row.sections.some(section => section.size < 16 || section.size > 18)) throw new Error(`Incorrect section typography at ${row.path} ${row.viewport}px`);
      if (row.metrics.some(metric => metric.size < 28 || metric.size > 34 || metric.clipped)) throw new Error(`Metric does not fit at ${row.path} ${row.viewport}px`);
      if (row.clippedLabels.length) throw new Error(`Clipped labels at ${row.path} ${row.viewport}px: ${row.clippedLabels.join(', ')}`);
      if (row.cardHeights.length && Math.max(...row.cardHeights) - Math.min(...row.cardHeights) > 1) throw new Error(`Misaligned metric cards at ${row.path} ${row.viewport}px`);
      if (row.tableHeaderSize && row.tableHeaderSize !== 12) throw new Error(`Incorrect table headings at ${row.path}`);
      if (row.tableRowSize && row.tableRowSize !== 13) throw new Error(`Incorrect table rows at ${row.path}`);
    }
    if (errors.length) throw new Error("Browser runtime errors occurred");
  }
  await send("Browser.close").catch(() => {});
} finally {
  ws?.close();
  chrome.kill();
}
