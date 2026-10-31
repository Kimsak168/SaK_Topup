import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function createModuleLoader(mocks = {}, customGlobals = {}) {
  const modules = new Map();
  const load = (filename) => {
    let resolved = resolve(filename);
    if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) {
      resolved += ".ts";
    }
    if (modules.has(resolved)) return modules.get(resolved).exports;
    const loadedModule = { exports: {} };
    modules.set(resolved, loadedModule);

    const source = ts.transpileModule(readFileSync(resolved, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) {
        const sub = name.slice(2);
        return load(resolve("src", sub));
      }
      if (name.startsWith(".")) {
        return load(resolve(dirname(resolved), name));
      }
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
        fetch: customGlobals.fetch || globalThis.fetch,
        ...customGlobals,
      },
      { filename: resolved }
    );
    return loadedModule.exports;
  };
  return load;
}

// ========================================================
// 1. ABA PayWay V2 (VngZz2) Integration Tests
// ========================================================
test("ABA PayWay V2: VngZz2 Configuration & Utility Functions", async (t) => {
  const origEnv = { ...process.env };
  delete process.env.VNGZZ2_PRIMARY_API_KEY;
  process.env.VNGZZ2_PAYMENT_BASE_URL = "https://www.vngzz2game.site/api";
  process.env.VNGZZ2_PAYMENT_API_KEY = "test_vngzz2_api_key_xyz";
  process.env.VNGZZ2_PAYMENT_SLOT = "USD";
  process.env.VNGZZ2_PAYMENT_CURRENCY = "USD";
  process.env.VNGZZ2_PAYMENT_WEBHOOK_SECRET = "webhook_secret_hmac_123";

  const load = createModuleLoader();
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  await t.test("isVngZz2Configured returns true with legacy API key set", () => {
    assert.strictEqual(vngzz.isVngZz2Configured(), true);
  });

  await t.test("getVngZz2Config parses configured settings and strips trailing slashes", () => {
    const config = vngzz.getVngZz2Config();
    assert.strictEqual(config.baseUrl, "https://www.vngzz2game.site/api");
    assert.strictEqual(config.apiKey, "test_vngzz2_api_key_xyz");
    assert.strictEqual(config.slot, "USD");
    assert.strictEqual(config.currency, "USD");
    assert.strictEqual(config.webhookSecret, "webhook_secret_hmac_123");
  });

  await t.test("isVngZz2Configured and getVngZz2Config prioritize VNGZZ2_PRIMARY_API_KEY", () => {
    process.env.VNGZZ2_PRIMARY_API_KEY = "primary_key_abc_456";
    const vngzzPrimary = load("src/lib/services/vngzzPayWayService.ts");
    assert.strictEqual(vngzzPrimary.isVngZz2Configured(), true);
    assert.strictEqual(vngzzPrimary.getVngZz2Config().apiKey, "primary_key_abc_456");
    delete process.env.VNGZZ2_PRIMARY_API_KEY;
  });

  await t.test("formatVngZzAmount formats currency amounts cleanly", () => {
    assert.strictEqual(vngzz.formatVngZzAmount(2), "2.00");
    assert.strictEqual(vngzz.formatVngZzAmount(0.99), "0.99");
    assert.strictEqual(vngzz.formatVngZzAmount(100.5), "100.50");
  });

  process.env = origEnv;
});

