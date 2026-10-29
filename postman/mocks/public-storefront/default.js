/* eslint-disable @typescript-eslint/no-require-imports -- Postman runs CommonJS handlers. */
const http = require("node:http");

// Local fixtures mirror public route response shapes; they never call suppliers,
// MongoDB, or the payment provider. Control endpoints exist only in this mock.
const seed = { verification: "success", checkout: "success", paid: false, delay: 650, catalogue: "success", smmOrder: "success" };
const smmServices = [
  { service: "test-tt-followers", name: "TikTok Followers · 30 day refill", category: "Followers", platform: "tiktok", refill: true, rate: 1.3, min: 100, max: 50000, description: "Start time: 5-20 minutes. Refill available for 30 days." },
  { service: "test-tt-likes", name: "TikTok Video Likes", category: "Likes & Reactions", platform: "tiktok", refill: false, rate: 0.42, min: 50, max: 100000, description: "Delivery timing varies by order volume." },
  { service: "test-tg-members", name: "Telegram Channel Members", category: "Members", platform: "telegram", refill: true, rate: 2.25, min: 100, max: 25000, description: "Fast start. Refill available for 30 days." },
  { service: "test-fb-followers", name: "Facebook Page Followers", category: "Followers", platform: "facebook", refill: false, rate: 3.0, min: 100, max: 100000, description: "Start time: within 1 hour." },
  { service: "test-fb-likes", name: "Facebook Post Likes", category: "Likes & Reactions", platform: "facebook", refill: true, rate: 0.75, min: 50, max: 100000, description: "Refill available for 30 days." },
  { service: "test-ig-followers", name: "Instagram Followers", category: "Followers", platform: "instagram", refill: true, rate: 2.5, min: 100, max: 50000, description: "Start time: 10-30 minutes." },
  { service: "test-ig-views", name: "Instagram Reels Views", category: "Views", platform: "instagram", refill: false, rate: 0.15, min: 1000, max: 1000000, description: "Timing not provided by supplier." },
  { service: "test-yt-subs", name: "YouTube Subscribers", category: "Subscribers", platform: "youtube", refill: false, rate: 5.0, min: 100, max: 10000, description: "Public channels only." },
  { service: "test-yt-views", name: "YouTube Video Views", category: "Views", platform: "youtube", refill: false, rate: 0.5, min: 1000, max: 1000000, description: "Start time: 1-2 hours." },
  { service: "test-x-likes", name: "X Post Likes", category: "Likes & Reactions", platform: "other", refill: false, rate: 0.8, min: 50, max: 50000, description: "Timing not provided by supplier." },
  { service: "test-fb-comments", name: "Facebook Post Comments", category: "Comments", platform: "facebook", refill: false, rate: 4.0, min: 10, max: 5000, description: "Comments are delivered gradually." },
  { service: "test-tt-views", name: "TikTok Video Views", category: "Views", platform: "tiktok", refill: false, rate: 0.25, min: 1000, max: 1000000, description: "Instant start." },
  { service: "test-tg-views", name: "Telegram Post Views", category: "Views", platform: "telegram", refill: false, rate: 0.35, min: 1000, max: 1000000, description: "Start time: within 30 minutes." },
  { service: "test-ig-likes", name: "Instagram Post Likes", category: "Likes & Reactions", platform: "instagram", refill: false, rate: 0.7, min: 50, max: 100000, description: "Start time: 10-30 minutes." },
  { service: "test-x-followers", name: "X Followers", category: "Followers", platform: "other", refill: false, rate: 4.5, min: 100, max: 10000, description: "Timing not provided by supplier." },
];
const platformNames = { all: "All Platforms", tiktok: "TikTok", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };
const primaryPlatforms = Object.keys(platformNames).filter((id) => id !== "all");
const servicePlatforms = [
  { id: "all", name: platformNames.all, count: smmServices.length },
  ...primaryPlatforms.map((id) => ({ id, name: platformNames[id], count: smmServices.filter((item) => item.platform === id).length })),
  { id: "other", name: "Other Platforms", count: smmServices.filter((item) => !primaryPlatforms.includes(item.platform)).length },
];
const bodyOf = (req) => typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
const reply = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    let settings = await pm.state.get("public-storefront:settings") || seed;
    let orders = await pm.state.get("public-storefront:orders") || [];
    let smmOrders = await pm.state.get("public-storefront:smm-orders") || [];
    if (pathname === "/__control" && req.method === "POST") {
      const update = bodyOf(req);
      settings = { ...(update.reset ? seed : settings), ...update };
      if (update.reset) { orders = []; smmOrders = []; }
      await pm.state.set("public-storefront:settings", settings);
      await pm.state.set("public-storefront:orders", orders);
      await pm.state.set("public-storefront:smm-orders", smmOrders);
      reply(res, 200, { success: true, settings, orders: orders.length, smmOrders: smmOrders.length });
      return;
    }
    if (pathname === "/__state" && req.method === "GET") {
      reply(res, 200, { settings, orders, smmOrders });
      return;
    }
    if (pathname === "/api/smm/services" && req.method === "GET") {
      if (settings.catalogue === "unavailable") {
        reply(res, 503, { success: false, error: "Simulated catalogue unavailable", services: [] });
        return;
      }
      if (settings.catalogue === "html-error") {
        res.writeHead(502, { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" });
        res.end("<h1>Simulated catalogue error</h1>");
        return;
      }
      const params = new URL(req.url, "http://localhost").searchParams;
      const page = Math.max(1, Number(params.get("page")) || 1);
      const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 24));
      const platform = params.get("platform") || "all";
      const type = params.get("type") || "all";
      const category = params.get("category") || "All";
      const search = (params.get("search") || "").toLowerCase();
      const serviceType = (service) => {
        const details = `${service.name} ${service.category}`.toLowerCase();
        if (/follower|member|subscriber/.test(details)) return "followers";
        if (/like|reaction/.test(details)) return "likes";
        if (/view/.test(details)) return "views";
        if (/comment/.test(details)) return "comments";
        if (/share|save/.test(details)) return "shares";
        return "other";
      };
      let matched = smmServices.filter((service) => {
        const text = `${service.name} ${service.category} ${service.platform} ${service.description}`.toLowerCase();
        return (platform === "all" || service.platform === platform) &&
          (type === "all" || serviceType(service) === type) &&
          (category === "All" || service.category === category) && (!search || text.includes(search));
      });
      const sort = params.get("sort");
      if (sort === "price-low") matched = [...matched].sort((a, b) => a.rate - b.rate);
      else if (sort === "price-high") matched = [...matched].sort((a, b) => b.rate - a.rate);
      else if (sort === "name") matched = [...matched].sort((a, b) => a.name.localeCompare(b.name));
      const categories = ["All", ...new Set(smmServices.filter((service) => platform === "all" || service.platform === platform).map((service) => service.category))];
      const visible = matched.slice((page - 1) * limit, page * limit).map((service) => ({ ...service, serviceType: serviceType(service) }));
      reply(res, 200, {
        success: true,
        total: matched.length,
        catalogTotal: smmServices.length,
        platforms: servicePlatforms,
        categories,
        services: visible,
        pagination: { page, limit, total: matched.length, totalPages: Math.ceil(matched.length / limit) },
        source: "mongodb",
      });
      return;
    }
    if (pathname === "/api/smm/orders" && req.method === "POST") {
      const body = bodyOf(req);
      if (settings.smmOrder === "unavailable") {
        reply(res, 503, { success: false, error: "Simulated checkout unavailable" });
        return;
      }
      const service = smmServices.find((item) => item.service === String(body.serviceId || ""));
      const quantity = Number(body.quantity);
      let target;
      try { target = new URL(String(body.link || "")); } catch { target = null; }
      if (!service || !target || !["http:", "https:"].includes(target.protocol) ||
        !Number.isSafeInteger(quantity) || quantity < service.min || quantity > service.max ||
        !["aba_payway_v2", "khqr"].includes(body.paymentMethod)) {
        reply(res, 400, { success: false, error: "Invalid simulated order" });
        return;
      }
      const amount = Math.max(0.1, Math.ceil((service.rate * quantity / 1000) * 100) / 100);
      const orderNumber = `SIM-SMM-${String(smmOrders.length + 1).padStart(4, "0")}`;
      const transactionId = `SIM-TXN-${orderNumber}`;
      const order = { orderNumber, transactionId, serviceId: service.service, serviceName: service.name, link: target.href, quantity, amount, paymentMethod: body.paymentMethod, paymentStatus: "PENDING", fulfillmentStatus: "NOT_STARTED", createdAt: new Date().toISOString() };
      smmOrders.push(order);
      await pm.state.set("public-storefront:smm-orders", smmOrders);
      const qrData = body.paymentMethod === "aba_payway_v2"
        ? { transactionId, qrString: `SIMULATED-KHQR-${orderNumber}-${amount.toFixed(2)}`, qrImage: null, qrPngUrl: null, payUrl: null, deepLink: null, expireInSec: 180 }
        : null;
      reply(res, 200, {
        success: true, orderNumber, transactionId, amount, currency: "USD", paymentStatus: "PENDING",
        checkoutUrl: body.paymentMethod === "khqr" ? "http://127.0.0.1:3011/simulated-checkout" : "",
        qrData, serviceName: service.name, quantity,
      });
      return;
    }
    if (pathname === "/api/payment/vngzz2/check" && req.method === "POST") {
      const body = bodyOf(req);
      const order = smmOrders.find((item) => item.orderNumber === body.orderNumber && item.transactionId === body.transactionId);
      if (!order) { reply(res, 404, { success: false, error: "Order not found" }); return; }
      if (settings.paid) order.paymentStatus = "PAID";
      await pm.state.set("public-storefront:smm-orders", smmOrders);
      reply(res, 200, { success: true, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, isPaid: order.paymentStatus === "PAID" });
      return;
    }
    if (pathname === "/api/orders/track" && req.method === "GET") {
      const query = new URL(req.url, "http://localhost").searchParams.get("query") || "";
      const matchedSmmOrders = smmOrders
        .filter((order) => order.orderNumber.toLowerCase() === query.toLowerCase() || order.link === query)
        .map((order) => ({
          orderNumber: order.orderNumber,
          gameName: "Social Media Service",
          packageName: `${order.serviceName} (${order.quantity.toLocaleString()} units)`,
          playerId: order.link,
          serverId: null,
          playerName: null,
          amount: order.amount,
          currency: "USD",
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.paymentStatus === "PAID" ? "PROCESSING" : "NOT_STARTED",
          createdAt: order.createdAt,
        }));
      reply(res, 200, { success: true, orders: matchedSmmOrders });
      return;
    }
    if (pathname === "/khqrcc-plugin.js" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Access-Control-Allow-Origin": "*" });
      // The external SDK interface is documented by src/lib/khqrPlugin.ts.
      // The real SakSuuu wrapper still opens/closes the dialog and verifies status.
      res.end(`window.KhqrPayway = {
        openCheckout: function(options) {
          var panel = document.createElement('div'); panel.id = 'khqr-checkout';
          panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Simulated KHQR checkout');
          Object.assign(panel.style, {position:'fixed',inset:'120px 16px 40px',zIndex:'1000',background:'#fff',padding:'24px',border:'1px solid #BAE6FD',borderRadius:'12px'});
          var label = document.createElement('p'); label.textContent = 'Local simulation — no real payment'; panel.appendChild(label);
          var button = document.createElement('button'); button.type = 'button'; button.id = 'simulation-confirm-payment'; button.textContent = 'Confirm simulated payment'; button.onclick = function() { if(options.onSuccess) options.onSuccess({simulation:true}); }; panel.appendChild(button);
          document.body.appendChild(panel);
        },
        closeCheckout: function() {},
        _doClose: function() { var panel=document.getElementById('khqr-checkout'); if(panel) panel.remove(); }
      };`);
      return;
    }
    if (pathname === "/api/player/verify" && req.method === "POST") {
      const body = bodyOf(req);
      if (!body.userId || !(body.code || body.slug)) {
        reply(res, 400, { success: false, message: "Please enter your Player ID to verify" });
        return;
      }
      await wait(settings.delay);
      if (settings.verification === "invalid") {
        reply(res, 400, { success: false, isInvalidId: true, message: "TEST_INTERNAL_SECRET_DO_NOT_SHOW" });
      } else if (settings.verification === "unavailable") {
        reply(res, 200, { success: false, isUnavailable: true, message: "TEST_INTERNAL_SECRET_DO_NOT_SHOW" });
      } else if (settings.verification === "html-error") {
        res.writeHead(502, { "Content-Type": "text/html" });
        res.end("<h1>TEST_INTERNAL_SECRET_DO_NOT_SHOW</h1>");
      } else {
        reply(res, 200, { success: true, playerName: "Toast Test Player" });
      }
      return;
    }
    if (pathname === "/api/payment/anajakpay/create" && req.method === "POST") {
      const body = bodyOf(req);
      if (!body.gameSlug || !body.supplier || !body.supplierProductCode || !body.playerId) {
        reply(res, 400, { success: false, error: "Missing required fields" });
        return;
      }
      await wait(settings.delay);
      if (settings.checkout === "json-error") {
        reply(res, 503, { success: false, error: "TEST_INTERNAL_SECRET_DO_NOT_SHOW" });
        return;
      }
      if (settings.checkout === "html-error") {
        res.writeHead(502, { "Content-Type": "text/html" });
        res.end("<h1>TEST_INTERNAL_SECRET_DO_NOT_SHOW</h1>");
        return;
      }
      const number = String(orders.length + 1).padStart(4, "0");
      const order = {
        id: `SAK-TOAST-TEST-${number}`,
        orderNumber: `SAK-TOAST-TEST-${number}`,
        transactionId: `TXN-TOAST-TEST-${number}`,
        checkoutUrl: "http://127.0.0.1:3011/simulated-checkout",
        gameName: "Mobile Legends",
        gameSlug: body.gameSlug,
        packageName: "Simulation package",
        supplierProductCode: body.supplierProductCode,
        playerId: body.playerId,
        serverId: body.serverId,
        playerName: body.playerName,
        amount: body.expectedPrice || 1.99,
        currency: "USD",
        paymentMethod: "khqr",
        paymentStatus: "PENDING",
        fulfillmentStatus: "NOT_STARTED",
        createdAt: "2026-10-16T00:00:00.000Z",
      };
      orders.push(order);
      await pm.state.set("public-storefront:orders", orders);
      reply(res, 200, { success: true, orderNumber: order.orderNumber, transactionId: order.transactionId, checkoutUrl: order.checkoutUrl, amount: order.amount, currency: order.currency });
      return;
    }
    if (pathname === "/api/payment/anajakpay/check" && req.method === "POST") {
      const body = bodyOf(req);
      const order = orders.find((entry) => entry.orderNumber === body.orderNumber && entry.transactionId === body.transactionId);
      if (!order) { reply(res, 404, { success: false, error: "Order not found" }); return; }
      if (settings.paid) {
        order.paymentStatus = "PAID";
        order.fulfillmentStatus = "PROCESSING";
        await pm.state.set("public-storefront:orders", orders);
      }
      reply(res, 200, { success: true, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus });
      return;
    }
    if (pathname.startsWith("/api/orders/") && req.method === "GET") {
      const id = decodeURIComponent(pathname.slice("/api/orders/".length));
      const order = orders.find((entry) => entry.orderNumber === id || entry.transactionId === id);
      reply(res, order ? 200 : 404, order ? { success: true, order } : { success: false, error: "Order not found" });
      return;
    }
    reply(res, 501, { success: false, error: "Endpoint outside this notification simulation" });
  } catch {
    reply(res, 500, { success: false, error: "Simulation handler failed" });
  }
}).listen(process.env.PORT);
