import "./lib/register-typescript.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
const { normalizeVngzzGames, normalizeVngzzProducts } = await import("../src/lib/suppliers/vngzz2.ts");
const { syncVngzzCatalogue } = await import("../src/lib/services/vngzzSyncService.ts");
const { Game } = await import("../src/models/Game.ts");
const { GamePackage } = await import("../src/models/GamePackage.ts");
const { connectDB } = await import("../src/lib/mongodb.ts");

const directory = "artifacts/vngzz2-catalogue";
const useSnapshot = process.argv.includes("--snapshot");
const snapshot = useSnapshot ? {
  games: normalizeVngzzGames(JSON.parse(await readFile(`${directory}/categories.json`, "utf8"))),
  products: async code => {
    const data = JSON.parse(await readFile(`${directory}/products/${encodeURIComponent(code)}.json`, "utf8"));
    if (data.game?.game_code !== code) throw new Error(`Snapshot game mismatch for ${code}.`);
    return normalizeVngzzProducts(data);
  },
} : undefined;
if (!process.argv.includes("--apply")) {
  console.log("Dry run. Use --apply to import VNGZZ2 games and packages. Existing supplier data, custom prices and visibility settings are preserved.");
  if (snapshot) {
    let products = 0;
    for (const game of snapshot.games) products += (await snapshot.products(game.game_code)).length;
    console.log(JSON.stringify({ games: snapshot.games.length, products }));
  }
} else {
  try {
    await connectDB();
    const existingGames = await Game.find({ supplier: "vngzz2" }).lean();
    const existingPackages = await GamePackage.find({ supplier: "vngzz2" }).lean();
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/before-sync-${Date.now()}.json`, JSON.stringify({ games: existingGames, packages: existingPackages }, null, 2));
    const stats = await syncVngzzCatalogue({ packages: true, source: snapshot });
    const counts = { games: await Game.countDocuments({ supplier: "vngzz2" }), packages: await GamePackage.countDocuments({ supplier: "vngzz2" }), gamesNeedingAdditionalFields: await Game.countDocuments({ supplier: "vngzz2", checkoutSupported: false }) };
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/sync-summary.json`, JSON.stringify({ syncedAt: new Date().toISOString(), stats, counts }, null, 2));
    console.log(JSON.stringify({ stats, counts }, null, 2));
    if (stats.games.failed || stats.packages.failed) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