test("ABA PayWay V2: Unconfigured State & Error Handling", async (t) => {
  const origEnv = { ...process.env };
  delete process.env.VNGZZ2_PRIMARY_API_KEY;
  delete process.env.VNGZZ2_PAYMENT_API_KEY;

  const load = createModuleLoader();
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  await t.test("isVngZz2Configured returns false when key is missing", () => {
    assert.strictEqual(vngzz.isVngZz2Configured(), false);
  });

  await t.test("generateVngZz2Qr throws VngZz2ConfigError when unconfigured", async () => {
    await assert.rejects(
      async () => {
        await vngzz.generateVngZz2Qr({
          amount: 2.0,
          currency: "USD",
          orderNumber: "ORD-UNCONFIG-1",
        });
      },
      (err) => {
        return err.name === "VngZz2ConfigError" && err.message.includes("VNGZZ2_PAYMENT_API_KEY");
      }
    );
  });

  await t.test("generateVngZz2SandboxQr produces valid SVG data URI without API key", () => {
    const sandboxResult = vngzz.generateVngZz2SandboxQr({
      amount: 1.5,
      currency: "USD",
      orderNumber: "ORD-SANDBOX-TEST",
    });
    assert.strictEqual(sandboxResult.success, true);
    assert.strictEqual(sandboxResult.amount, 1.5);
    assert.strictEqual(sandboxResult.currency, "USD");
    assert.ok(sandboxResult.transactionId.startsWith("TXN-SANDBOX-VNGZZ2-"));
    assert.ok(sandboxResult.qrImage?.startsWith("data:image/svg+xml;base64,"));
    assert.ok(sandboxResult.deepLink?.startsWith("abamobilebank://"));
    assert.strictEqual(sandboxResult.expireInSec, 180);
  });

  await t.test("checkVngZz2Transaction never treats a sandbox transaction as a paid payment", async () => {
    const checkRes = await vngzz.checkVngZz2Transaction("TXN-SANDBOX-VNGZZ2-9999-ABCD");
    assert.strictEqual(checkRes.success, true);
    assert.strictEqual(checkRes.isPaid, false);
    assert.strictEqual(checkRes.state, "PENDING");
    assert.ok(checkRes.paywayTransactionId?.includes("ABA-SANDBOX-"));
  });

  process.env = origEnv;
});

test("ABA PayWay V2: Successful QR Generation with Official VngZz2 Contract", async () => {
  const origEnv = { ...process.env };
  process.env.VNGZZ2_PAYMENT_API_KEY = "valid_api_key_123";
  process.env.VNGZZ2_PAYMENT_BASE_URL = "https://www.vngzz2game.site/api";

  const mockQrResponse = {
    success: true,
    status: 201,
    message: "QR generated successfully.",
    data: {
      transaction_id: "TXN-PAYWAY-2026-9999",
      amount: "2.00",
      currency: "USD",
      state: "PENDING",
      expires_at: "2026-10-26T12:33:00.000Z",
      qr_string: "00020101021229300016com.ababank.payway...",
      qr_image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      qr_png_url: "https://www.vngzz2game.site/pay/2ZEf4syOpIEM/qr.png",
      pay_url: "https://www.vngzz2game.site/pay/2ZEf4syOpIEM",
      deep_link: "abamobilebank://ababank.com?type=payway&qrcode=000201010212...",
      expire_in_sec: 180,
    },
  };

  const mockFetch = async (url, options) => {
    assert.ok(url.toString().includes("/v1/generate_qr"), `Expected generate_qr url, got: ${url}`);
    assert.strictEqual(options.method, "POST");
    assert.strictEqual(options.headers["X-API-Key"], "valid_api_key_123");

    const body = JSON.parse(options.body);
    assert.strictEqual(body.amount, "2.00");
    assert.strictEqual(body.currency, "USD");
    assert.strictEqual(body.slot, "USD");
    assert.strictEqual(body.idempotency_key, "ord:ORD-2026-TEST-001-200");

    return new Response(JSON.stringify(mockQrResponse), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  const load = createModuleLoader({}, { fetch: mockFetch });
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  const result = await vngzz.generateVngZz2Qr({
    amount: 2.0,
    currency: "USD",
    orderNumber: "ORD-2026-TEST-001",
    metadata: { game: "Honor of Kings", playerId: "10029384" },
  });

  assert.strictEqual(result.transactionId, "TXN-PAYWAY-2026-9999");
  assert.strictEqual(result.amount, 2.0);
  assert.strictEqual(result.currency, "USD");
  assert.strictEqual(result.state, "PENDING");
  assert.ok(result.qrImage?.startsWith("data:image/png;base64,"));
  assert.ok(result.deepLink?.startsWith("abamobilebank://"));
  assert.strictEqual(result.expireInSec, 180);

  process.env = origEnv;
});

test("ABA PayWay V2: Invalid API Key (401 Unauthorized) Handling", async () => {
  const origEnv = { ...process.env };
  process.env.VNGZZ2_PAYMENT_API_KEY = "invalid_expired_api_key";

  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        status: 401,
        code: "INVALID_API_KEY",
        message: "Wrong key in path or header",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  };

  const load = createModuleLoader({}, { fetch: mockFetch });
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  await assert.rejects(
    async () => {
      await vngzz.generateVngZz2Qr({
        amount: 5.0,
        currency: "USD",
        orderNumber: "ORD-FAIL-401",
      });
    },
    (err) => {
      return (
        err.name === "VngZz2ApiError" &&
        err.status === 401 &&
        err.message.includes("Wrong key in path or header")
      );
    }
  );

  process.env = origEnv;
});

test("ABA PayWay V2: Network Timeout Handling", async () => {
  const origEnv = { ...process.env };
  process.env.VNGZZ2_PAYMENT_API_KEY = "valid_api_key_123";

  const mockFetch = async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  };

  const load = createModuleLoader({}, { fetch: mockFetch });
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  await assert.rejects(
    async () => {
      await vngzz.generateVngZz2Qr({
        amount: 5.0,
        currency: "USD",
        orderNumber: "ORD-TIMEOUT",
      });
    },
    (err) => {
      return err.name === "VngZz2TimeoutError" && err.status === 504;
    }
  );

  process.env = origEnv;
});

