import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loader(mocks = {}, globals = {}) {
  const modules = new Map();
  const load = (filename) => {
    filename = resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(resolve("src", name.slice(2)) + ".ts");
      if (name.startsWith(".")) return load(resolve(dirname(filename), name) + ".ts");
      return require(name);
    };
    vm.runInNewContext(
      source,
      {
        module: loadedModule,
        exports: loadedModule.exports,
        require: localRequire,
        console,
        process,
        performance,
        setTimeout,
        clearTimeout,
        Buffer,
        Headers,
        Request,
        Response,
        AbortController,
        AbortSignal,
        URL,
        ...globals,
      },
      { filename }
    );
    return loadedModule.exports;
  };
  return load;
}

// ========================================================
// 1. Idempotency Key Specification & Format
// ========================================================
test("WebBuilder Idempotency-Key satisfies 8-100 ASCII char rules and is stable per order", () => {
  const { generateWebBuilderIdempotencyKey } = loader()("src/lib/suppliers/webbuilder.ts");

  const key1 = generateWebBuilderIdempotencyKey("ORD-123456-ABCD");
  const key2 = generateWebBuilderIdempotencyKey("ORD-123456-ABCD");
  assert.equal(key1, key2, "Idempotency key must be completely deterministic for the same local order");

  // Regex rule: 8-100 ASCII letters, numbers, dot, underscore, colon, or hyphen
  const regex = /^[A-Za-z0-9._:-]{8,100}$/;
  assert.ok(regex.test(key1), `Key ${key1} must match requirement`);

  // Short IDs are padded to at least 8 chars
  const shortKey = generateWebBuilderIdempotencyKey("1");
  assert.ok(shortKey.length >= 8);
  assert.ok(regex.test(shortKey));

  // Long IDs are truncated safely to at most 100 chars
  const longKey = generateWebBuilderIdempotencyKey("x".repeat(150));
  assert.ok(longKey.length <= 100);
  assert.ok(regex.test(longKey));
});

// ========================================================
// 2. Request Payload Size Validation (32 KiB Limit)
// ========================================================
test("WebBuilder rejects payloads exceeding 32 KiB body limit", async () => {
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "test-valid-key" } },
    fetch: async () => Response.json({ id: "order-123", status: "queued" }, { status: 201 }),
  })("src/lib/suppliers/webbuilder.ts");

  // A huge reference exceeding 32 KiB
  const hugePayload = {
    localOrderId: "ORD-123",
    productId: "hok-tokens-80",
    playerId: "12345678",
    reference: "x".repeat(33 * 1024),
  };

  await assert.rejects(
    client.createWebBuilderOrder(hugePayload),
    (err) => {
      assert.equal(err.name, "WebBuilderBadRequestError");
      assert.equal(err.status, 400);
      assert.match(err.message, /32 KiB limit/);
      return true;
    }
  );
});

// ========================================================
// 3. Authentication & Error Status Classification
// ========================================================
test("WebBuilder 401 Unauthorized stops execution and throws typed WebBuilderAuthError", async () => {
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "invalid-key" } },
    fetch: async () => Response.json({ detail: "Invalid API key" }, { status: 401 }),
  })("src/lib/suppliers/webbuilder.ts");

  await assert.rejects(
    client.getWebBuilderBalance(),
    (err) => {
      assert.equal(err.name, "WebBuilderAuthError");
      assert.equal(err.status, 401);
      return true;
    }
  );
});

test("WebBuilder 403 Forbidden raises WebBuilderForbiddenError with account detail", async () => {
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => Response.json({ detail: "Account spending limit reached" }, { status: 403 }),
  })("src/lib/suppliers/webbuilder.ts");

  await assert.rejects(
    client.getWebBuilderBalance(),
    (err) => {
      assert.equal(err.name, "WebBuilderForbiddenError");
      assert.equal(err.status, 403);
      assert.equal(err.detail, "Account spending limit reached");
      return true;
    }
  );
});

