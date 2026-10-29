import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const origin = "http://127.0.0.1:3000";
const output = "artifacts/homepage-verification";
const debugPort = 9488;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${process.env.TEMP || "."}/saksuuu-verify-${Date.now()}`,
  "--hide-scrollbars",
  "about:blank",
], { windowsHide: true, stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  await mkdir(output, { recursive: true });
  let target;
  for (let attempt = 0; attempt < 80 && !target; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      target = (await res.json()).find((item) => item.type === "page" && !item.url.startsWith("chrome-"));
    } catch {}
    if (!target) await delay(100);
  }
  assert.ok(target, "Headless Chrome started");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const task = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) task?.reject(new Error(JSON.stringify(msg.error)));
      else task?.resolve(msg.result);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve, reject });
    ws.send(JSON.stringify({ id: commandId, method, params }));
  });

  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  const waitFor = async (expression, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(150);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };

  try {
    await send("Page.enable");
    await send("DOM.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Network.enable");
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Runtime.exceptionThrown") {
        console.error("Browser Exception:", msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        console.log("Browser Console [" + msg.params.type + "]:", msg.params.args?.map(a => a.value || a.description).join(" "));
      }
      if (msg.method === "Network.requestWillBeSent") {
        if (msg.params.request.url.includes("/api/")) {
          console.log("API Request:", msg.params.request.method, msg.params.request.url);
        }
      }
      if (msg.method === "Network.responseReceived") {
        if (msg.params.response.url.includes("/api/")) {
          console.log("API Response:", msg.params.response.status, msg.params.response.url);
        }
      }
      if (msg.method === "Network.loadingFailed") {
        console.log("Loading Failed:", msg.params.errorText, msg.params.requestId);
      }
    });
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: origin });

    await waitFor("document.readyState === 'complete'");
    await delay(1000);

    const inPageFetch = await evaluate(`fetch('/api/smm/services?limit=2').then(r => r.json()).catch(e => ({ fetchError: e.message }))`);
    console.log("In-page fetch result:", JSON.stringify(inPageFetch, null, 2));

    const initialHtml = await evaluate(`document.getElementById("all-platforms")?.innerHTML || "NOT FOUND"`);
    console.log("Initial #all-platforms HTML:", initialHtml);

    // Verify sections order
    const structure = await evaluate(`(() => {
      const hero = document.getElementById("hero");
      const games = document.getElementById("games");
      const allPlatforms = document.getElementById("all-platforms");
      const socialServices = document.getElementById("social-services");
      const howToOrder = document.getElementById("how-to-order");
      const paymentMethods = document.getElementById("payment-methods");
      const footer = document.querySelector("footer");

      return {
        hasHero: Boolean(hero),
        hasGames: Boolean(games),
        hasAllPlatforms: Boolean(allPlatforms),
        hasSocialServices: Boolean(socialServices),
        hasHowToOrder: Boolean(howToOrder),
        hasPaymentMethods: Boolean(paymentMethods),
        hasFooter: Boolean(footer),
        orderCorrect: Boolean(
          hero && games && allPlatforms && socialServices && howToOrder && paymentMethods &&
          hero.compareDocumentPosition(games) & Node.DOCUMENT_POSITION_FOLLOWING &&
          games.compareDocumentPosition(allPlatforms) & Node.DOCUMENT_POSITION_FOLLOWING &&
          allPlatforms.compareDocumentPosition(socialServices) & Node.DOCUMENT_POSITION_FOLLOWING &&
          socialServices.compareDocumentPosition(howToOrder) & Node.DOCUMENT_POSITION_FOLLOWING &&
          howToOrder.compareDocumentPosition(paymentMethods) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      };
    })()`);

    console.log("Structure check:", JSON.stringify(structure, null, 2));
    assert.ok(structure.hasHero, "Hero section present");
    assert.ok(structure.hasGames, "Games section present");
    assert.ok(structure.hasAllPlatforms, "All Platforms section present");
    assert.ok(structure.hasSocialServices, "Social Services section present");
    assert.ok(structure.hasHowToOrder, "How to Order section present");
    assert.ok(structure.hasPaymentMethods, "Payment Methods section present");
    assert.ok(structure.orderCorrect, "Sections are in the exact requested order");

    // Wait for platforms to load from API
    await waitFor("document.querySelectorAll('#all-platforms button[data-platform]').length > 0");

    // Check platform buttons
    const platformsInfo = await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll("#all-platforms button[data-platform]"));
      return buttons.map(b => ({
        id: b.getAttribute("data-platform"),
        text: b.innerText.replace(/\\s+/g, ' ').trim(),
        hasSvg: Boolean(b.querySelector("svg")),
        pressed: b.getAttribute("aria-pressed") === "true"
      }));
    })()`);
    console.log("Platforms found:", JSON.stringify(platformsInfo, null, 2));
    assert.ok(platformsInfo.length >= 6, "At least 6 platforms rendered");
    assert.ok(platformsInfo.some(p => p.id === "all"), "All Platforms option exists");
    assert.ok(platformsInfo.some(p => p.id === "tiktok"), "TikTok exists");
    assert.ok(platformsInfo.some(p => p.id === "telegram"), "Telegram exists");
    assert.ok(platformsInfo.some(p => p.id === "facebook"), "Facebook exists");
    assert.ok(platformsInfo.some(p => p.id === "instagram"), "Instagram exists");
    assert.ok(platformsInfo.some(p => p.id === "youtube"), "YouTube exists");

    // Check services rendered
    await waitFor("document.querySelectorAll('#social-services button[data-service-id]').length > 0");
    const servicesCount = await evaluate(`document.querySelectorAll('#social-services button[data-service-id]').length`);
    console.log(`Rendered services count: ${servicesCount}`);
    assert.ok(servicesCount > 0, "Services are loaded and rendered");

    // Allow hydration to complete
    await waitFor("document.querySelector('input[aria-label=\"Search services\"]')");
    await delay(1500);

    // Test clicking TikTok platform button
    console.log("Testing click on TikTok platform...");
    let clicked = false;
    for (let i = 0; i < 10; i++) {
      await evaluate(`(() => {
        const btn = document.querySelector("#all-platforms button[data-platform='tiktok']");
        if (btn) {
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
        }
      })()`);
      await delay(500);
      const currentPlatform = await evaluate(`document.querySelector("#all-platforms button[aria-pressed='true']")?.getAttribute("data-platform")`);
      if (currentPlatform === "tiktok") {
        clicked = true;
        break;
      }
    }
    assert.ok(clicked, "TikTok platform button successfully clicked and activated");

    const selectedPlatform = await evaluate(`document.querySelector("#all-platforms button[aria-pressed='true']")?.getAttribute("data-platform")`);
    console.log("Selected platform after click:", selectedPlatform);
    assert.equal(selectedPlatform, "tiktok", "TikTok is now selected");

    // Wait for filtered services to load
    await waitFor("document.querySelectorAll('#social-services button[data-service-id]').length > 0 && Array.from(document.querySelectorAll('#social-services button[data-service-id]')).every(s => s.getAttribute('data-platform') === 'tiktok')");
    const tiktokServices = await evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('#social-services button[data-service-id]'));
      return items.slice(0, 3).map(btn => ({
        id: btn.getAttribute("data-service-id"),
        platform: btn.getAttribute("data-platform"),
        text: btn.innerText.replace(/\\s+/g, ' ').trim()
      }));
    })()`);
    console.log("Sample filtered services:", JSON.stringify(tiktokServices, null, 2));
    assert.ok(tiktokServices.every(s => s.platform === "tiktok"), "All visible services belong to TikTok");

    // Test selecting a service
    console.log("Testing service selection...");
    await evaluate(`(() => {
      const card = document.querySelectorAll('#social-services button[data-service-id]')[0];
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.click();
      return true;
    })()`);
    await waitFor("document.querySelectorAll('#social-services button[data-service-id]')[0]?.getAttribute('aria-pressed') === 'true'");
    const isFirstSelected = await evaluate(`document.querySelectorAll('#social-services button[data-service-id]')[0].getAttribute("aria-pressed")`);
    assert.equal(isFirstSelected, "true", "First service is marked selected");

    // Switch back to All Platforms to verify full catalog view
    console.log("Testing switch back to All Platforms...");
    await evaluate(`document.querySelector("#all-platforms button[data-platform='all']").click()`);
    await waitFor("document.querySelector('#all-platforms button[aria-pressed=\"true\"]')?.getAttribute('data-platform') === 'all'");
    await waitFor("document.querySelectorAll('#social-services button[data-service-id]').length >= 12");
    console.log("Switched back to All Platforms successfully");

    // Capture screenshot
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(`${output}/homepage_desktop.png`, Buffer.from(shot.data, "base64"));
    console.log(`Saved screenshot to ${output}/homepage_desktop.png`);

    console.log("ALL HOMEPAGE SMM VERIFICATIONS PASSED!");
  } finally {
    ws.close();
    chrome.kill();
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  chrome.kill();
  process.exit(1);
});
