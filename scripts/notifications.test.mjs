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
  for (const required of ["Order ID:", "Customer name:", "Game:", "Package:", "Player ID:", "Server ID:", "Amount:", "Payment method:", "Supplier:", "Transaction ID:", "Date and time:"]) assert.ok(message.text.includes(required), required);
  if (status === "FAILED") assert.match(message.text, /Error reason:/);
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
