import test from "node:test";
import assert from "node:assert/strict";
import { loadTestModules } from "../lib/load-test-module.mjs";

const load = loadTestModules({
  "server-only": {},
});

const {
  formatManualFulfillmentMessage,
  cleanFulfillmentErrorReason,
} = load("src/lib/notifications/telegramFormat.ts");

const {
  sendTelegramManualFulfillmentAlert,
} = load("src/lib/services/telegramNotificationService.ts");

test("cleanFulfillmentErrorReason standardizes balance and stock errors", () => {
  assert.equal(cleanFulfillmentErrorReason("409 Conflict: Insufficient reseller balance"), "Insufficient balance");
  assert.equal(cleanFulfillmentErrorReason("Insufficient balance"), "Insufficient balance");
  assert.equal(cleanFulfillmentErrorReason("Product is out of stock"), "Out of stock");
  assert.equal(cleanFulfillmentErrorReason("Account spending limit reached"), "Account spending limit reached");
  assert.equal(cleanFulfillmentErrorReason("Random gateway error"), "Random gateway error");
});

test("formatManualFulfillmentMessage matches the exact template requested by user", () => {
  const message = formatManualFulfillmentMessage({
    orderNumber: "GWN-96209459",
    playerId: "19995148",
    serverId: "3204",
    playerName: "Mai_TenK",
    gameName: "MOBILE LEGEND",
    packageName: "55 Diamonds",
    amount: 0.89,
    transactionId: "TXN-ABA-REF-12345",
    reason: "Insufficient reseller balance",
  });

  assert.ok(message.includes("Manual Fulfillment"));
  assert.ok(message.includes("Order ID: <code>GWN-96209459</code>"));
  assert.ok(message.includes("ID: <code>19995148</code>"));
  assert.ok(message.includes("Zone: <code>3204</code>"));
  assert.ok(message.includes("IGN: <code>Mai_TenK</code>"));
  assert.ok(message.includes("Game: MOBILE LEGEND"));
  assert.ok(message.includes("Package: 55 Diamonds"));
  assert.ok(message.includes("Price: $0.89"));
  assert.ok(message.includes("ABA: <code>TXN-ABA-REF-12345</code>"));
  assert.ok(message.includes("Reason: Insufficient balance"));
});

test("formatManualFulfillmentMessage omits Zone if not provided", () => {
  const message = formatManualFulfillmentMessage({
    orderNumber: "ASURA-123456",
    playerId: "987654321",
    playerName: "FreeFirePlayer",
    gameName: "Free Fire",
    packageName: "100 Diamonds",
    amount: 1.50,
    transactionId: "TXN-FF-001",
    reason: "Out of stock",
  });

  assert.ok(message.includes("Manual Fulfillment"));
  assert.ok(message.includes("Order ID: <code>ASURA-123456</code>"));
  assert.ok(message.includes("ID: <code>987654321</code>"));
  assert.ok(!message.includes("Zone:"), "Should not include Zone line if no serverId");
  assert.ok(message.includes("Reason: Out of stock"));
});

test("sendTelegramManualFulfillmentAlert sends HTML payload to Telegram bot", async () => {
  let capturedUrl = "";
  let capturedBody = null;

  const mockFetcher = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 8888 } }),
    };
  };

  const env = {
    TELEGRAM_BOT_TOKEN: "mock-bot-token",
    TELEGRAM_ADMIN_CHAT_ID: "-100123456789",
    TELEGRAM_TOPIC_FAILED: "42",
  };

  const result = await sendTelegramManualFulfillmentAlert(
    {
      orderNumber: "GWN-96209459",
      playerId: "19995148",
      serverId: "3204",
      playerName: "Mai_TenK",
      gameName: "MOBILE LEGEND",
      packageName: "55 Diamonds",
      amount: 0.89,
      transactionId: "CznSgoXakbvgAnizfbhLQrSDkBzEf90RrRtps1NTB4QjDTWoIsJn7GQwZ8Uy9TotoWg8cQkLMEyQbIMyQEqXOso8yL1RWzV9D_NIv0LJBabJjFnbrFnpnXpXHimY68wsEDK6feiBCAF5UFI2XxUxSMDLfeyeVzQab-YAKAeENXR2cB7J9ns4LPg2164mz3Egy4mR-zR3Azc",
      reason: "Insufficient balance",
    },
    mockFetcher,
    env
  );

  assert.equal(result.ok, true);
  assert.equal(result.messageId, "8888");
  assert.equal(capturedUrl, "https://api.telegram.org/botmock-bot-token/sendMessage");
  assert.equal(capturedBody.chat_id, "-100123456789");
  assert.equal(capturedBody.message_thread_id, 42);
  assert.equal(capturedBody.parse_mode, "HTML");
  assert.ok(capturedBody.text.includes("Manual Fulfillment"));
  assert.ok(capturedBody.text.includes("Order ID: <code>GWN-96209459</code>"));
  assert.ok(capturedBody.text.includes("Price: $0.89"));
  assert.ok(capturedBody.text.includes("Reason: Insufficient balance"));
});
