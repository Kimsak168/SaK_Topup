import { mkdir, writeFile } from "node:fs/promises";

const base = (process.env.VNGZZ2_GAME_BASE_URL || process.env.VNGZZ2_PAYMENT_BASE_URL || "https://www.vngzz2game.site/api")
  .trim().replace(/\/+$/, "").replace(/\/v1$/, "");
const apiKey = process.env.VNGZZ2_GAME_API_KEY?.trim() || process.env.VNGZZ2_PRIMARY_API_KEY?.trim() || process.env.VNGZZ2_PAYMENT_API_KEY?.trim();
if (!apiKey) throw new Error("Configure VNGZZ2_GAME_API_KEY, VNGZZ2_PRIMARY_API_KEY, or VNGZZ2_PAYMENT_API_KEY.");
const directory = "artifacts/vngzz2-catalogue";
await mkdir(`${directory}/products`, { recursive: true });

async function request(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json", "X-API-Key": apiKey },
      signal: AbortSignal.timeout(20000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retry = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000 * 2 ** attempt)));
      continue;
    }
    const result = await response.json();
    if (!response.ok || result.success === false || result.status === "error") {
      throw new Error(`${path}: HTTP ${response.status} ${result.code || ""} ${result.message || ""}`);
    }
    return result;
  }
}

const catalogue = await request("/v1/game/categories");
if (!Array.isArray(catalogue.categories) || !catalogue.categories.length) throw new Error("Provider returned no categories.");
await writeFile(`${directory}/categories.json`, JSON.stringify(catalogue, null, 2));
const categories = process.argv.includes("--sample")
  ? catalogue.categories.filter(game => ["mlbb", "freefire_sgmy", "ragnarok_origin"].includes(game.game_code))
  : catalogue.categories;
const errors = [];
let completed = 0;
let productCount = 0;
let index = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (index < categories.length) {
    const game = categories[index++];
    try {
      const result = await request(`/v1/game/products?game_code=${encodeURIComponent(game.game_code)}`);
      if (result.game?.game_code !== game.game_code) throw new Error(`Provider returned products for a different game: ${game.game_code}`);
      await writeFile(`${directory}/products/${encodeURIComponent(game.game_code)}.json`, JSON.stringify(result, null, 2));
      const products = result.products || result.data?.products || (Array.isArray(result.data) ? result.data : []);
      productCount += products.length;
      if (completed < 3) console.log(JSON.stringify({ game: game.game_code, keys: Object.keys(result), count: products.length, sample: products.slice(0, 2), gameFields: result.game_fields }));
    } catch (error) {
      errors.push({ game: game.game_code, error: error.message });
    }
    completed++;
    if (completed % 20 === 0 || completed === categories.length) console.log(JSON.stringify({ completed, total: categories.length, productCount, failures: errors.length }));
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}));
await writeFile(`${directory}/fetch-summary.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), base, categories: categories.length, productCount, errors }, null, 2));
console.log(JSON.stringify({ categories: categories.length, productCount, errors }));
if (errors.length) process.exitCode = 1;
