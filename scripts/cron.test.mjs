import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { loadTestModules } from "./lib/load-test-module.mjs";

const require = createRequire(import.meta.url);
let mongo, fixture, base, load, Order, Payment, BackgroundJobLease;
let paymentWorker, supplierWorker, telegramWorker, masterCronRoute, paymentsRoute, supplierRoute, telegramRoute;

const env = {
  NODE_ENV: "test",
  VNGZZ2_PRIMARY_API_KEY: "fixture-key",
  TELEGRAM_BOT_TOKEN: "fixture-token",
  TELEGRAM_ADMIN_CHAT_ID: "-1001234567890",
  VNGZZ2_PAYMENT_WEBHOOK_SECRET: "fixture-signing-secret",
  CRON_SECRET: "secure-random-cron-secret-123456",
};

before(async () => {
  fixture = require("../postman/mocks/notification-providers/default.js");
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;

  mongo = await MongoMemoryServer.create({
    binary: { downloadDir: resolve("node_modules/.cache/mongodb-memory-server") },
    instance: { dbName: "cron_tests" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "cron_tests", autoIndex: false });

  Object.assign(env, {
    VNGZZ2_PAYMENT_BASE_URL: `${base}/vng`,
    VNGZZ2_GAME_BASE_URL: `${base}/vng`,
  });

  load = loadTestModules(
    {
      "next/server": { ...require("next/server"), after(fn) { void fn(); } },
      "@/lib/mongodb": { connectDB: async () => mongoose },
    },
    {
      process: { env },
      fetch: (url, options) => fetch(String(url).replace("https://api.telegram.org", `${base}/telegram`), options),
    }
  );

  ({ Order } = load("src/models/Order.ts"));
  ({ Payment } = load("src/models/Payment.ts"));
  ({ BackgroundJobLease } = load("src/models/BackgroundJobLease.ts"));
  await Order.createIndexes();
  await Payment.createIndexes();
  await BackgroundJobLease.createIndexes();

  paymentWorker = load("src/lib/services/cronPaymentWorker.ts");
  supplierWorker = load("src/lib/services/cronSupplierWorker.ts");
  telegramWorker = load("src/lib/services/telegramOutboxService.ts");

  paymentsRoute = load("src/app/api/cron/payments/route.ts");
  supplierRoute = load("src/app/api/cron/supplier-orders/route.ts");
  telegramRoute = load("src/app/api/cron/telegram/route.ts");
  masterCronRoute = load("src/app/api/cron/all/route.ts");
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (fixture) await new Promise(resolve => fixture.close(resolve));
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Order.createIndexes();
  await Payment.createIndexes();
  await BackgroundJobLease.createIndexes();
  await fetch(`${base}/test/reset`, { method: "POST" });
});

async function createTestOrder(overrides = {}) {
  const id = randomUUID().slice(0, 8);
  return Order.create({
    orderNumber: `ORD-CRON-${id}`,
    gameSlug: "mlbb",
    gameName: "Mobile Legends",
    packageName: "55 Diamonds",
    supplier: "vngzz2",
    supplierProductCode: "MLBB_55",
    playerId: "12345678",
    amount: 2.00,
    currency: "USD",
    paymentMethod: "aba_payway_v2",
    paymentGateway: "aba_payway_v2",
    transactionId: `TXN-${id}`,
    paymentStatus: "PENDING",
    fulfillmentStatus: "NOT_STARTED",
    ...overrides,
  });
}

// -------------------------------------------------------------
// 1. CRON_SECRET Authentication Tests
// -------------------------------------------------------------
test("cron endpoints reject unauthorized requests without Bearer CRON_SECRET", async () => {
  const routes = [paymentsRoute, supplierRoute, telegramRoute, masterCronRoute];
  for (const route of routes) {
    const resNoAuth = await route.GET(new Request("http://localhost/api/cron/test"));
    assert.equal(resNoAuth.status, 401, "Rejects request without auth header");

    const resWrongAuth = await route.GET(new Request("http://localhost/api/cron/test", {
      headers: { Authorization: "Bearer wrong-secret" },
    }));
    assert.equal(resWrongAuth.status, 401, "Rejects request with invalid secret");
  }
});

test("cron endpoints accept valid Bearer CRON_SECRET and x-cron-secret header", async () => {
  const validHeader = { Authorization: `Bearer ${env.CRON_SECRET}` };
  const res1 = await paymentsRoute.GET(new Request("http://localhost/api/cron/payments", { headers: validHeader }));
  assert.equal(res1.status, 200, "Accepts Bearer CRON_SECRET on payments");
  const data1 = await res1.json();
  assert.equal(data1.success, true);
  assert.equal(data1.job, "payments");

  const customHeader = { "x-cron-secret": env.CRON_SECRET };
  const res2 = await supplierRoute.GET(new Request("http://localhost/api/cron/supplier-orders", { headers: customHeader }));
  assert.equal(res2.status, 200, "Accepts x-cron-secret header on supplier-orders");
  const data2 = await res2.json();
  assert.equal(data2.success, true);
  assert.equal(data2.job, "supplier-orders");
});

// -------------------------------------------------------------
// 2. Pending Payment Reconciliation Worker Tests
// -------------------------------------------------------------
test("reconcilePendingPaymentsBatch verifies paid transaction, settles order, and starts fulfillment", async () => {
  const order = await createTestOrder({
    transactionId: `TXN-success-${randomUUID()}`,
    paymentStatus: "PENDING",
  });

  const summary = await paymentWorker.reconcilePendingPaymentsBatch(10, 10000);
  assert.equal(summary.checked, 1);
  assert.equal(summary.paid, 1);

  const updated = await Order.findOne({ orderNumber: order.orderNumber }).lean();
  assert.equal(String(updated.paymentStatus).toUpperCase(), "PAID");
  assert.ok(updated.paidAt, "paidAt timestamp recorded");
  assert.equal(updated.fulfillmentStatus, "processing", "Fulfillment automatically claimed upon payment verification");
});

test("payment reconciliation preserves PENDING status during transient 503 provider errors", async () => {
  const order = await createTestOrder({
    transactionId: `TXN-unavailable-${randomUUID()}`,
    paymentStatus: "PENDING",
  });

  const summary = await paymentWorker.reconcilePendingPaymentsBatch(10, 10000);
  assert.equal(summary.checked, 1);
  assert.equal(summary.pending, 1, "Recorded as pending on transient 503");

  const updated = await Order.findOne({ orderNumber: order.orderNumber }).lean();
  assert.equal(String(updated.paymentStatus).toUpperCase(), "PENDING", "Order remains PENDING on transient network error");
});

// -------------------------------------------------------------
// 3. Supplier Order Reconciliation Worker Tests
// -------------------------------------------------------------
test("reconcileSupplierOrdersBatch queries documented VngZz check_order endpoint and completes delivery", async () => {
  const order = await createTestOrder({
    orderNumber: `ORD-deliverysuccess-${randomUUID().slice(0, 8)}`,
    paymentStatus: "PAID",
    paidAt: new Date(),
    fulfillmentStatus: "processing",
    supplier: "vngzz2",
  });

  const summary = await supplierWorker.reconcileSupplierOrdersBatch(10, 10000);
  assert.equal(summary.checked, 1);
  assert.equal(summary.completed, 1);

  const updated = await Order.findOne({ orderNumber: order.orderNumber }).lean();
  assert.equal(updated.fulfillmentStatus, "completed");
  assert.ok(updated.fulfilledAt, "fulfilledAt timestamp recorded");
});

test("supplier reconciliation preserves processing status during provider timeout / 503", async () => {
  const order = await createTestOrder({
    orderNumber: `ORD-unavailable-${randomUUID().slice(0, 8)}`,
    paymentStatus: "PAID",
    paidAt: new Date(),
    fulfillmentStatus: "processing",
    supplier: "vngzz2",
  });

  const summary = await supplierWorker.reconcileSupplierOrdersBatch(10, 10000);
  assert.equal(summary.checked, 1);
  assert.equal(summary.processing, 1);

  const updated = await Order.findOne({ orderNumber: order.orderNumber }).lean();
  assert.equal(updated.fulfillmentStatus, "processing", "Never marked failed on temporary provider outage");
});

// -------------------------------------------------------------
// 4. Telegram Outbox Retries & Business Status Preservation
// -------------------------------------------------------------
test("telegram worker retries notifications without modifying payment or order fulfillment status", async () => {
  const id = randomUUID().slice(0, 8);
  const orderNumber = `ORD-CRON-${id}`;
  await BackgroundJobLease.deleteMany({});

  await Order.collection.insertOne({
    orderNumber,
    gameSlug: "mlbb",
    gameName: "Mobile Legends",
    packageName: "55 Diamonds",
    supplier: "vngzz2",
    supplierProductCode: "MLBB_55",
    playerId: "12345678",
    amount: 2.00,
    currency: "USD",
    paymentMethod: "aba_payway_v2",
    paymentGateway: "aba_payway_v2",
    transactionId: `TXN-${id}`,
    paymentStatus: "PAID",
    paidAt: new Date(),
    fulfillmentStatus: "completed",
    fulfilledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    telegramNotifications: [{
      eventId: randomUUID(),
      kind: "ORDER",
      status: "SUCCESS",
      state: "queued",
      attemptCount: 0,
      attempts: [],
      createdAt: new Date(Date.now() - 5000),
      nextAttemptAt: new Date(Date.now() - 5000),
      payload: {
        orderNumber,
        gameName: "Mobile Legends",
        packageName: "55 Diamonds",
        playerId: "12345678",
        amount: 2.00,
        currency: "USD",
        supplier: "vngzz2",
        occurredAt: new Date(),
      },
    }],
  });

  const result = await telegramWorker.dispatchPendingTelegramNotifications(10);
  assert.equal(result.attempted, 1);
  assert.equal(result.sent, 1);

  const refreshed = await Order.findOne({ orderNumber }).lean();
  assert.equal(refreshed.paymentStatus, "PAID", "Payment status untouched by Telegram dispatch");
  assert.equal(refreshed.fulfillmentStatus, "completed", "Fulfillment status untouched by Telegram dispatch");
  assert.equal(refreshed.telegramNotifications[0].state, "sent");
});

// -------------------------------------------------------------
// 5. Distributed Locking & Concurrency Protection Tests
// -------------------------------------------------------------
test("distributed job lease prevents concurrent overlapping runs", async () => {
  // Simulate active worker holding lease
  await BackgroundJobLease.create({
    _id: "cron-payment-reconciliation",
    token: "existing-active-worker-token",
    until: new Date(Date.now() + 50000),
  });

  const summary = await paymentWorker.reconcilePendingPaymentsBatch(10, 5000);
  assert.equal(summary.busy, true, "Returns busy when another worker holds lease");
  assert.equal(summary.checked, 0);
});

// -------------------------------------------------------------
// 6. Master Unified Endpoint (/api/cron/all) Execution Tests
// -------------------------------------------------------------
test("master unified /api/cron/all runs all modules in sequence and returns structured metrics", async () => {
  await createTestOrder({ transactionId: `TXN-success-${randomUUID()}`, paymentStatus: "PENDING" });

  const authHeader = { Authorization: `Bearer ${env.CRON_SECRET}` };
  const res = await masterCronRoute.GET(new Request("http://localhost/api/cron/all", { headers: authHeader }));
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.job, "all");
  assert.ok(typeof data.durationMs === "number");
  assert.ok(data.payments, "includes payment reconciliation metrics");
  assert.ok(data.supplierOrders, "includes supplier reconciliation metrics");
  assert.ok(data.telegram, "includes telegram outbox metrics");
  assert.equal(data.payments.checked, 1);
});
