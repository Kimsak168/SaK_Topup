import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import nextEnv from "@next/env";
import ts from "typescript";

const origin = process.argv[2] || "http://127.0.0.1:3022";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Local preview required");
const output = "artifacts/support-toolbar";
const rail = 'nav[aria-label="Support toolbar"]';
const toggle = ".public-navbar button[aria-expanded]";
const theme = rail + ' button[aria-label^="Change Theme"]';
const up = rail + ' button[aria-label="Back to Top"]';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [], layouts = [], errors = [];

// Read the same public configuration as the build without printing other env values.
nextEnv.loadEnvConfig(process.cwd());
const compiled = ts.transpileModule(await readFile("src/lib/socialLinks.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const config = { exports: {}, process: { env: process.env } };
runInNewContext(compiled, config);
const urls = config.exports.SOCIAL_URLS;
const expectedSocials = Object.entries({
  Telegram: urls.telegram, Facebook: urls.facebook, TikTok: urls.tiktok,
  Discord: urls.discord, YouTube: urls.youtube,
}).flatMap(([label, value]) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? [{ label, href: url.href }] : [];
  } catch { return []; }
});

await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "saksuuu-toolbar-"));
const debugPort = 9364;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=" + debugPort, "--user-data-dir=" + profile, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let ws;
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch("http://127.0.0.1:" + debugPort + "/json/list")).json()).find((page) => page.type === "page"); } catch { /* Starting Chrome. */ }
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
      const task = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) task?.reject(new Error(JSON.stringify(data.error)));
      else task?.resolve(data.result);
    }
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails);
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate("Boolean(" + expression + ")")) return;
      await delay(100);
    }
    throw new Error("Timed out: " + expression);
  };
  const click = async (selector) => {
    const point = await evaluate("(() => { const r=document.querySelector(" + JSON.stringify(selector) + ").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}; })()");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    await delay(250);
  };
  const mark = (description) => { checks.push(description); console.log("PASS: " + description); };
  const isOpen = () => evaluate("document.querySelector(" + JSON.stringify(toggle) + ").getAttribute('aria-expanded') === 'true'");
  const screenshot = async (name) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(output + "/" + name + ".png", Buffer.from(shot.data, "base64"));
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: origin + "/orders" });
  await waitFor("document.querySelector(" + JSON.stringify(rail) + ") && document.querySelector(" + JSON.stringify(toggle) + ")");
  await evaluate("document.fonts.ready.then(() => true)");
  assert.equal(await isOpen(), false);
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(rail) + ").inert"), true);
  await click(toggle);
  assert.equal(await isOpen(), true);
  const order = await evaluate("[...document.querySelector(" + JSON.stringify(rail) + ").querySelectorAll('a,button')].map(el=>el.getAttribute('aria-label'))");
  assert.deepEqual(order, ["SakSuuu Home", ...expectedSocials.map(({ label }) => label + " (opens in a new tab)"),
    "Support (opens in a new tab)", "Change Theme (light mode, switch to dark)", "Back to Top"]);
  mark("Correct order; missing/invalid social URLs are hidden, including unconfigured Discord and YouTube");

  for (const { label, href } of [...expectedSocials, { label: "Support", href: new URL(urls.telegram).href }]) {
    const selector = rail + ' a[aria-label="' + label + ' (opens in a new tab)"]';
    const link = await evaluate("(() => {const el=document.querySelector(" + JSON.stringify(selector) + ");el.addEventListener('click',e=>e.preventDefault(),{once:true});return {href:el.href,target:el.target,rel:el.rel};})()");
    assert.equal(link.href, href);
    assert.equal(link.target, "_blank");
    assert.ok(link.rel.includes("noopener") && link.rel.includes("noreferrer"));
    await click(selector);
    assert.equal(await isOpen(), true, "Clicks inside keep the toolbar open");
    assert.equal(await evaluate("document.querySelector(" + JSON.stringify(selector) + ").dataset.active"), "true");
  }
  mark("Social and Support clicks retain configured destinations and new-tab behavior; selected actions use the gradient");

  await click(theme);
  assert.equal(await evaluate("document.documentElement.dataset.storefrontTheme"), "dark");
  assert.equal(await evaluate("localStorage.getItem('saksuuu_public_theme')"), "dark");
  assert.equal(await evaluate("!!document.querySelector(" + JSON.stringify(theme + " .lucide-moon") + ")"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('main h1')).color"), "rgb(241, 245, 249)");
  assert.equal(await isOpen(), true);
  await screenshot("desktop-dark");
  await send("Page.reload");
  await waitFor("document.querySelector(" + JSON.stringify(rail) + ")");
  assert.equal(await evaluate("document.documentElement.dataset.storefrontTheme"), "dark");
  await click(toggle);
  await click(theme);
  assert.equal(await evaluate("document.documentElement.dataset.storefrontTheme"), "light");
  assert.equal(await evaluate("!!document.querySelector(" + JSON.stringify(theme + " .lucide-sun") + ")"), true);
  mark("One shared theme preference toggles the storefront and Sun/Moon icon, persists after reload, and restores light mode");

  const telegram = rail + ' a[aria-label^="Telegram"]';
  await evaluate("document.querySelector(" + JSON.stringify(rail + ' a[aria-label="SakSuuu Home"]') + ").focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await waitFor("[...document.querySelectorAll('[role=tooltip]')].some(el=>el.textContent==='Telegram')");
  const tooltip = await evaluate("(() => {const el=[...document.querySelectorAll('[role=tooltip]')].find(el=>el.textContent==='Telegram');const r=el.getBoundingClientRect();const a=document.querySelector(" + JSON.stringify(telegram) + ").getBoundingClientRect();return {left:r.left,right:r.right,anchorLeft:a.left,bg:getComputedStyle(el).backgroundColor};})()");
  assert.ok(tooltip.right < tooltip.anchorLeft && tooltip.left >= 0);
  assert.equal(tooltip.bg, "rgb(15, 23, 42)");
  const facebook = rail + ' a[aria-label^="Facebook"]';
  const hoverPoint = await evaluate("(() => {const r=document.querySelector(" + JSON.stringify(facebook) + ").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...hoverPoint });
  await waitFor("[...document.querySelectorAll('[role=tooltip]')].some(el=>el.textContent==='Facebook')");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await delay(250);
  assert.equal(await isOpen(), false);
  assert.equal(await evaluate("document.activeElement === document.querySelector(" + JSON.stringify(toggle) + ")"), true);
  await click(toggle);
  await click(toggle);
  assert.equal(await isOpen(), false);
  mark("Left-side keyboard tooltip; Escape closes and returns focus; navbar sliders toggle open and closed");

  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 240]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await delay(300);
    if (!await isOpen()) await click(toggle);
    await waitFor("document.querySelector(" + JSON.stringify(rail) + ").dataset.open === 'true'");
    await delay(250);
    const layout = await evaluate("(() => {const el=document.querySelector(" + JSON.stringify(rail) + ");const r=el.getBoundingClientRect();const b=el.querySelector('button').getBoundingClientRect();return {width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,railWidth:r.width,buttonWidth:b.width,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth,gradient:getComputedStyle(el).backgroundImage,transition:getComputedStyle(el).transitionDuration};})()");
    const positioning = await evaluate("(() => {const el=document.querySelector(" + JSON.stringify(rail) + ");const s=getComputedStyle(el);return {open:el.dataset.open,right:s.right,translate:s.translate,transform:s.transform,opacity:s.opacity,clientWidth:document.documentElement.clientWidth,viewportWidth:visualViewport.width,viewportScale:visualViewport.scale,viewportOffset:visualViewport.offsetLeft};})()");
    assert.ok(layout.left >= 0 && layout.right <= width && layout.top >= 0 && layout.bottom <= height, JSON.stringify({ layout, positioning }));
    assert.equal(layout.pageOverflow, false);
    assert.equal(layout.railWidth, width < 640 ? 48 : 56);
    assert.equal(layout.buttonWidth, width < 640 ? 36 : 40);
    assert.ok(layout.gradient.includes("rgb(23, 37, 84)"));
    if (height === 240) {
      assert.ok(layout.scrollHeight > layout.clientHeight, "Short viewport scrolls internally");
      await evaluate("document.querySelector(" + JSON.stringify(up) + ").scrollIntoView({block:'nearest',behavior:'instant'})");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
      await evaluate("document.querySelector(" + JSON.stringify(up) + ").focus()");
      await waitFor("[...document.querySelectorAll('[role=tooltip]')].some(el=>el.textContent==='Back to Top')");
      const visible = await evaluate("(() => {const r=[...document.querySelectorAll('[role=tooltip]')].find(el=>el.textContent==='Back to Top').getBoundingClientRect();return r.width>0&&r.left>=0&&r.top>=0&&r.bottom<=innerHeight;})()");
      assert.ok(visible, "Portaled tooltip remains visible outside the scrolling rail");
    }
    layouts.push(layout);
    await screenshot("toolbar-" + width + "x" + height);
    await click(toggle);
  }
  mark("Desktop, 390px, 320px and short landscape layouts fit; internal scrolling preserves unclipped tooltips");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.body.style.minHeight='2400px';window.scrollTo({top:800,behavior:'instant'})");
  await click(toggle);
  await evaluate("document.querySelector(" + JSON.stringify(rail) + ").scrollTop=0");
  const documentId = await evaluate("window.__toolbarDocumentId = Math.random()");
  await click(up);
  await waitFor("window.scrollY===0");
  assert.equal(await evaluate("window.__toolbarDocumentId"), documentId);
  assert.equal(await isOpen(), true);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.scrollTo({top:800,behavior:'instant'})");
  await click(up);
  assert.equal(await evaluate("window.scrollY"), 0);
  const reducedDurations = await evaluate("getComputedStyle(document.querySelector(" + JSON.stringify(rail) + ")).transitionDuration");
  assert.ok(reducedDurations.split(",").every((duration) => parseFloat(duration) / (duration.trim().endsWith("ms") ? 1000 : 1) <= 0.00001));
  mark("Back to Top scrolls without reloading or closing the rail and respects reduced motion");
  assert.deepEqual(errors, []);
  mark("No browser runtime exceptions");
  await writeFile(output + "/report.json", JSON.stringify({ checks, layouts, errors }, null, 2));
} catch (error) {
  await writeFile(output + "/report.json", JSON.stringify({ checks, layouts, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  ws?.close();
  chrome.kill();
}
