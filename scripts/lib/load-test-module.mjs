import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");

export function loadTestModules(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(filename) {
    const path = resolve(filename.endsWith(".ts") ? filename : `${filename}.ts`);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(resolve("src", name.slice(2)));
      if (name.startsWith(".")) return load(resolve(dirname(path), name));
      return require(name);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: localRequire,
      process, console, Date, Error, SyntaxError, TypeError, Buffer, setTimeout, clearTimeout,
      Request, Response, Headers, AbortSignal, AbortController, URL, URLSearchParams, fetch: globalThis.fetch, ...globals }, { filename: path });
    return module.exports;
  }
  return load;
}