test("WebBuilder 409 Conflict (insufficient balance) throws WebBuilderConflictError without blindly retrying", async () => {
  let calls = 0;
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => {
      calls++;
      return Response.json({ detail: "Insufficient reseller balance" }, { status: 409 });
    },
  })("src/lib/suppliers/webbuilder.ts");

  await assert.rejects(
    client.createWebBuilderOrder({
      localOrderId: "ORD-TEST-001",
      productId: "hok-tokens-80",
      playerId: "12345678",
    }),
    (err) => {
      assert.equal(err.name, "WebBuilderConflictError");
      assert.equal(err.status, 409);
      assert.match(err.detail, /balance/);
      return true;
    }
  );

  // Must not retry on 409
  assert.equal(calls, 1);
});

// ========================================================
// 4. Duplicate Order Retries (HTTP 201 vs HTTP 200)
// ========================================================
test("WebBuilder order creation returns is_duplicate: false on 201 and is_duplicate: true on 200", async () => {
  let calls = 0;
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => {
      calls++;
      if (calls === 1) {
        return Response.json({ id: "wb-ord-1", status: "queued", price_cents: 85 }, { status: 201 });
      } else {
        return Response.json({ id: "wb-ord-1", status: "queued", price_cents: 85 }, { status: 200 });
      }
    },
  })("src/lib/suppliers/webbuilder.ts");

  const order1 = await client.createWebBuilderOrder({
    localOrderId: "ORD-DUPL-001",
    productId: "hok-tokens-80",
    playerId: "12345678",
  });
  assert.equal(order1.id, "wb-ord-1");
  assert.equal(order1.is_duplicate, false);

  const order2 = await client.createWebBuilderOrder({
    localOrderId: "ORD-DUPL-001",
    productId: "hok-tokens-80",
    playerId: "12345678",
  });
  assert.equal(order2.id, "wb-ord-1");
  assert.equal(order2.is_duplicate, true);
  assert.equal(calls, 2);
});

// ========================================================
// 5. Rate Limiting (429) & Retry-After Backoff
// ========================================================
test("WebBuilder respects 429 Retry-After header and succeeds on retry", async () => {
  let attempts = 0;
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ detail: "Too Many Requests" }), {
          status: 429,
          headers: { "Retry-After": "1", "Content-Type": "application/json" },
        });
      }
      return Response.json({ available_cents: 10000, reserved_cents: 2000 }, { status: 200 });
    },
  })("src/lib/suppliers/webbuilder.ts");

  const balance = await client.getWebBuilderBalance();
  assert.equal(balance.available_cents, 10000);
  assert.equal(attempts, 2);
});

// ========================================================
// 6. 503 Transient Server Errors and Safe Retry Backoff
// ========================================================
test("WebBuilder retries 503 Service Unavailable safely and succeeds", async () => {
  let attempts = 0;
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ detail: "Supplier routing backend starting" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Response.json({ id: "wb-503-retry", status: "queued", price_cents: 120 }, { status: 201 });
    },
  })("src/lib/suppliers/webbuilder.ts");

  const order = await client.createWebBuilderOrder({
    localOrderId: "ORD-503-TEST",
    productId: "hok-tokens-100",
    playerId: "88888888",
  });

  assert.equal(order.id, "wb-503-retry");
  assert.equal(attempts, 2);
});

// ========================================================
// 7. Timeouts & Connection Failures
// ========================================================
test("WebBuilder handles request timeouts gracefully", async () => {
  const client = loader({}, {
    process: { env: { WEBBUILDER_API_KEY: "valid-key" } },
    fetch: async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    },
  })("src/lib/suppliers/webbuilder.ts");

  await assert.rejects(
    client.getWebBuilderBalance(),
    (err) => {
      assert.ok(err.name === "WebBuilderTimeoutError" || err.name === "WebBuilderServerError");
      return true;
    }
  );
});

