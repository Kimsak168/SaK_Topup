// Read-only carousel check using the Chrome DevTools Protocol.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "local";
const profile = await mkdtemp(join(tmpdir(), "saksuuu-banner-"));
const port = 9342;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;

try {
  let target;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === "page");
      if (target) break;
    } catch { /* Chrome is still starting. */ }
    await delay(100);
  }
  if (!target) throw new Error("Chrome DevTools did not start");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const requests = new Map();
  const imageResponses = [];
  const errors = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(message.error);
      else call.resolve(message.result);
    }
    if (message.method === "Network.requestWillBeSent") {
      requests.set(message.params.requestId, message.params.request.url);
    }
    if (message.method === "Network.responseReceived" && message.params.type === "Image") {
      imageResponses.push({ status: message.params.response.status, url: message.params.response.url });
    }
    if (message.method === "Network.loadingFailed") {
      const url = requests.get(message.params.requestId);
      if (url?.includes("image") || url?.includes("blob.vercel-storage.com")) {
        errors.push({ url, error: message.params.errorText });
      }
    }
    if (message.method === "Runtime.exceptionThrown") {
      errors.push({ error: message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text });
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push({ error: message.params.args.map((arg) => arg.value || arg.description).join(" ") });
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await mkdir("artifacts/banner-diagnostics", { recursive: true });

  const results = [];
  for (const width of [1280, 768, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height: width > 600 ? 900 : 844, deviceScaleFactor: 1, mobile: width <= 600,
    });
    await send("Page.navigate", { url: base });
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate('document.querySelectorAll("[aria-label=Promotions] .shrink-0").length > 0')) break;
      await delay(250);
    }
    const count = await evaluate('document.querySelectorAll("[aria-label=Promotions] .shrink-0").length');
    const slides = [];
    for (let index = 0; index < count; index++) {
      if (index > 0) {
        await evaluate(`document.querySelector('[aria-label="Go to banner ${index + 1}"]')?.click()`);
      }
      await delay(700);
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await evaluate(`(() => { const images = document.querySelectorAll("[aria-label=Promotions] .shrink-0")[${index}]?.querySelectorAll('img'); const image = images?.[images.length - 1]; const rect = image?.parentElement.getBoundingClientRect(); return image?.complete && image.naturalWidth > 0 && rect?.width > 0 && rect?.height > 0; })()`)) break;
        await delay(250);
      }
      slides.push(await evaluate(`(() => {
        const region = document.querySelector('[aria-label="Promotions"]');
        const images = region.querySelectorAll('.shrink-0')[${index}].querySelectorAll('img');
        const image = images[images.length - 1];
        const frame = image.parentElement;
        const imageRect = image.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        return {
          index: ${index + 1}, complete: image.complete,
          naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
          frameWidth: Math.round(frameRect.width), frameHeight: Math.round(frameRect.height),
          imageWidth: Math.round(imageRect.width), imageHeight: Math.round(imageRect.height),
          objectFit: getComputedStyle(image).objectFit,
          aspectRatio: getComputedStyle(frame).aspectRatio,
          aspectRatioSupported: CSS.supports('aspect-ratio', '5/2'),
          frameClass: frame.className,
          visibility: getComputedStyle(image).visibility,
          url: image.currentSrc,
        };
      })()`));
      if (index === 0) {
        const screenshot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(`artifacts/banner-diagnostics/${label}-${width}.png`, Buffer.from(screenshot.data, "base64"));
      }
    }
    await evaluate('document.querySelector(\'[aria-label="Go to banner 1"]\')?.click()');
    await delay(150);
    await evaluate('document.querySelector(\'[aria-label="Previous banner"]\')?.click()');
    await delay(150);
    const previousIndex = await evaluate(`[...document.querySelectorAll('[aria-label^="Go to banner "]')].findIndex((button) => button.classList.contains('w-8')) + 1`);
    await evaluate('document.querySelector(\'[aria-label="Next banner"]\')?.click()');
    await delay(150);
    const nextIndex = await evaluate(`[...document.querySelectorAll('[aria-label^="Go to banner "]')].findIndex((button) => button.classList.contains('w-8')) + 1`);
    await delay(5200);
    const autoIndex = await evaluate(`[...document.querySelectorAll('[aria-label^="Go to banner "]')].findIndex((button) => button.classList.contains('w-8')) + 1`);
    results.push({ width, count, slides, controls: { previousIndex, nextIndex, autoIndex } });
  }
  const bannerResponses = imageResponses.filter(({ url }) =>
    url.includes("/api/banners/") || url.includes("/banners/banner-") ||
    url.includes("w=1200") || url.includes("w=640") ||
    url.includes("/images/freefire_global.png") || url.includes("/images/pubgm.png")
  );
  console.log(JSON.stringify({ base, results, bannerResponses, errors }, null, 2));
} finally {
  ws?.close();
  chrome.kill();
}
