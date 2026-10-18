/* eslint-disable @typescript-eslint/no-require-imports -- Postman runs CommonJS handlers. */
const http = require("node:http");

// Local fixtures mirror public route response shapes; they never call suppliers,
// MongoDB, or the payment provider. Control endpoints exist only in this mock.
const seed = { verification: "success", checkout: "success", paid: false, delay: 650 };
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
    if (pathname === "/__control" && req.method === "POST") {
      const update = bodyOf(req);
      settings = { ...(update.reset ? seed : settings), ...update };
      if (update.reset) orders = [];
      await pm.state.set("public-storefront:settings", settings);
      await pm.state.set("public-storefront:orders", orders);
      reply(res, 200, { success: true, settings, orders: orders.length });
      return;
    }
    if (pathname === "/__state" && req.method === "GET") {
      reply(res, 200, { settings, orders });
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