// ========================================================
// 8. Honor of Kings Product Filtering
// ========================================================
test("isHonorOfKingsProduct strictly filters for Honor of Kings only", () => {
  const { isHonorOfKingsProduct } = loader()("src/lib/suppliers/webbuilder.ts");

  assert.ok(isHonorOfKingsProduct({ id: "hok_80", name: "80 Tokens", game: "Honor of Kings", price_cents: 80, currency: "USD", orderable: true }));
  assert.ok(isHonorOfKingsProduct({ id: "wb_hok_weekly", name: "Weekly Card", game: "hok", price_cents: 150, currency: "USD", orderable: true }));
  assert.ok(isHonorOfKingsProduct({ id: "tokens_120", name: "Honor of Kings 120 Tokens", price_cents: 120, currency: "USD", orderable: true }));

  // Non-HoK games must be rejected
  assert.equal(isHonorOfKingsProduct({ id: "mlbb_86", name: "86 Diamonds", game: "Mobile Legends", price_cents: 100, currency: "USD", orderable: true }), false);
  assert.equal(isHonorOfKingsProduct({ id: "ff_100", name: "100 Diamonds", game: "Free Fire", price_cents: 90, currency: "USD", orderable: true }), false);
  assert.equal(isHonorOfKingsProduct({ id: "pubg_60", name: "60 UC", game: "PUBG Mobile", price_cents: 95, currency: "USD", orderable: true }), false);
});

// ========================================================
// 9. Webhook Signature Verification (HMAC-SHA256)
// ========================================================
test("verifyWebBuilderWebhookSignature enforces HMAC-SHA256, freshness, and timing-safe comparison", () => {
  const { verifyWebBuilderWebhookSignature } = loader()("src/lib/suppliers/webbuilder.ts");
  const secret = "test-signing-secret-key-32-chars-long";
  const now = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event: "order.succeeded", data: { order_id: "wb-123" } });

  // Correct signature: HMAC-SHA256(secret, timestamp + "." + rawBody)
  const sign = (ts, body, sec = secret) =>
    crypto.createHmac("sha256", sec).update(Buffer.from(`${ts}.${body}`, "utf8")).digest("hex");

  const validSig = sign(now, rawBody);

  // 1. Valid signature passes
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody,
      signature: validSig,
      timestamp: now,
      signingSecret: secret,
    }),
    true
  );

  // 2. Tampered body fails
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody: rawBody + " ",
      signature: validSig,
      timestamp: now,
      signingSecret: secret,
    }),
    false
  );

  // 3. Bad signature fails
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody,
      signature: "0".repeat(64),
      timestamp: now,
      signingSecret: secret,
    }),
    false
  );

  // 4. Stale timestamp (> 300 seconds ago) fails
  const oldTimestamp = now - 360;
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody,
      signature: sign(oldTimestamp, rawBody),
      timestamp: oldTimestamp,
      signingSecret: secret,
    }),
    false
  );

  // 5. Future timestamp (> 300 seconds ahead) fails
  const futureTimestamp = now + 400;
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody,
      signature: sign(futureTimestamp, rawBody),
      timestamp: futureTimestamp,
      signingSecret: secret,
    }),
    false
  );

  // 6. Wrong secret fails
  assert.equal(
    verifyWebBuilderWebhookSignature({
      rawBody,
      signature: sign(now, rawBody, "wrong-secret"),
      timestamp: now,
      signingSecret: secret,
    }),
    false
  );
});

