import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { loadTestModules } from "./lib/load-test-module.mjs";

const require = createRequire(import.meta.url);
let mongo, fixture, base, load, Order, Payment, worker, payments, fulfillment;
const env = { NODE_ENV: "test", VNGZZ2_PRIMARY_API_KEY: "fixture-key", TELEGRAM_BOT_TOKEN: "fixture-token", TELEGRAM_ADMIN_CHAT_ID: "1234567", VNGZZ2_PAYMENT_WEBHOOK_SECRET: "fixture-signing-secret", CRON_SECRET: "fixture-cron-secret" };

before(async () => {
  base = process.env.NOTIFICATION_SIMULATION_URL;
  if (!base) {
    fixture = require("../postman/mocks/notification-providers/default.js");
    await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${fixture.address().port}`;
  }
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: resolve("node_modules/.cache/mongodb-memory-server") }, instance: { dbName: "notification_tests" } });
  await mongoose.connect(mongo.getUri(), { dbName: "notification_tests", autoIndex: false });
  Object.assign(env, { VNGZZ2_PAYMENT_BASE_URL: `${base}/vng`, VNGZZ2_GAME_BASE_URL: `${base}/vng` });
  load = loadTestModules({ "next/server": { ...require("next/server"), after() {} }, "@/lib/mongodb": { connectDB: async () => mongoose } }, {
    process: { env },
    fetch: (url, options) => fetch(String(url).replace("https://api.telegram.org", `${base}/telegram`), options),
  });
  ({ Order } = load("src/models/Order.ts"));
  ({ Payment } = load("src/models/Payment.ts"));
  await Order.createIndexes();
  await Payment.createIndexes();
  worker = load("src/lib/services/telegramOutboxService.ts");
  payments = load("src/lib/services/paymentReconciliationService.ts");
  fulfillment = load("src/lib/services/fulfillmentService.ts");
});

after(async () => { await mongoose.disconnect(); await mongo?.stop(); if (fixture) await new Promise(resolve => fixture.close(resolve)); });
beforeEach(async () => {
  // This database is created by MongoMemoryServer above, never from .env.local.
  await mongoose.connection.dropDatabase();
  await Order.createIndexes();
  await Payment.createIndexes();
  await fetch(`${base}/test/reset`, { method: "POST" });
});

async function createOrder(scenario = "pending", fields = {}) {
  return Order.create({ orderNumber: `ORD-${scenario}-${randomUUID()}`, gameSlug: "mlbb", gameName: "Mobile Legends", packageName: "55 Diamonds", supplier: "vngzz2", supplierProductCode: "MLBB_55", playerId: "123456", serverId: "789", customerName: "Test Customer", amount: 2, currency: "USD", paymentMethod: "aba_payway_v2", paymentGateway: "aba_payway_v2", transactionId: `TXN-${scenario}-${randomUUID()}`, paymentStatus: "PENDING", fulfillmentStatus: "NOT_STARTED", ...fields });
}
async function history(orderNumber) { return (await Order.findOne({ orderNumber }).lean()).telegramNotifications; }
async function sendEvent(orderNumber, kind, status) {
  const event = (await history(orderNumber)).find(event => event.kind === kind && event.status === status);
  assert.ok(event, `${kind} ${status} was atomically queued`);
  assert.equal(await worker.dispatchTelegramNotificationEvent(orderNumber, event.eventId), "sent");
  const state = await (await fetch(`${base}/test/state`)).json();
  const message = state.messages.at(-1);
  assert.equal(message.chat_id, env.TELEGRAM_ADMIN_CHAT_ID);
  assert.match(message.text, new RegExp(`${kind} ${status}`));
  assert.ok(message.text.includes("Order ID:"), "Order ID:");
  assert.ok(message.text.includes("Customer name:"), "Customer name:");
  assert.ok(message.text.includes("Game:"), "Game:");
  assert.ok(message.text.includes("Amount:"), "Amount:");
  assert.ok(message.text.includes("Payment method:"), "Payment method:");
  assert.ok(message.text.includes("Date and time:"), "Date and time:");
  if (kind === "ORDER") {
    assert.ok(message.text.includes("Package:"), "Package:");
    assert.ok(message.text.includes("Player ID:"), "Player ID:");
    assert.ok(message.text.includes("Supplier:"), "Supplier:");
    if (status === "SUCCESS") {
      assert.ok(message.text.includes("Supplier Order ID:"), "Supplier Order ID:");
    }
    if (status === "FAILED") {
      assert.ok(message.text.includes("Error reason:"), "Error reason:");
    }
  } else if (kind === "PAYMENT") {
    if (status === "SUCCESS") {
      assert.ok(message.text.includes("Transaction ID:"), "Transaction ID:");
    }
    if (status === "FAILED") {
      assert.ok(message.text.includes("Error reason:"), "Error reason:");
    }
  }
  const saved = (await history(orderNumber)).find(candidate => candidate.eventId === event.eventId);
  assert.equal(saved.state, "sent"); assert.equal(saved.attempts[0].outcome, "sent"); assert.ok(saved.telegramMessageId);
}

for (const [kind, status] of [["PAYMENT", "PENDING"], ["PAYMENT", "SUCCESS"], ["PAYMENT", "FAILED"], ["ORDER", "PENDING"], ["ORDER", "SUCCESS"], ["ORDER", "FAILED"]]) {
  test(`${kind} ${status}: verified transition, formatted admin message and durable history`, async () => {
    const scenario = kind === "PAYMENT" ? status.toLowerCase() : status === "SUCCESS" ? "deliverysuccess" : status === "FAILED" ? "deliveryfailed" : "pending";
    const order = await createOrder(scenario, kind === "ORDER" && status !== "PENDING" ? { transactionId: `TXN-success-${randomUUID()}` } : {});
    if (kind === "PAYMENT" && status !== "PENDING") await payments.reconcileOrderPayment(order.orderNumber, false);
    if (kind === "ORDER" && status !== "PENDING") {
      await payments.reconcileOrderPayment(order.orderNumber, false);
      const accepted = await fulfillment.triggerAutomaticFulfillment(order.orderNumber);
      assert.equal(accepted.fulfillmentStatus, "processing", "submission claiming completed is not proof of delivery");
      assert.equal((await history(order.orderNumber)).some(e => e.kind === "ORDER" && e.status === "SUCCESS"), false);
      await fulfillment.reconcileSupplierFulfillment(order.orderNumber);
    }
    await sendEvent(order.orderNumber, kind, status);
  });
}

test("pending with code 00, network failures, expiry and late settlement keep payment separate from delivery", async () => {
  for (const scenario of ["pending", "unavailable"]) {
    const order = await createOrder(scenario);
    await payments.reconcileOrderPayment(order.orderNumber, false).catch(() => {});
    assert.equal((await Order.findById(order._id)).paymentStatus, "PENDING");
    assert.equal((await history(order.orderNumber)).length, 2);
  }
  const expired = await createOrder("expired");
  await payments.reconcileOrderPayment(expired.orderNumber, false);
  assert.equal((await history(expired.orderNumber)).at(-1).status, "EXPIRED");
  assert.equal((await history(expired.orderNumber)).some(e => e.status === "FAILED"), false);
  // Test the documented late-payment transition using the same transaction.
  const provider = loadTestModules({ "@/models/Order": { Order }, "@/models/Payment": { Payment }, "@/lib/services/fulfillmentService": {}, "@/lib/services/vngzzPayWayService": { checkVngZz2Transaction: async id => ({ success: true, state: "PAID", transactionId: id, amount: 2, currency: "USD" }) } });
  await provider("src/lib/services/paymentReconciliationService.ts").reconcileOrderPayment(expired.orderNumber, false);
  assert.equal((await Order.findById(expired._id)).paymentStatus, "PAID");
  assert.equal((await Order.findById(expired._id)).fulfillmentStatus, "NOT_STARTED");
});

test("mismatched provider amount, currency or transaction never create SUCCESS", async () => {
  for (const scenario of ["wrongamount", "wrongcurrency", "wrongref"]) {
    const order = await createOrder(scenario);
    await assert.rejects(payments.reconcileOrderPayment(order.orderNumber, false));
    assert.equal((await Order.findById(order._id)).paymentStatus, "PENDING");
  }
});

test("concurrent callbacks persist exactly one payment transition and one supplier submission", async () => {
  const order = await createOrder("success");
  const { POST } = load("src/app/api/payment/vngzz2/webhook/route.ts");
  const rawBody = JSON.stringify({ transaction_id: order.transactionId, state: "PENDING" });
  const signature = createHmac("sha256", env.VNGZZ2_PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const responses = await Promise.all(Array.from({ length: 8 }, () => POST(new Request("http://localhost/hook", { method: "POST", body: rawBody, headers: { "x-signature": signature } }))));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await history(order.orderNumber)).filter(e => e.kind === "PAYMENT" && e.status === "SUCCESS").length, 1);
  const state = await (await fetch(`${base}/test/state`)).json();
  assert.equal(state.requests.filter(req => req.path.endsWith("/game/create_order")).length, 1);
});

test("concurrent Telegram workers claim a transition only once", async () => {
  const order = await createOrder();
  const event = (await history(order.orderNumber))[0];
  const results = await Promise.all(Array.from({ length: 12 }, () => worker.dispatchTelegramNotificationEvent(order.orderNumber, event.eventId)));
  assert.equal(results.filter(result => result === "sent").length, 1);
  assert.equal((await (await fetch(`${base}/test/state`)).json()).messages.length, 1);
});

test("Telegram 429/503 retry, 403 dead-letter, missing credentials and stale leases preserve business statuses", async () => {
  for (const marker of ["TG429", "TG503", "TG403"]) {
    const order = await createOrder("pending", { gameName: marker });
    const event = (await history(order.orderNumber))[0];
    const outcome = await worker.dispatchTelegramNotificationEvent(order.orderNumber, event.eventId);
    assert.equal(outcome, marker === "TG403" ? "failed" : "retrying");
    const saved = (await history(order.orderNumber))[0];
    assert.equal(saved.attemptCount, 1); assert.ok(saved.lastError); assert.ok(saved.attempts[0].error);
    if (marker === "TG429") assert.ok(new Date(saved.nextAttemptAt).getTime() >= Date.now() + 1000);
    const latest = await Order.findById(order._id);
    assert.equal(latest.paymentStatus, "PENDING"); assert.equal(latest.fulfillmentStatus, "NOT_STARTED");
  }
  const order = await createOrder(); const event = (await history(order.orderNumber))[0];
  env.TELEGRAM_BOT_TOKEN = "";
  assert.equal(await worker.dispatchTelegramNotificationEvent(order.orderNumber, event.eventId), "skipped");
  assert.equal((await history(order.orderNumber))[0].attemptCount, 0);
  env.TELEGRAM_BOT_TOKEN = "fixture-token";
  await Order.updateOne({ _id: order._id }, { $set: { "telegramNotifications.0.state": "sending", "telegramNotifications.0.lockedAt": new Date(0), "telegramNotifications.0.lockToken": "crashed" } });
  assert.equal(await worker.dispatchTelegramNotificationEvent(order.orderNumber, event.eventId), "sent");
});

test("document saves reject stale outcomes and new transitions can revisit a previous status", async () => {
  const created = await createOrder("success");
  await payments.reconcileOrderPayment(created.orderNumber, false);
  const stale = await Order.findById(created._id);
  await Order.findByIdAndUpdate(created._id, { $set: { fulfillmentStatus: "completed" } });
  stale.fulfillmentStatus = "failed";
  await assert.rejects(stale.save(), /changed concurrently/);
  await Order.updateOne({ _id: created._id }, { $set: { fulfillmentStatus: "processing" } });
  await Order.updateOne({ _id: created._id }, { $set: { fulfillmentStatus: "completed" } });
  assert.equal((await history(created.orderNumber)).filter(e => e.kind === "ORDER" && e.status === "SUCCESS").length, 2);
});

test("cron and notification history require authorization; invalid supplier callbacks cannot update an order", async () => {
  for (const filename of ["src/app/api/cron/telegram/route.ts", "src/app/api/cron/order-status/route.ts", "src/app/api/admin/notifications/route.ts"]) {
    const route = load(filename);
    assert.equal((await route.GET(new Request("http://localhost/test?orderNumber=x"))).status, 401);
  }
  const hook = load("src/app/api/payment/vngzz2/webhook/route.ts");
  assert.equal((await hook.POST(new Request("http://localhost/hook", { method: "POST", body: "{}", headers: { "x-signature": "invalid" } }))).status, 401);
});

test("ABA PayWay V2 explicit pending/success/failure/expiry and provider errors obey transition rules", async () => {
  for (const [scenario, expected] of [["pending", "PENDING"], ["success", "PAID"], ["failed", "FAILED"], ["expired", "EXPIRED"], ["unavailable", "PENDING"]]) {
    const order = await createOrder(scenario, { paymentGateway: "aba_payway_v2", paymentMethod: "aba_payway_v2" });
    const latest = await payments.reconcileOrderPayment(order.orderNumber, false);
    assert.equal(latest.paymentStatus, expected);
  }
});

test("Telegram connection test verifies bot token and chat group access securely", async () => {
  const telegramService = load("src/lib/services/telegramNotificationService.ts");
  const result = await telegramService.testTelegramConnection();
  assert.equal(result.ok, true);
  assert.equal(result.bot.username, "SakSuuBot");
  assert.equal(result.chat.title, "SakSuu");
  assert.equal(telegramService.maskTelegramChatId("-1001234567890"), "-100****7890");

  // Missing credentials fails cleanly
  const unconfigured = await telegramService.testTelegramConnection(fetch, {});
  assert.equal(unconfigured.ok, false);
  assert.match(unconfigured.error, /TELEGRAM_BOT_TOKEN is missing/);

  // Send test message delivers to the chat
  const sendRes = await telegramService.sendTelegramTestMessage();
  assert.equal(sendRes.ok, true);
  assert.ok(sendRes.messageId);
  const state = await (await fetch(`${base}/test/state`)).json();
  const testMsg = state.messages.at(-1);
  assert.match(testMsg.text, /SakSuu Telegram Bot Test/);
});

test("admin notifications endpoint authorizes, reports stats/history and executes actions", async () => {
  const adminNotificationsRoute = load("src/app/api/admin/notifications/route.ts");
  const authHeader = { Authorization: "Bearer test-admin-token" };

  // Unauthorized access
  assert.equal((await adminNotificationsRoute.GET(new Request("http://localhost/api/admin/notifications"))).status, 401);
  assert.equal((await adminNotificationsRoute.POST(new Request("http://localhost/api/admin/notifications", { method: "POST" }))).status, 401);
  assert.equal((await adminNotificationsRoute.PATCH(new Request("http://localhost/api/admin/notifications", { method: "PATCH" }))).status, 401);

  // Authorized GET overview
  const authRoute = loadTestModules({
    "@/lib/auth": { requireAdminAuth: async () => ({ authorized: true }) },
    "@/lib/mongodb": { connectDB: async () => mongoose },
    "@/models/Order": { Order },
  }, {
    process: { env },
    fetch: (url, options) => fetch(String(url).replace("https://api.telegram.org", `${base}/telegram`), options),
  })("src/app/api/admin/notifications/route.ts");

  const overviewRes = await authRoute.GET(new Request("http://localhost/api/admin/notifications", { headers: authHeader }));
  assert.equal(overviewRes.status, 200);
  const overview = await overviewRes.json();
  assert.equal(overview.success, true);
  assert.equal(overview.configured, true);
  assert.ok(typeof overview.stats.sent === "number");
  assert.ok(Array.isArray(overview.history));

  // Authorized POST test_connection
  const testConnRes = await authRoute.POST(new Request("http://localhost/api/admin/notifications", {
    method: "POST", headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test_connection" }),
  }));
  assert.equal(testConnRes.status, 200);
  assert.equal((await testConnRes.json()).bot.username, "SakSuuBot");

  // Authorized POST send_test
  const sendTestRes = await authRoute.POST(new Request("http://localhost/api/admin/notifications", {
    method: "POST", headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send_test" }),
  }));
  assert.equal(sendTestRes.status, 200);
  assert.ok((await sendTestRes.json()).messageId);

  // Authorized PATCH retry_all_failed
  const retryRes = await authRoute.PATCH(new Request("http://localhost/api/admin/notifications", {
    method: "PATCH", headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "retry_all_failed" }),
  }));
  assert.equal(retryRes.status, 200);
  assert.equal((await retryRes.json()).success, true);
});

test("Telegram forum topics route notifications by status and fall back gracefully", async () => {
  const telegramService = load("src/lib/services/telegramNotificationService.ts");
  const topicEnv = {
    ...env,
    TELEGRAM_TOPIC_PENDING: "11",
    TELEGRAM_TOPIC_SUCCESS: "10",
    TELEGRAM_TOPIC_FAILED: "12",
  };

  const testEvent = {
    kind: "ORDER",
    status: "PENDING",
    payload: {
      orderNumber: "ORD-TOPIC-001",
      customerName: "Topic Customer",
      gameName: "Free Fire",
      packageName: "Weekly Lite",
      playerId: "639703545",
      amount: 2.44,
      currency: "USD",
      paymentMethod: "aba_payway_v2",
      supplier: "webbuilder",
      occurredAt: new Date(),
    },
  };

  const mockFetch = (url, options) => fetch(String(url).replace("https://api.telegram.org", `${base}/telegram`), options);
  const res = await telegramService.sendTelegramNotification(testEvent, mockFetch, topicEnv);
  assert.equal(res.ok, true);
  const state = await (await fetch(`${base}/test/state`)).json();
  const sentMsg = state.messages.at(-1);
  assert.equal(sentMsg.message_thread_id, 11, "Routes PENDING to topic thread 11");
  assert.ok(sentMsg.text.includes("ORDER PENDING"));
  assert.ok(sentMsg.text.includes("Customer name:"));
});
