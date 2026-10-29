// Public catalogue shapes captured on 2026-10-26. Purchase responses below are
// contract fixtures: no real provider orders or balances are used.
// Postman handlers run as CommonJS, including in ESM applications.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require("node:http");
const categories = [
  { game_code: "freefire_sgmy", name: "Free fire ( KH/MY/SG )", image_url: "/storage/v1/object/public/images/freefire.webp", game_fields: ["userid"] },
  { game_code: "mlbb", name: "Mobile Legends", game_fields: ["userid", "serverid"] },
  { game_code: "ragnarok_origin", name: "Ragnarok Origin", game_fields: ["userid", "serverid", "charname"] },
];
const products = [
  { product_code: "MLBB_55", name: "55", sell_price: 0.76, cost_price: 0.75, price: 0.76, status: "active" },
  { product_code: "MLBB_86", name: "86", sell_price: 1.25, cost_price: 1.23, price: 1.25, status: "inactive" },
];
const attempts = new Map();
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (!req.headers["x-api-key"]) return reply(401, { success: false, code: "UNAUTHORIZED", message: "API key or signed-in session required" });
  const prefix = "/api/v1/game";
  if (req.method === "GET" && url.pathname === `${prefix}/categories`) return reply(200, { status: "success", total: categories.length, categories });
  if (req.method === "GET" && url.pathname === `${prefix}/products`) {
    const code = url.searchParams.get("game_code");
    attempts.set(code, (attempts.get(code) || 0) + 1);
    if (code === "server-error") { res.writeHead(503, { "Content-Type": "text/html" }); return res.end("<h1>Upstream unavailable</h1>"); }
    if (code === "slow") await new Promise(resolve => setTimeout(resolve, 500));
    if (code === "rate-limit" && attempts.get(code) % 2 === 1) { res.setHeader("Retry-After", "0.1"); return reply(429, { success: false, code: "RATE_LIMITED" }); }
    return reply(200, { status: "success", game: { game_code: code === "mismatch" ? "other-game" : code }, products: code === "malformed" ? {} : products });
  }
  if (req.method === "POST" && url.pathname === `${prefix}/create_order`) {
    let body = req.body;
    if (!body) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try { body = JSON.parse(raw); } catch { return reply(400, { success: false, code: "INVALID_JSON" }); }
    }
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return reply(400, { success: false, code: "INVALID_JSON" }); }
    }
    if (![body.product_code, body.game_user_id, body.reference].every(value => typeof value === "string" && value.trim())) return reply(400, { success: false, code: "INVALID_ORDER" });
    const orders = (await pm.state.get("vngzz2.orders")) || {};
    if (orders[body.reference]) {
      if (orders[body.reference].product_code !== body.product_code || orders[body.reference].game_user_id !== body.game_user_id || orders[body.reference].game_zone_id !== body.game_zone_id) return reply(409, { success: false, code: "REFERENCE_CONFLICT" });
      return reply(200, { status: "success", order: orders[body.reference] });
    }
    const order = { ...body, order_id: `mock-${body.reference}`, status: body.reference.startsWith("pending-") ? "success" : "completed" };
    orders[body.reference] = order;
    await pm.state.set("vngzz2.orders", orders);
    return reply(200, { status: "success", order });
  }
  if (req.method === "GET" && url.pathname === `${prefix}/check_order`) {
    const order = ((await pm.state.get("vngzz2.orders")) || {})[url.searchParams.get("reference")];
    return order ? reply(200, { status: "success", order }) : reply(404, { success: false, code: "ORDER_NOT_FOUND" });
  }
  return reply(501, { success: false, code: "NOT_MODELED" });
}).listen(process.env.PORT || 4500);