test("ABA PayWay V2: Transaction Status Check (check_transaction)", async () => {
  const origEnv = { ...process.env };
  process.env.VNGZZ2_PAYMENT_API_KEY = "valid_api_key_123";

  const mockTxResponse = {
    success: true,
    status: 200,
    message: "Payment approved",
    data: {
      transaction_id: "TXN-PAYWAY-2026-9999",
      amount: "2.00",
      currency: "USD",
      state: "PAID",
      is_paid: true,
      action: "approved",
      code: "00",
      payway_transaction_id: "ABA-BANK-REF-8877",
      receipt_url: "https://pwapp.ababank.com/download-receipt?id=123",
      checked_at: "2026-10-26T12:00:00Z",
    },
  };

  const mockFetch = async (url, options) => {
    assert.ok(url.toString().includes("/v1/check_transaction"));
    const body = JSON.parse(options.body);
    assert.strictEqual(body.transaction_id, "TXN-PAYWAY-2026-9999");
    return new Response(JSON.stringify(mockTxResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const load = createModuleLoader({}, { fetch: mockFetch });
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  const result = await vngzz.checkVngZz2Transaction("TXN-PAYWAY-2026-9999");
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.isPaid, true);
  assert.strictEqual(result.state, "PAID");
  assert.strictEqual(result.paywayTransactionId, "ABA-BANK-REF-8877");
  assert.strictEqual(result.amount, 2.0);

  process.env = origEnv;
});

test("ABA PayWay V2: Webhook Signature Verification (HMAC-SHA256)", async (t) => {
  const origEnv = { ...process.env };
  process.env.VNGZZ2_PAYMENT_WEBHOOK_SECRET = "super_secure_webhook_secret_key_999";

  const load = createModuleLoader();
  const vngzz = load("src/lib/services/vngzzPayWayService.ts");

  const payload = JSON.stringify({
    transaction_id: "TXN-PAYWAY-2026-9999",
    order_number: "ORD-2026-WEBHOOK-TEST",
    state: "PAID",
    amount: "2.00",
    currency: "USD",
  });

  const validSignature = crypto
    .createHmac("sha256", "super_secure_webhook_secret_key_999")
    .update(payload, "utf8")
    .digest("hex");

  await t.test("valid signature returns true", () => {
    assert.strictEqual(
      vngzz.verifyVngZz2WebhookSignature({ rawBody: payload, signature: validSignature }),
      true
    );
  });

  await t.test("tampered payload returns false", () => {
    const tamperedPayload = JSON.stringify({
      transaction_id: "TXN-PAYWAY-2026-9999",
      order_number: "ORD-2026-WEBHOOK-TEST",
      state: "PAID",
      amount: "100.00", // Tampered amount!
      currency: "USD",
    });
    assert.strictEqual(
      vngzz.verifyVngZz2WebhookSignature({ rawBody: tamperedPayload, signature: validSignature }),
      false
    );
  });

  await t.test("invalid signature format returns false", () => {
    assert.strictEqual(
      vngzz.verifyVngZz2WebhookSignature({ rawBody: payload, signature: "invalid_sig_0000" }),
      false
    );
  });

  await t.test("missing webhook secret fails closed", () => {
    delete process.env.VNGZZ2_PAYMENT_WEBHOOK_SECRET;
    assert.strictEqual(vngzz.verifyVngZz2WebhookSignature({ rawBody: payload, signature: validSignature }), false);
  });

  process.env = origEnv;
});

test("ABA PayWay V2: Provider module path re-export", async () => {
  const load = createModuleLoader();
  const provider = load("src/lib/payments/aba-payway-v2.ts");
  assert.ok(typeof provider.generateVngZz2Qr === "function");
  assert.ok(typeof provider.checkVngZz2Transaction === "function");
  assert.ok(typeof provider.getVngZz2Config === "function");
});
