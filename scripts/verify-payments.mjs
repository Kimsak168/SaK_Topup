// Run against the local Postman simulation, with real HTTP and synthetic credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const baseUrl = process.argv[2] || "http://127.0.0.1:4900/anajakpay";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/anajakpay$/.test(baseUrl)) throw new Error("A local payment simulation is required");
const loaded = { exports: {} };
const source = ts.transpileModule(readFileSync("src/lib/services/anajakPayService.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(source, {
  module: loaded, exports: loaded.exports,
  require: name => name === "server-only" ? {} : require(name),
  process: { env: { ANAJAKPAY_API_BASE_URL: baseUrl, ANAJAKPAY_PROFILE_ID: "test-profile", ANAJAKPAY_SECRET_KEY: "test-secret" } },
  fetch, URLSearchParams, AbortSignal, console,
});

const cases = { paid: "PAID", nested: "PAID", pending: "PENDING", missing: "ERROR", invalid: "ERROR", code: "ERROR", "http-error": "ERROR", unknown: "NOT_FOUND" };
for (const [name, expected] of Object.entries(cases)) {
  const result = await loaded.exports.checkAnajakPayTransactionV2(`TXN-${name}`);
  assert.equal(result.status, expected, name);
  if (expected === "PAID") assert.equal(result.amount, 9.25);
  console.log(`${name}: ${result.status}`);
}
console.log(`Passed ${Object.keys(cases).length} payment verification scenarios over HTTP.`);
