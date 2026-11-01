// Run against the Postman simulation and an isolated in-memory MongoDB.
import "./lib/register-typescript.mjs";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const base = process.argv[2] || "http://127.0.0.1:4902/suppliers";
process.env.WEBBUILDER_BASE_URL = `${base}/webbuilder`;
process.env.WEBBUILDER_API_KEY = "catalogue-simulation-key";
process.env.WEBBUILDER_RETRY_BASE_DELAY_MS = "0";
process.env.VNGZZ2_GAME_BASE_URL = `${base}/vngzz2/api`;
process.env.VNGZZ2_GAME_API_KEY = "catalogue-simulation-key";
process.env.MONGODB_DB_NAME = "catalogue_simulation";
// A separate process has its own connection cache. Never load .env.local here.
const database = await MongoMemoryServer.create();
process.env.MONGODB_URI = database.getUri();
try {
  const { connectDB } = await import("../src/lib/mongodb.ts");
  const { Game } = await import("../src/models/Game.ts");
  const { GamePackage } = await import("../src/models/GamePackage.ts");
  const { syncWebBuilderCatalogue } = await import("../src/lib/services/webbuilderSyncService.ts");
  const { syncVngzzCatalogue } = await import("../src/lib/services/vngzzSyncService.ts");
  const { getWebBuilderProducts } = await import("../src/lib/suppliers/webbuilder.ts");
  await connectDB();
  await Game.create({ supplier: "webbuilder", supplierGameCode: "mlbb", slug: "admin-mobile", name: "My Mobile Legends",
    image: "/custom-game.png", isActive: true, defaultMarginPercent: 0 });
  const seed = await GamePackage.create({ supplier: "webbuilder", gameCode: "mlbb", gameSlug: "admin-mobile", supplierProductCode: "fixture-mlbb-global",
    name: "My 86 Diamonds", diamondsOrPoints: "86 Diamonds", sellingPrice: 3.33, originalPrice: 4.44,
    customImage: "/custom-package.png", badge: "HOT", isActive: false, adminConfigured: true, isFeatured: true, sortOrder: 55 });
  await GamePackage.create({ supplier: "webbuilder", gameCode: "hok", gameSlug: "hok", supplierProductCode: "removed-package", name: "Removed", sellingPrice: 9 });
  await fetch(`${base}/test/mode?value=valid`);
  const stats = await syncWebBuilderCatalogue({ packages: true });
  assert.equal(stats.games.failed + stats.packages.failed, 0, JSON.stringify(stats));
  assert.deepEqual((await getWebBuilderProducts({ gameCode: "mlbb_global" })).map(product => product.id), ["fixture-mlbb-global"]);
  assert.deepEqual((await getWebBuilderProducts({ gameCode: "freefire_tw" })).map(product => product.id), ["fixture-ff-tw"]);
  const moved = await GamePackage.findById(seed._id).lean();
  assert.equal(moved.gameCode, "mlbb_global");
  assert.equal(moved.buyingPrice, 1.1);
  for (const field of ["name", "diamondsOrPoints", "sellingPrice", "originalPrice", "customImage", "badge", "isActive", "adminConfigured", "isFeatured", "sortOrder"]) assert.equal(moved[field], seed[field], field);
  const kh = await GamePackage.findOne({ supplierProductCode: "fixture-mlbb-kh" }).lean();
  assert.equal(kh.gameSlug, "admin-mobile");
  assert.equal(kh.sellingPrice, 0.76, "A configured zero margin is respected");
  assert.equal(kh.isActive, false, "New packages await activation");
  for (const [id, code] of [["fixture-ff-tw", "freefire_tw"], ["fixture-mc-my", "mcgg_my"], ["fixture-blood-mena", "bloodstrike_mena"]]) {
    assert.equal((await GamePackage.findOne({ supplierProductCode: id }).lean()).gameCode, code);
  }
  assert.equal((await GamePackage.findOne({ supplierProductCode: "removed-package" }).lean()).supplierAvailable, false);
  assert.equal((await syncWebBuilderCatalogue({ packages: true })).packages.imported, 0);
  const nullPrice = await GamePackage.findOneAndUpdate({ supplierProductCode: "fixture-hok" }, { $set: { sellingPrice: null, isActive: false } }, { returnDocument: "after" });
  await syncWebBuilderCatalogue({ packages: true, onlyActiveGames: true });
  assert.equal((await GamePackage.findById(nullPrice._id).lean()).sellingPrice, null);
  const before = JSON.stringify(await GamePackage.find({}).sort({ _id: 1 }).lean());
  for (const mode of ["malformed", "duplicate", "incomplete", "empty", "unavailable"]) {
    await fetch(`${base}/test/mode?value=${mode}`);
    const failed = await syncWebBuilderCatalogue({ packages: true });
    assert.ok(failed.packages.failed > 0, mode);
    assert.equal(JSON.stringify(await GamePackage.find({}).sort({ _id: 1 }).lean()), before, `${mode} preserves packages`);
  }
  await fetch(`${base}/test/mode?value=valid`);
  await Game.create({ supplier: "vngzz2", supplierGameCode: "retired-game", slug: "vngzz2-retired", name: "Retired game", image: "/retired.png" });
  await GamePackage.create({ supplier: "vngzz2", gameCode: "retired-game", gameSlug: "vngzz2-retired", supplierProductCode: "retired-product", name: "Retired package", sellingPrice: 7 });
  const vngStats = await syncVngzzCatalogue({ packages: true });
  assert.equal(vngStats.packages.failed, 0);
  assert.equal((await Game.findOne({ supplierGameCode: "retired-game" }).lean()).checkoutSupported, false);
  assert.equal((await GamePackage.findOne({ supplierProductCode: "retired-product" }).lean()).supplierAvailable, false);
  const shared = await GamePackage.find({ supplier: "vngzz2", supplierProductCode: "shared-product" }).lean();
  assert.equal(shared.length, 2, "Identical provider codes stay isolated by game");
  assert.equal(new Set(shared.map(pkg => pkg.gameCode)).size, 2);
  assert.ok(shared.every(pkg => pkg.buyingPrice === 0.76), "Reseller sell_price is the buying price");
  const vngBefore = JSON.stringify(await GamePackage.find({ supplier: "vngzz2" }).sort({ _id: 1 }).lean());
  await fetch(`${base}/test/mode?value=incomplete`);
  assert.equal((await syncVngzzCatalogue({ packages: true })).packages.failed, 2);
  assert.equal(JSON.stringify(await GamePackage.find({ supplier: "vngzz2" }).sort({ _id: 1 }).lean()), vngBefore);
  await fetch(`${base}/test/mode?value=valid`);
  const state = await (await fetch(`${base}/test/state`)).json();
  assert.ok(state.requests.some(request => request.path === "/webbuilder/products"));
  assert.ok(state.requests.some(request => request.path.endsWith("/game/products")));
  assert.ok(state.requests.every(request => request.method === "GET"), "No purchase requests");
  console.log("Supplier catalogue simulation passed: regional isolation, moves, stale stock, custom pricing/artwork, zero margin, duplicate IDs, malformed/incomplete/empty catalogues, 503 failures, repeat sync and VNGZZ2 game-scoped IDs.");
} finally {
  await mongoose.disconnect();
  await database.stop();
}
