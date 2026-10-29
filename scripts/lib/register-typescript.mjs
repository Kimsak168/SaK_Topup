// Run the same server-side TypeScript modules from maintenance scripts.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    // server-only is a build-time guard; these scripts always run on the server.
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    const path = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (path) {
      const filename = existsSync(`${path}.ts`) ? `${path}.ts` : path;
      if (filename.endsWith(".ts") && existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    };
    return nextLoad(url, context);
  },
});