// ========================================================
// 10. Webhook Replay Protection & Durable Recording
// ========================================================
test("WebBuilder webhook deduplicates replayed X-WebBuilder-Event and durably records statuses", async () => {
  const secret = "test-webhook-secret-long-enough-32";
  const now = Math.floor(Date.now() / 1000);
  const writes = [];
  const existingOrder = {
    _id: "order-1",
    orderNumber: "ORD-HOK-001",
    supplierOrderId: "wb-ord-999",
    fulfillmentStatus: "processing",
    webhookEvents: ["evt-already-processed"],
  };

  const { POST } = loader({
    "next/server": { NextResponse: Response },
    "@/lib/mongodb": { connectDB: async () => {} },
    "@/models/Order": {
      Order: {
        findOne: async () => existingOrder,
        findByIdAndUpdate: async (_id, update) => {
          writes.push(update);
          return existingOrder;
        },
      },
    },
  }, {
    process: { env: { WEBBUILDER_WEBHOOK_SECRET: secret } },
  })("src/app/api/webhooks/webbuilder/route.ts");

  const sendWebhook = async (bodyObj, eventId) => {
    const rawBody = JSON.stringify(bodyObj);
    const signature = crypto.createHmac("sha256", secret).update(Buffer.from(`${now}.${rawBody}`, "utf8")).digest("hex");
    const req = new Request("http://localhost/api/webhooks/webbuilder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WebBuilder-Signature": signature,
        "X-WebBuilder-Timestamp": String(now),
        "X-WebBuilder-Event": eventId,
      },
      body: rawBody,
    });
    return POST(req);
  };

  // 1. Replay of already processed event is acknowledged with 200 without duplicate DB write
  const replayRes = await sendWebhook({ event: "order.succeeded", data: { order_id: "wb-ord-999" } }, "evt-already-processed");
  assert.equal(replayRes.status, 200);
  const replayBody = await replayRes.json();
  assert.match(replayBody.message, /Duplicate webhook event/);
  assert.equal(writes.length, 0);

  // 2. New event: order.succeeded durably records and completes fulfillment
  const newSuccessRes = await sendWebhook({ event: "order.succeeded", data: { order_id: "wb-ord-999" } }, "evt-new-001");
  assert.equal(newSuccessRes.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].$set.fulfillmentStatus, "completed");
  assert.equal(writes[0].$addToSet.webhookEvents, "evt-new-001");

  // 3. order.failed durably records and sets failed
  const failedRes = await sendWebhook({ event: "order.failed", data: { order_id: "wb-ord-999", failure_reason: "Invalid zone" } }, "evt-fail-002");
  assert.equal(failedRes.status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].$set.fulfillmentStatus, "failed");

  // 4. order.manual_review keeps order pending/processing and stops auto retries
  const reviewRes = await sendWebhook({ event: "order.manual_review", data: { order_id: "wb-ord-999" } }, "evt-review-003");
  assert.equal(reviewRes.status, 200);
  assert.equal(writes.length, 3);
  assert.equal(writes[2].$set.fulfillmentStatus, "processing");
  assert.match(writes[2].$set.adminNotes, /manual review/);
});

// ========================================================
// 11. Order Status Lifecycle Handling (Fulfillment Service)
// ========================================================
test("Fulfillment service handles all WebBuilder statuses correctly", async () => {
  for (const status of ["succeeded", "failed", "manual_review", "queued"]) {
    const writes = [];
    const orderDoc = {
      _id: "order-doc-1",
      orderNumber: "ORD-HOK-STAT",
      supplier: "webbuilder",
      gameSlug: "honor-of-kings",
      supplierProductCode: "wb-hok-80",
      playerId: "12345678",
      serverId: "1001",
      amount: 1.0,
      priceSnapshotCents: 85,
      paymentStatus: "PAID",
      fulfillmentStatus: "NOT_STARTED",
    };

    const service = loader({
      "@/lib/mongodb": { connectDB: async () => {} },
      "@/models/Order": {
        Order: {
          findOneAndUpdate: async () => orderDoc,
          findByIdAndUpdate: async (_id, update) => {
            writes.push(update);
            return orderDoc;
          },
          findOne: async () => orderDoc,
        },
      },
      "@/lib/suppliers/vizo": {},
      "@/lib/suppliers/g2bulk": {},
      "@/lib/suppliers/webbuilder": {
        createWebBuilderOrder: async () => ({ id: "wb-ord-lifecycle", status, price_cents: 85 }),
        pollWebBuilderOrderUntilFinal: async () => ({ id: "wb-ord-lifecycle", status, price_cents: 85 }),
        generateWebBuilderIdempotencyKey: () => "wb:hok:ORD-HOK-STAT",
        computeOrderRequestHash: () => "hash123",
      },
    })("src/lib/services/fulfillmentService.ts");

    const result = await service.triggerAutomaticFulfillment(orderDoc.orderNumber);

    if (status === "succeeded") {
      assert.equal(result.fulfillmentStatus, "completed");
      assert.equal(result.success, true);
      assert.equal(writes[1].$set.fulfillmentStatus, "completed");
    } else if (status === "failed") {
      assert.equal(result.fulfillmentStatus, "failed");
      assert.equal(result.success, false);
      assert.equal(writes[1].$set.fulfillmentStatus, "failed");
    } else if (status === "manual_review") {
      assert.equal(result.fulfillmentStatus, "processing");
      assert.equal(result.success, true);
      assert.match(writes[1].$set.adminNotes, /manual review/);
    } else if (status === "queued") {
      assert.equal(result.fulfillmentStatus, "processing");
      assert.equal(result.success, true);
    }
  }
});
