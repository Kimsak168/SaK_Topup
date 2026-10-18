// Synthetic response fixtures; no provider account, money, or orders are used.
/* eslint-disable @typescript-eslint/no-require-imports -- Postman executes mock handlers as CommonJS. */
const http = require("node:http");
const crypto = require("node:crypto");

http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/test-profile/payment-gateway/v1/payments/check-transv2-khqrcc") {
    res.writeHead(501).end();
    return;
  }
  const fields = new URLSearchParams(req.body || "");
  const transactionId = fields.get("transaction_id");
  const expectedHash = crypto.createHash("sha1").update(`test-secret${transactionId}`).digest("hex");
  if (fields.get("hash") !== expectedHash || !req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ responseCode: 1, message: "Invalid request signature or content type" }));
    return;
  }
  const cases = {
    "TXN-paid": { responseCode: 0, status: "paid", amount: "9.25" },
    "TXN-nested": { responseCode: "0", data: { status: "success", amount: 9.25 } },
    "TXN-pending": { responseCode: 0, status: "pending" },
    "TXN-missing": { responseCode: 0, status: "paid" },
    "TXN-invalid": { responseCode: 0, status: "paid", amount: "9.25USD" },
    "TXN-code": { responseCode: "0invalid", status: "paid", amount: "9.25" },
    "TXN-http-error": { responseCode: 0, status: "paid", amount: "9.25" },
  };
  const body = cases[transactionId] || { responseCode: 1, message: "Transaction not found" };
  res.writeHead(transactionId === "TXN-http-error" ? 500 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(process.env.PORT);
