// Read-only provider/DB audit. Snapshots contain catalogue data, never credentials.
import "./lib/register-typescript.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import mongoose from "mongoose";
const { connectDB } = await import("../src/lib/mongodb.ts");
const { Game } = await import("../src/models/Game.ts");
const { GamePackage } = await import("../src/models/GamePackage.ts");
const { getWebBuilderProducts } = await import("../src/lib/suppliers/webbuilder.ts");
const { getVngzzGames, getVngzzProducts } = await import("../src/lib/suppliers/vngzz2.ts");

const directory = `.local-backups/supplier-catalogue-${Date.now()}`;
await mkdir(directory, { recursive: true });
const snapshot = { fetchedAt: new Date().toISOString(), games: [], packages: [], webbuilder: [], vngzz2: [], errors: [] };
const safeError = error => {
  let message = error instanceof Error ? error.message : String(error);
  for (const [key, value] of Object.entries(process.env)) {
    if (/KEY|SECRET|TOKEN|URI|PASSWORD/.test(key) && value) message = message.replaceAll(value, "[redacted]");
  }
  return message.slice(0, 300);
};
try {
  await connectDB();
  snapshot.database = mongoose.connection.name;
  [snapshot.games, snapshot.packages] = await Promise.all([
    Game.find({ supplier: { $in: ["webbuilder", "vngzz2"] } }).lean(),
    GamePackage.find({ supplier: { $in: ["webbuilder", "vngzz2"] } }).lean(),
  ]);
  await writeFile(`${directory}/database-before.json`, JSON.stringify({ games: snapshot.games, packages: snapshot.packages }, null, 2));
  console.log(JSON.stringify({ directory, database: mongoose.connection.name, games: snapshot.games.length, packages: snapshot.packages.length }));
  await Promise.all([
    (async () => {
      try {
        snapshot.webbuilder = await getWebBuilderProducts({ forceRefresh: true });
        const groups = {};
        for (const product of snapshot.webbuilder) {
          const key = `${product.game || "(no game)"} | ${product.region || (product.regions || []).join(",")}`;
          groups[key] = (groups[key] || 0) + 1;
        }
        console.log(JSON.stringify({ supplier: "webbuilder", total: snapshot.webbuilder.length, groups, samples: snapshot.webbuilder.slice(0, 3) }));
      } catch (error) { snapshot.errors.push({ supplier: "webbuilder", error: safeError(error) }); }
    })(),
    (async () => {
      try {
        const games = await getVngzzGames();
        let index = 0;
        await Promise.all(Array.from({ length: 2 }, async () => {
          while (index < games.length) {
            const game = games[index++];
            try {
              snapshot.vngzz2.push({ game, products: await getVngzzProducts(game.game_code) });
            } catch (error) { snapshot.errors.push({ supplier: "vngzz2", game: game.game_code, error: safeError(error) }); }
            if (snapshot.vngzz2.length % 20 === 0) console.log(JSON.stringify({ supplier: "vngzz2", fetched: snapshot.vngzz2.length, total: games.length }));
          }
        }));
        console.log(JSON.stringify({ supplier: "vngzz2", games: games.length, products: snapshot.vngzz2.reduce((sum, entry) => sum + entry.products.length, 0) }));
      } catch (error) { snapshot.errors.push({ supplier: "vngzz2", error: safeError(error) }); }
    })(),
  ]);
  await writeFile(`${directory}/snapshot.json`, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ snapshot: `${directory}/snapshot.json`, errors: snapshot.errors }));
  if (snapshot.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
