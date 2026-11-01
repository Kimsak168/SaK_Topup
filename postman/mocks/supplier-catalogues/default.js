// Catalogue envelopes follow authenticated read-only provider responses.
// Values and identities are fictional. Purchase routes are deliberately absent.
const http = require("node:http");
let mode = "valid";
const requests = [];
const product = (id, name, game, region, price_cents = 100) => ({ id, name, game, region, price_cents, currency: "USD", orderable: true });
const products = [
  product("fixture-ff-kh", "100", "Free Fire KHSGMY", "KH/SG/MY"),
  product("fixture-ff-tw", "100", "Free Fire TW", "TW"),
  product("fixture-mlbb-kh", "55", "Mobile Legends", "Cambodia / Other", 76),
  product("fixture-mlbb-global", "86", "Mobile Legends Global", "ID/PH/CIS/Other", 110),
  product("fixture-mc-global", "50", "Magic Chess Gogo", "Global"),
  product("fixture-mc-my", "50", "Magic Chess Gogo Malaysia", "MY"),
  product("fixture-blood-global", "100", "Blood Strike", "Global"),
  product("fixture-blood-mena", "100", "Blood Strike MENA", "MENA"),
  product("fixture-hok", "80", "Honor of Kings", "Global", 88),
];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.local");
  const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  requests.push({ method: req.method, path: url.pathname });
  if (url.pathname === "/test/mode") { mode = url.searchParams.get("value") || "valid"; return reply(200, { mode }); }
  if (url.pathname === "/test/state") return reply(200, { requests });
  if (req.method !== "GET") return reply(501, { error: "This fixture supports catalogue reads only" });
  if (url.pathname === "/webbuilder/products") {
    if (req.headers.authorization !== "Bearer catalogue-simulation-key") return reply(401, { error: "Wrong fixture authorization" });
    if (mode === "malformed") return reply(200, { unexpected: [] });
    if (mode === "duplicate") return reply(200, [products[0], products[0]]);
    if (mode === "incomplete") return reply(200, { total: 100, products });
    if (mode === "empty") return reply(200, []);
    if (mode === "unavailable") return reply(503, { message: "Fixture unavailable" });
    return reply(200, { data: products });
  }
  if (url.pathname.startsWith("/vngzz2/api/v1/game/")) {
    if (req.headers["x-api-key"] !== "catalogue-simulation-key") return reply(401, { success: false });
    if (url.pathname.endsWith("/categories")) return reply(200, { success: true, total: 2,
      categories: ["mlbb", "freefire_sgmy"].map(game_code => ({ game_code, name: game_code, game_fields: ["userid", "serverid"] })) });
    if (url.pathname.endsWith("/products")) {
      const game_code = url.searchParams.get("game_code");
      return reply(200, { success: true, game: { game_code }, total: mode === "incomplete" ? 3 : 1,
        products: [{ product_code: "shared-product", name: "55", sell_price: "0.76", cost_price: "0.20", currency: "USD", status: "active", orderable: true }] });
    }
  }
  return reply(501, { error: "Fixture does not model this endpoint" });
});
server.listen(Number(process.env.PORT || 4903), "127.0.0.1");
module.exports = server;
