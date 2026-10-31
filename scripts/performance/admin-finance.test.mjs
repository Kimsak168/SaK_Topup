import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { addMinorUnits, currencyExponent, formatMinorUnits, toMinorUnits } from "../../src/lib/financeMath.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTypeScript(filename, globals = {}, mocks = {}) {
  const fullPath = resolve(filename);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(fullPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/")) throw new Error("Unexpected alias in supplier adapter test");
    if (name.startsWith(".")) return require(resolve(dirname(fullPath), name));
    return require(name);
  };
  vm.runInNewContext(js, { module: loaded, exports: loaded.exports, require: localRequire, process, URL, AbortSignal, fetch: globals.fetch, ...globals }, { filename: fullPath });
  return loaded.exports;
}

test("finance math converts and adds currency minor units without float totals", () => {
  assert.equal(currencyExponent("USD"), 2);
  assert.equal(currencyExponent("KHR"), 0);
  assert.equal(toMinorUnits(0.1, "USD"), 10n);
  assert.equal(toMinorUnits("1.005", "USD"), 101n);
  assert.equal(toMinorUnits("100.5", "KHR"), 101n);
  assert.equal(formatMinorUnits(addMinorUnits(10n, 20n), "USD"), "0.30");
  assert.equal(formatMinorUnits(-123n, "USD"), "-1.23");
  assert.equal(toMinorUnits("-4.00", "USD"), null);
});

test("G2Bulk balance adapter accepts a real zero and rejects an absent balance", async () => {
  const original = { base: process.env.G2BULK_BASE_URL, key: process.env.G2BULK_API_KEY };
  process.env.G2BULK_BASE_URL = "https://api.g2bulk.com/v1";
  process.env.G2BULK_API_KEY = "test_secret_never_logged";
  try {
    let calledUrl = "";
    let sentBody = "";
    const valid = loadTypeScript("src/lib/suppliers/g2bulk.ts", {
      fetch: async (url, init) => {
        calledUrl = String(url);
        sentBody = String(init.body);
        return new Response(JSON.stringify({ balance: "0.00", currency: "USD" }), { status: 200 });
      },
    });
    assert.deepEqual({ ...(await valid.getG2BulkSmmBalance()) }, { balance: "0.00", currency: "USD" });
    assert.equal(calledUrl, "https://api.g2bulk.com/api/v2");
    assert.equal(JSON.parse(sentBody).action, "balance");

    const invalid = loadTypeScript("src/lib/suppliers/g2bulk.ts", {
      fetch: async () => new Response(JSON.stringify({ currency: "USD" }), { status: 200 }),
    });
    await assert.rejects(invalid.getG2BulkSmmBalance(), /invalid balance response/);
  } finally {
    if (original.base === undefined) delete process.env.G2BULK_BASE_URL; else process.env.G2BULK_BASE_URL = original.base;
    if (original.key === undefined) delete process.env.G2BULK_API_KEY; else process.env.G2BULK_API_KEY = original.key;
  }
});

test("admin finance routes authorize before reading data and supplier identities match the implementation", async () => {
  let authChecks = 0;
  let serviceCalls = 0;
  const unauthorized = new Response(JSON.stringify({ success: false }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  const financeServices = new Proxy({}, {
    get: () => () => {
      serviceCalls++;
      throw new Error("Finance service must not run before authorization.");
    },
  });
  const supplierServices = {
    listSupplierAccounts: async () => {
      serviceCalls++;
      throw new Error("Supplier service must not run before authorization.");
    },
    recordManualSupplierBalance: async () => {
      serviceCalls++;
      throw new Error("Supplier service must not run before authorization.");
    },
  };
  const routeFiles = [
    "src/app/api/admin/finance/summary/route.ts",
    "src/app/api/admin/finance/transactions/route.ts",
    "src/app/api/admin/finance/revenue-chart/route.ts",
    "src/app/api/admin/suppliers/route.ts",
    "src/app/api/admin/suppliers/[supplierId]/balance-history/route.ts",
  ];

  for (const filename of routeFiles) {
    const route = loadTypeScript(filename, {}, {
      "next/server": { NextResponse: { json: () => { throw new Error("Unexpected response construction."); } } },
      "@/lib/auth": {
        requireAdminAuth: async () => {
          authChecks++;
          return { authorized: false, response: unauthorized };
        },
      },
      "@/lib/mongodb": { connectDB: async () => { serviceCalls++; } },
      "@/lib/services/adminFinanceService": financeServices,
      "@/lib/services/supplierManager": { ...supplierServices, isSupplierId: () => true },
      "@/models/SupplierBalanceSnapshot": { SupplierBalanceSnapshot: {} },
    });
    const response = await route.GET({ nextUrl: new URL("http://localhost/api/admin") });
    assert.equal(response.status, 401, `${filename} must reject an unauthenticated request`);
  }

  const manager = loadTypeScript("src/lib/services/supplierManager.ts", {}, {
    mongoose: {},
    "@/lib/mongodb": { connectDB: async () => {} },
    "@/lib/suppliers/vngzz2": { getVngzzAccountProfile: async () => null },
    "@/lib/suppliers/g2bulk": { getG2BulkSmmBalance: async () => null, testG2Bulk: async () => null },
    "@/lib/suppliers/webbuilder": { getWebBuilderBalance: async () => null },
    "@/models/AdminAuditLog": { AdminAuditLog: {} },
    "@/models/SupplierBalanceSnapshot": { SupplierBalanceSnapshot: {} },
    "@/models/SupplierConfiguration": { SupplierConfiguration: {} },
  });

  assert.deepEqual(
    ["vngzz2", "g2bulk", "webbuilder"].filter(manager.isSupplierId),
    ["vngzz2", "g2bulk", "webbuilder"]
  );
  assert.equal(manager.isSupplierId("vizo"), false);
  assert.equal(authChecks, routeFiles.length);
  assert.equal(serviceCalls, 0);

  const auth = loadTypeScript("src/lib/auth.ts", {}, { "next/server": {} });
  assert.equal(auth.ADMIN_COOKIE_NAME, "saksuuu_admin_token");
});
