import "./lib/register-typescript.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
const { syncWebBuilderCatalogue } = await import("../src/lib/services/webbuilderSyncService.ts");
const { Game } = await import("../src/models/Game.ts");
const { GamePackage } = await import("../src/models/GamePackage.ts");
const { connectDB } = await import("../src/lib/mongodb.ts");

if (!process.argv.includes("--apply")) {
  console.log("Dry run. Use --apply to sync WebBuilder games and packages while preserving existing admin settings.");
} else {
  try {
    await connectDB();
    const [games, packages] = await Promise.all([Game.find({ supplier: "webbuilder" }).lean(), GamePackage.find({ supplier: "webbuilder" }).lean()]);
    const directory = `.local-backups/webbuilder-sync-${Date.now()}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/database-before.json`, JSON.stringify({ database: mongoose.connection.name, games, packages }, null, 2));
    const stats = await syncWebBuilderCatalogue({
      packages: true,
      gameCode: process.argv.includes("--hok") ? "hok" : undefined,
      recalculateSellingPrices: process.argv.includes("--recalculate-prices"),
    });
    console.log(JSON.stringify({ backup: directory, stats }, null, 2));
    if (stats.games.failed || stats.packages.failed) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
