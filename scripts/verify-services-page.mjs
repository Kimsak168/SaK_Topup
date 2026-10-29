import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const appOrigin = process.env.SERVICES_APP_ORIGIN || "http://127.0.0.1:3000";
const origin = process.env.SERVICES_PREVIEW_ORIGIN || appOrigin;
const simulationOrigin = process.env.SERVICES_SIMULATION_ORIGIN || "http://127.0.0.1:4900/storefront";
const output = process.env.SERVICES_ARTIFACTS_PATH || "artifacts/services-marketplace";
const debugPort = Number(process.env.SERVICES_CHROME_DEBUG_PORT || 9394);
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${process.env.TEMP || "."}/saksuuu-services-chrome-${process.pid}`,
  "--hide-scrollbars", "about:blank",
], { windowsHide: true, stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
let ws;

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
  const browserErrors = [];
  const consoleErrors = [];
  const apiRequests = [];
  const resourceFailures = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error)));
      else task?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || "").join(" "));
    }
    if (message.method === "Network.loadingFailed") resourceFailures.push({ requestId: message.params.requestId, error: message.params.errorText });
    if (message.method === "Fetch.requestPaused") {
      const { request, requestId } = message.params;
      const url = new URL(request.url);
      const supported = url.origin === origin && (
        (url.pathname === "/api/smm/services" && request.method === "GET") ||
        (url.pathname === "/api/smm/orders" && request.method === "POST") ||
        (url.pathname === "/api/payment/vngzz2/check" && request.method === "POST") ||
        (url.pathname === "/api/orders/track" && request.method === "GET")
      );
      apiRequests.push({ method: request.method, path: url.pathname, simulated: supported });
      void (async () => {
        if (!supported) {
          await send("Fetch.continueRequest", { requestId });
          return;
        }
        const response = await fetch(`${simulationOrigin}${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers?.["content-type"] ? { "content-type": request.headers["content-type"] } : undefined,
          body: request.method === "GET" ? undefined : request.postData,
        });
        const body = Buffer.from(await response.arrayBuffer()).toString("base64");
        await send("Fetch.fulfillRequest", {
          requestId,
          responseCode: response.status,
          responseHeaders: [{ name: "Content-Type", value: response.headers.get("content-type") || "application/json" }],
          body,
        });
      })().catch(async (error) => {
        if (error.message.includes("Invalid InterceptionId")) return;
        console.error(`Simulation interception failed for ${request.method} ${url.pathname}:`, error.message);
        try {
          await send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 502,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body: Buffer.from(JSON.stringify({ success: false, error: "Local service simulation unavailable" })).toString("base64"),
          });
        } catch {
          // The browser may cancel a duplicate request during route navigation.
        }
      });
    }
  });

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
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, message = expression) => {
    for (let attempt = 0; attempt < 180; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    console.error("Browser state at timeout:", JSON.stringify(await evaluate("({url:location.href,ready:document.readyState,text:document.body.innerText.slice(0,1800),cards:document.querySelectorAll('[data-service-id]').length,reactMounted:Boolean(document.querySelector('#services-title')?.[Object.keys(document.querySelector('#services-title')||{}).find((key)=>key.startsWith('__reactFiber'))]),scripts:[...document.scripts].map((script)=>script.src).filter(Boolean),resources:performance.getEntriesByType('resource').filter((entry)=>entry.name.includes('/_next/')).map((entry)=>({name:entry.name.split('/').pop(),duration:Math.round(entry.duration)}))})")));
    console.error("Simulated API traffic:", JSON.stringify(apiRequests));
    console.error("Browser errors and failed resources:", JSON.stringify({ browserErrors, consoleErrors, resourceFailures }));
    throw new Error(`Timed out: ${message}`);
  };
  const click = async (selector) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing click target: '+${JSON.stringify(selector)});el.scrollIntoView({block:'center'});el.click();return true;})()`);
  const fill = async (selector, value) => {
    await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing input: '+${JSON.stringify(selector)});el.focus();el.select();})()`);
    await send("Input.insertText", { text: String(value) });
    await delay(120);
  };
  const choose = async (selector, value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing select: '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  const control = async (settings) => {
    const response = await fetch(`${simulationOrigin}/__control`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    assert.equal(response.status, 200, "Postman simulation control endpoint responds");
  };
  const viewport = async (width) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 640 });
    await delay(160);
  };
  const mark = (description) => { checks.push(description); console.log(`PASS: ${description}`); };
  const cardIds = () => evaluate("[...document.querySelectorAll('[data-service-id]')].map((el)=>el.getAttribute('data-service-id'))");
  const setAllFilters = async () => {
    await click("button[data-platform='all']");
    await click("button[aria-pressed][data-service-filter='all']").catch(() => {});
    await choose("select[aria-label='Filter by category']", "All");
    await choose("select[aria-label='Sort services']", "recommended");
    await fill("input[aria-label='Search services']", "");
  };

  await mkdir(output, { recursive: true });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  await send("Fetch.enable", { patterns: [
    { urlPattern: "*://*/api/smm/*", requestStage: "Request" },
    { urlPattern: "*://*/api/payment/vngzz2/check*", requestStage: "Request" },
    { urlPattern: "*://*/api/orders/track*", requestStage: "Request" },
  ] });
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await control({ reset: true });
  await viewport(1440);
  await send("Page.navigate", { url: `${origin}/services` });
  await waitFor("document.querySelector('#services-title') && document.querySelector('[aria-label=\"Search services\"]')", "Social services page hydration");
  await waitFor("document.querySelectorAll('[data-service-id]').length===12", "First page of the supplier catalogue");
  assert.equal(await evaluate("document.querySelector('#service-catalog').innerText.includes('15 available')"), true, "Catalog count reflects the service response");
  assert.equal(await evaluate("document.querySelector('h1').innerText.includes('Social Presence')"), true);
  assert.equal(await evaluate("document.body.innerText.includes('SOCIAL MEDIA GROWTH & DIGITAL SERVICES')"), true);
  const brandColors = await evaluate("[...document.querySelectorAll('button[data-platform] svg')].map((icon)=>getComputedStyle(icon).color)");
  assert.ok(new Set(brandColors).size >= 5, `Platform icons use distinct brand colors: ${brandColors.join(', ')}`);
  for (const [platform, count] of [["tiktok", 3], ["telegram", 2], ["facebook", 3], ["instagram", 3], ["youtube", 2], ["other", 2]]) {
    await click(`button[data-platform='${platform}']`);
    await waitFor(`document.querySelectorAll('[data-service-id]').length===${count}`, `${platform} service filter`);
    const platformsOnPage = await evaluate("[...document.querySelectorAll('[data-service-id]')].map((card)=>card.getAttribute('data-platform'))");
    assert.ok(platformsOnPage.length > 0 && platformsOnPage.every((value) => value === platform), `${platform} results contain no other platform`);
  }
  await click("button[data-platform='all']");
  await waitFor("document.querySelectorAll('[data-service-id]').length===12", "All Platforms catalog page");
  const allPlatformResults = await evaluate("new Set([...document.querySelectorAll('[data-service-id]')].map((card)=>card.getAttribute('data-platform'))).size");
  assert.equal(allPlatformResults, 6, "All Platforms contains every platform represented in the fixture catalog");
  mark("TikTok, Telegram, Facebook, Instagram, YouTube, Other, and All Platforms filter to their matching services");
  const desktop = await evaluate("(() => {const catalog=document.querySelector('#service-catalog').getBoundingClientRect(),order=document.querySelector('form').getBoundingClientRect();return {width:document.documentElement.scrollWidth,viewport:innerWidth,catalogLeft:catalog.left,orderLeft:order.left};})()");
  assert.ok(desktop.width <= desktop.viewport && desktop.orderLeft > desktop.catalogLeft, JSON.stringify(desktop));
  await evaluate("window.scrollTo(0,0); document.querySelector('nextjs-portal')?.setAttribute('style','display:none!important')");
  const desktopShot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1440, height: 1000, scale: 1 } });
  await writeFile(`${output}/services-desktop.png`, Buffer.from(desktopShot.data, "base64"));
  mark("real response counts, brand-colored platform icons, premium hero, and desktop two-column layout render");

  await click("button[data-platform='facebook']");
  await waitFor("document.querySelectorAll('[data-service-id]').length===3", "Facebook services filter");
  assert.ok((await cardIds()).every((serviceId) => serviceId.startsWith("test-fb-")));
  await choose("select[aria-label='Filter by category']", "Likes & Reactions");
  await waitFor("document.querySelectorAll('[data-service-id]').length===1", "Facebook likes category");
  assert.deepEqual(await cardIds(), ["test-fb-likes"]);
  await fill("input[aria-label='Search services']", "Facebook Post Likes");
  await waitFor("document.querySelectorAll('[data-service-id]').length===1", "Search combined with Facebook category filter");
  assert.deepEqual(await cardIds(), ["test-fb-likes"]);
  await click("button[aria-label='Clear service search']");
  await waitFor("document.querySelectorAll('[data-service-id]').length===1", "Category remains selected after clearing search");
  await click("[data-service-id='test-fb-likes']");
  assert.equal(await evaluate("document.querySelector('form').innerText.includes('Facebook Post Likes')"), true);
  mark("platform and category filters narrow the catalog, and service selection updates checkout");

  await click("button[data-platform='all']");
  await choose("select[aria-label='Filter by category']", "All");
  await choose("select[aria-label='Sort services']", "recommended");
  await click("button[aria-pressed][data-filter-type='followers']").catch(async () => {
    await evaluate("[...document.querySelectorAll('button[aria-pressed]')].find((button)=>button.textContent.includes('Followers / Members'))?.click();true");
  });
  await waitFor("[...document.querySelectorAll('[data-service-id]')].every((card)=>/followers|subscriber|member/i.test(card.innerText))", "Follower service type filter");
  assert.ok((await cardIds()).length > 1);
  await evaluate("[...document.querySelectorAll('button[aria-pressed]')].find((button)=>button.textContent.includes('All Types'))?.click();true");
  await fill("input[aria-label='Search services']", "Instagram Reels Views");
  await waitFor("document.querySelectorAll('[data-service-id]').length===1", "Search across the real service name");
  assert.deepEqual(await cardIds(), ["test-ig-views"]);
  await click("button[aria-label='Clear service search']");
  await choose("select[aria-label='Sort services']", "price-low");
  await waitFor("document.querySelector('[data-service-id]')?.getAttribute('data-service-id')==='test-ig-views'", "Price sorting");
  await choose("select[aria-label='Sort services']", "recommended");
  await waitFor("document.querySelector('nav[aria-label=\"Service pagination\"]')?.textContent.includes('Page 1 of 2')", "First catalog page");
  await click("button[aria-label='Next page']");
  await waitFor("document.querySelectorAll('[data-service-id]').length===3 && document.querySelector('nav[aria-label=\"Service pagination\"]')?.textContent.includes('Page 2 of 2')", "Second catalog page");
  await click("button[aria-label='Previous page']");
  await waitFor("document.querySelectorAll('[data-service-id]').length===12 && document.querySelector('nav[aria-label=\"Service pagination\"]')?.textContent.includes('Page 1 of 2')", "Return to first page");
  mark("service-type filters, search, price sorting, and 12-item pagination work");

  await control({ catalogue: "unavailable" });
  await send("Page.reload");
  await waitFor("document.body.innerText.includes('Services are temporarily unavailable')", "Catalog API error state");
  await control({ catalogue: "success" });
  await send("Page.reload");
  await waitFor("document.querySelectorAll('[data-service-id]').length===12", "Catalog reload after API error");
  mark("catalog API failures show a clear recovery state and recover after the service returns");

  const widths = [320, 360, 390, 430, 768, 1024, 1440];
  const layouts = [];
  for (const width of widths) {
    await viewport(width);
    const layout = await evaluate("(() => {const page=document.documentElement, catalog=document.querySelector('#service-catalog').getBoundingClientRect(), form=document.querySelector('form').getBoundingClientRect(), tabs=document.querySelector('button[data-platform]').parentElement;return {viewport:innerWidth,pageWidth:page.scrollWidth,catalogLeft:catalog.left,formTop:form.top,catalogTop:catalog.top,tabsClient:tabs.clientWidth,tabsScroll:tabs.scrollWidth};})()");
    assert.ok(layout.pageWidth <= width, `No horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
    if (width <= 430) assert.ok(layout.formTop > layout.catalogTop, `Checkout stacks below catalog at ${width}px`);
    layouts.push(layout);
    if (width === 390) {
      await evaluate("window.scrollTo(0,0); document.querySelector('nextjs-portal')?.setAttribute('style','display:none!important')");
      await delay(120);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: 1000, scale: 1 } });
      await writeFile(`${output}/services-mobile.png`, Buffer.from(shot.data, "base64"));
    }
  }
  mark("mobile, tablet, and desktop layouts fit 320, 360, 390, 430, 768, 1024, and 1440px");

  await viewport(1440);
  await setAllFilters();
  await click("[data-service-id='test-tt-followers']");
  await fill("input#target-link", "https://www.tiktok.com/@test");
  await fill("input#service-quantity", "99");
  assert.equal(await evaluate("document.querySelector('#service-quantity-error').textContent.includes('Minimum order is 100')"), true);
  assert.equal(await evaluate("document.querySelector('form button[type=submit]').disabled"), true);
  await fill("input#service-quantity", "50001");
  assert.equal(await evaluate("document.querySelector('#service-quantity-error').textContent.includes('Maximum order is 50,000')"), true);
  assert.equal(await evaluate("document.querySelector('form button[type=submit]').disabled"), true);
  await fill("input#service-quantity", "333");
  assert.equal(await evaluate("document.querySelector('form button[type=submit]').disabled"), false);
  assert.equal(await evaluate("document.querySelector('form').innerText.includes('$0.44')"), true, "Price preview rounds up exactly like the order API");
  mark("URL and quantity validation enforce min/max and the price preview matches server rounding");

  await control({ smmOrder: "unavailable", paid: false });
  await click("form button[type=submit]");
  await waitFor("[...document.querySelectorAll('[data-sonner-toast]')].some((toast)=>toast.innerText.includes('Simulated checkout unavailable'))", "Order API error toast");
  await control({ smmOrder: "success", paid: false });
  await click("form button[type=submit]");
  await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Payment status: PENDING')", "Initial backend payment status in KHQR modal");
  assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('0.44')"), true);
  await control({ paid: true });
  await waitFor("location.pathname==='/orders' && document.body.innerText.toLowerCase().includes('order results (1)')", "Backend confirms payment and the order tracker loads the paid order");
  assert.equal(await evaluate("document.body.innerText.includes('SIM-SMM-0001') && document.body.innerText.includes('PAID')"), true);
  const state = await (await fetch(`${simulationOrigin}/__state`)).json();
  assert.equal(state.smmOrders.length, 1, "Only the successful simulated order is recorded");
  assert.equal(state.smmOrders[0].amount, 0.44, "Mock order amount matches the client preview");
  assert.equal(state.smmOrders[0].paymentStatus, "PAID", "Status changes only after the mocked backend confirms payment");
  assert.ok(apiRequests.some((request) => request.path === "/api/orders/track" && request.simulated), "Order tracking also uses the local simulation");
  assert.ok(apiRequests.every((request) => request.simulated), "All intercepted storefront APIs use local fixtures");
  mark("order errors are surfaced; ABA KHQR stays pending until backend status changes to PAID");

  await send("Page.navigate", { url: `${origin}/` });
  await waitFor("document.querySelector('#games') && document.querySelector('#all-platforms') && document.querySelector('#social-services') && document.querySelector('#how-to-order') && document.querySelector('#payment-methods')", "Homepage catalog sections render");
  const homeOrder = await evaluate("(() => {const ids=['#games','#services','.home-featured-packages','#all-platforms','#social-services','#how-to-order','#payment-methods','footer'];return ids.map((selector)=>({selector,top:document.querySelector(selector)?.getBoundingClientRect().top??-1}));})()");
  assert.ok(homeOrder.every((item, index) => item.top >= 0 && (index === 0 || item.top > homeOrder[index - 1].top)), JSON.stringify(homeOrder));
  assert.equal(await evaluate("Boolean(document.querySelector('.home-featured-packages').nextElementSibling?.querySelector('#all-platforms'))"), true, "All Platforms begins directly after the Games section");
  mark("homepage order is hero, games, platforms, services, How to Order, payment methods, then the shared footer");

  const invalidRequests = [
    { serviceId: "anything", link: "https://example.com", quantity: 2.5, paymentMethod: "aba_payway_v2" },
    { serviceId: "anything", link: "javascript:alert(1)", quantity: 10, paymentMethod: "aba_payway_v2" },
    { serviceId: "anything", link: "https://example.com", quantity: 10, paymentMethod: "unknown" },
  ];
  for (const body of invalidRequests) {
    const response = await fetch(`${appOrigin}/api/smm/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, `Server rejects invalid order: ${JSON.stringify(body)}`);
  }
  mark("live app route rejects fractional quantities, unsafe URLs, and unsupported payment methods before supplier or database calls");

  assert.deepEqual(browserErrors, [], "No browser runtime exceptions");
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, layouts, simulatedOrders: state.smmOrders.length, browserErrors, consoleErrors }, null, 2));
  console.log("Completed service marketplace browser verification against local Postman fixtures; no live supplier or payment was used.");
} finally {
  ws?.close();
  chrome.kill();
}
