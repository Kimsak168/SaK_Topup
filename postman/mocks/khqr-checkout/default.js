// Local frontend fixture based on this repository's checkout/check response
// contract. Deliberately invalid account and CRC: never a payable KHQR.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman executes mock handlers as CommonJS.
const http = require("node:http");
let settings = { status: "PENDING", expireInSec: 180, qrMode: "string", checkHttpStatus: 200, delayMs: 0 };
let sequence = 0;
let activeChecks = 0;
let maxActiveChecks = 0;
const requests = [];
const field = (tag, value) => tag + String(value.length).padStart(2, "0") + value;
http.createServer(async (req, res) => {
  let body = req.body;
  if (body === undefined) {
    let input = "";
    for await (const chunk of req) input += chunk;
    body = input || "{}";
  }
  try { if (typeof body === "string") body = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
  const path = new URL(req.url, "http://fixture.local").pathname;
  const reply = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  if (path === "/__control") { settings = { ...settings, ...body }; maxActiveChecks = activeChecks; return reply(200, settings); }
  if (path === "/__state") return reply(200, { requests, activeChecks, maxActiveChecks });
  requests.push({ path, method: req.method, body });
  if (path === "/api/player/verify") return reply(200, { success: true, status: "success", playerName: "Preview Player", nickname: "Preview Player" });
  if (path === "/api/payment/vngzz2/create") {
    sequence++;
    const amount = body.expectedPrice || 0.54;
    const qrString = field("00", "01") + field("01", "12") + field("29", field("00", "preview@invalid")) + field("52", "5999") + field("53", "840") + field("54", Number(amount).toFixed(2)) + field("58", "KH") + field("59", "ASURA STORE QA") + field("60", "Phnom Penh") + field("63", "0000");
    return reply(200, {
      success: true, orderNumber: `KHQR-UI-${sequence}`, transactionId: `TEST-ONLY-${sequence}`,
      amount, currency: "USD", state: "PENDING", expireInSec: settings.expireInSec,
      qrString: settings.qrMode === "string" ? qrString : null,
      qrImage: settings.qrMode === "image" ? 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="white" d="M0 0h100v100H0z"/><path d="M10 10h80v80H10z"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="12">TEST ONLY</text></svg>') : null,
      deepLink: null, payUrl: null, isSandbox: true,
    });
  }
  if (path === "/api/payment/vngzz2/check") {
    activeChecks++; maxActiveChecks = Math.max(maxActiveChecks, activeChecks);
    const current = { ...settings };
    if (current.delayMs) await new Promise(resolve => setTimeout(resolve, current.delayMs));
    activeChecks--;
    return reply(current.checkHttpStatus, { success: current.checkHttpStatus === 200, paymentStatus: current.status, isPaid: current.status === "PAID", fulfillmentStatus: "PROCESSING" });
  }
  return reply(501, { success: false, error: "Route is not part of the KHQR UI fixture" });
}).listen(Number(process.env.PORT || 4515), "127.0.0.1");
