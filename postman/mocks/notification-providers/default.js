// Local fixtures only. Payment envelopes follow the supplier's public example;
// game responses exercise the existing adapter shape (the public spec omits it).
const http = require("node:http");
const messages = [];
const requests = [];
let nextTelegramId = 1;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.local");
  let input = "";
  for await (const chunk of req) input += chunk;
  let body = {};
  try { body = JSON.parse(input || "{}"); } catch { body = Object.fromEntries(new URLSearchParams(input)); }
  const reply = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  requests.push({ method: req.method, path: url.pathname, body });
  if (url.pathname === "/test/state") return reply(200, { messages, requests });
  if (url.pathname === "/test/reset") { messages.length = 0; requests.length = 0; return reply(200, { ok: true }); }
  if (url.pathname.endsWith("/check_transaction")) {
    const id = body.transaction_id || "";
    if (id.includes("unavailable")) return reply(503, { success: false, message: "Provider temporarily unavailable" });
    if (id.includes("slow")) { const timer = setTimeout(() => reply(200, { success: true, data: { state: "PENDING" } }), 15000); req.on("close", () => clearTimeout(timer)); return; }
    const state = id.includes("success") || id.includes("wrong") ? "PAID" : id.includes("failed") ? "FAILED" : id.includes("expired") ? "EXPIRED" : "PENDING";
    return reply(200, { success: true, data: { state, is_paid: state === "PAID", code: "00", transaction_id: id.includes("wrongref") ? "other" : id, amount: id.includes("wrongamount") ? "999.00" : "2.00", currency: id.includes("wrongcurrency") ? "KHR" : "USD" } });
  }
  if (url.pathname.includes("check-transv2-khqrcc")) {
    const id = body.transaction_id || "";
    if (id.includes("unavailable")) return reply(503, { responseCode: 1, responseMessage: "Unavailable" });
    return reply(200, { responseCode: 0, status: id.includes("success") ? "paid" : id.includes("failed") ? "failed" : id.includes("expired") ? "expired" : "pending", amount: "2.00" });
  }
  if (url.pathname.endsWith("/game/create_order")) return reply(200, { success: true, data: { order_id: body.reference, reference: body.reference, order_status: "completed" } });
  if (url.pathname.endsWith("/game/check_order")) {
    const reference = url.searchParams.get("reference") || "";
    if (reference.includes("unavailable")) return reply(503, { success: false, message: "Unavailable" });
    return reply(200, { success: true, data: { order_id: reference, reference, order_status: reference.includes("deliverysuccess") ? "completed" : reference.includes("deliveryfailed") ? "failed" : "pending", message: "Supplier confirmed outcome" } });
  }
  if (url.pathname.endsWith("/getMe")) {
    return reply(200, { ok: true, result: { id: 7123456789, is_bot: true, first_name: "SakSuu Top-Up Bot", username: "SakSuuBot" } });
  }
  if (url.pathname.endsWith("/getChat")) {
    const chatId = url.searchParams.get("chat_id") || "";
    if (chatId.includes("invalid") || chatId.includes("403")) {
      return reply(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
    }
    return reply(200, { ok: true, result: { id: chatId || -1001234567890, title: "SakSuu", type: "supergroup" } });
  }
  if (url.pathname.endsWith("/getWebhookInfo")) {
    return reply(200, { ok: true, result: { url: "", has_custom_certificate: false, pending_update_count: 0 } });
  }
  if (url.pathname.endsWith("/sendMessage") || url.pathname.endsWith("/sendPhoto")) {
    let text = body.text || body.caption || "";
    let chatId = body.chat_id;
    if (!text && typeof input === "string") {
      const matchCaption = input.match(/name="caption"\r?\n\r?\n([\s\S]*?)\r?\n--/);
      if (matchCaption) text = matchCaption[1];
      const matchChatId = input.match(/name="chat_id"\r?\n\r?\n([\s\S]*?)\r?\n--/);
      if (matchChatId) chatId = matchChatId[1];
    }
    messages.push({ ...body, text, chat_id: chatId || body.chat_id });
    if (text.includes("TG429")) return reply(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 2 } });
    if (text.includes("TG503")) return reply(503, { ok: false, error_code: 503, description: "Unavailable" });
    if (text.includes("TG403")) return reply(403, { ok: false, error_code: 403, description: "Forbidden" });
    return reply(200, { ok: true, result: { message_id: nextTelegramId++ } });
  }
  return reply(501, { error: "Fixture does not model this endpoint" });
});
if (require.main === module) server.listen(Number(process.env.PORT || 4510), "127.0.0.1");
module.exports = server;
