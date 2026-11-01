// Reconcile an audited snapshot with the application database. No supplier orders.
import "./lib/register-typescript.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
const { connectDB } = await import("../src/lib/mongodb.ts");
const { Game } = await import("../src/models/Game.ts");
const { GamePackage } = await import("../src/models/GamePackage.ts");
const { syncWebBuilderCatalogue } = await import("../src/lib/services/webbuilderSyncService.ts");
const { syncVngzzCatalogue } = await import("../src/lib/services/vngzzSyncService.ts");
const { getWebBuilderGame } = await import("../src/lib/suppliers/webbuilderCatalogue.ts");
const { normalizeWebBuilderProducts } = await import("../src/lib/suppliers/webbuilder.ts");

const filename = process.argv[process.argv.indexOf("--snapshot") + 1];
if (!process.argv.includes("--snapshot") || !filename) throw new Error("Pass --snapshot <audit snapshot.json> and optionally --apply.");
const snapshot = JSON.parse(await readFile(filename, "utf8"));
if (snapshot.errors?.length || !snapshot.vngzz2?.length || !snapshot.webbuilder?.length) throw new Error("A complete, successful supplier audit is required.");
const age = Date.now() - Date.parse(snapshot.fetchedAt);
if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60_000) throw new Error("Supplier snapshot is expired; run the audit again.");
const webbuilder = normalizeWebBuilderProducts(snapshot.webbuilder);
const expected = new Map(webbuilder.map(product => {
  const game = getWebBuilderGame(product);
  if (!game) throw new Error(`Unmapped WebBuilder product ${product.id}.`);
  return [`webbuilder:${product.id}`, { gameCode: game.code, price: product.price_cents / 100, currency: product.currency,
    available: product.orderable && product.currency === "USD" && product.price_cents > 0 && !["inactive", "disabled", "unavailable", "paused", "deleted"].includes(String(product.status || "").toLowerCase()) }];
}));
const vngzz = new Map();
for (const entry of snapshot.vngzz2) {
  const code = entry.game?.game_code;
  if (!code || vngzz.has(code) || !Array.isArray(entry.products)) throw new Error("Invalid VNGZZ2 game snapshot.");
  vngzz.set(code, entry);
  for (const product of entry.products) {
    if (!product.product_code || !product.name || !Number.isFinite(product.price) || product.price < 0 || typeof product.available !== "boolean" || !/^[A-Z]{3}$/.test(product.currency)) throw new Error(`Invalid VNGZZ2 product in ${code}.`);
    const key = `vngzz2:${code}:${product.product_code}`;
    if (expected.has(key)) throw new Error(`Duplicate snapshot product ${key}.`);
    expected.set(key, { gameCode: code, price: product.price, currency: product.currency, available: product.available && product.currency === "USD" });
  }
}
const keyOf = pkg => pkg.supplier === "vngzz2" ? `vngzz2:${pkg.gameCode}:${pkg.supplierProductCode}` : `webbuilder:${pkg.supplierProductCode}`;
const protectedPackageFields = ["sellingPrice", "originalPrice", "isActive", "adminConfigured", "isFeatured", "customImage", "badge", "bonus", "sortOrder", "name", "diamondsOrPoints"];
const protectedGameFields = ["slug", "name", "image", "customImage", "banner", "isActive", "isPopular", "isTrending", "defaultMarginPercent"];
try {
  await connectDB();
  if (snapshot.database && snapshot.database !== mongoose.connection.name) throw new Error("Audit database does not match the configured application database.");
  const filter = { supplier: { $in: ["webbuilder", "vngzz2"] } };
  const [games, packages] = await Promise.all([Game.find(filter).lean(), GamePackage.find(filter).lean()]);
  const seen = new Set();
  const plan = { database: mongoose.connection.name, providerGames: webbuilder.reduce((set, product) => set.add(getWebBuilderGame(product).code), new Set()).size + vngzz.size,
    providerPackages: expected.size, missingPackages: 0, wrongGame: 0, changedBuyingPrice: 0, removedAvailable: 0 };
  for (const pkg of packages) {
    const key = keyOf(pkg);
    if (seen.has(key)) throw new Error(`Duplicate database supplier identity: ${key}`);
    seen.add(key);
    const product = expected.get(key);
    if (!product) { if (pkg.supplierAvailable !== false) plan.removedAvailable++; continue; }
    if (pkg.gameCode !== product.gameCode) plan.wrongGame++;
    if (Math.abs((pkg.buyingPrice ?? -1) - product.price) > 1e-8) plan.changedBuyingPrice++;
  }
  plan.missingPackages = [...expected.keys()].filter(key => !seen.has(key)).length;
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", plan }, null, 2));
  if (!process.argv.includes("--apply")) {
    console.log("Use --apply to save this reviewed catalogue. Existing selling prices, labels, artwork and activation settings are retained.");
  } else {
    const directory = `.local-backups/supplier-repair-${Date.now()}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/database-before.json`, JSON.stringify({ database: mongoose.connection.name, games, packages }, null, 2));
    const webbuilderStats = await syncWebBuilderCatalogue({ packages: true, onlyActiveGames: false, source: webbuilder });
    const vngzzStats = await syncVngzzCatalogue({ packages: true, onlyActiveGames: false,
      source: { games: [...vngzz.values()].map(entry => entry.game), products: async code => vngzz.get(code).products } });
    const [afterGames, afterPackages] = await Promise.all([Game.find(filter).lean(), GamePackage.find(filter).lean()]);
    const currentGames = new Map(afterGames.map(game => [String(game._id), game]));
    const currentPackages = new Map(afterPackages.map(pkg => [String(pkg._id), pkg]));
    const errors = [];
    for (const [before, after, fields] of [[games, currentGames, protectedGameFields], [packages, currentPackages, protectedPackageFields]]) {
      for (const item of before) for (const field of fields) {
        if (JSON.stringify(item[field]) !== JSON.stringify(after.get(String(item._id))?.[field])) errors.push(`Protected field changed: ${item._id}.${field}`);
      }
    }
    const found = new Set();
    for (const pkg of afterPackages) {
      const key = keyOf(pkg);
      const product = expected.get(key);
      if (!product) { if (pkg.supplierAvailable !== false) errors.push(`Removed package is still available: ${key}`); continue; }
      if (found.has(key)) errors.push(`Duplicate package: ${key}`);
      found.add(key);
      const game = afterGames.find(game => game.supplier === pkg.supplier && game.supplierGameCode === product.gameCode);
      if (pkg.gameCode !== product.gameCode || pkg.gameSlug !== game?.slug || pkg.currency !== product.currency ||
        Math.abs((pkg.buyingPrice ?? -1) - product.price) > 1e-8 || pkg.priceCents !== Math.round(product.price * 100) ||
        pkg.supplierAvailable !== product.available) errors.push(`Package differs from supplier snapshot: ${key}`);
    }
    for (const key of expected.keys()) if (!found.has(key)) errors.push(`Missing package: ${key}`);
    const result = { repairedAt: new Date().toISOString(), database: mongoose.connection.name, plan,
      stats: { webbuilder: webbuilderStats, vngzz2: vngzzStats }, verifiedProviderPackages: found.size,
      gamesAfter: afterGames.length, packagesAfter: afterPackages.length, errors };
    await writeFile(`${directory}/repair-result.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ backup: directory, ...result }, null, 2));
    if (errors.length || [webbuilderStats, vngzzStats].some(stats => stats.games.failed || stats.packages.failed)) process.exitCode = 1;
  }
} finally { await mongoose.disconnect(); }
