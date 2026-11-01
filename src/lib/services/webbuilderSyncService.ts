import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { getWebBuilderProducts, normalizeWebBuilderProducts, isWebBuilderProductAvailable, type WebBuilderProduct } from "@/lib/suppliers/webbuilder";
import { WEBBUILDER_GAMES, getWebBuilderGame } from "@/lib/suppliers/webbuilderCatalogue";
import type { SyncStats } from "./syncService";

const emptyStats = (): SyncStats => ({ supplier: "webbuilder", imported: 0, updated: 0, skipped: 0, failed: 0, total: 0, errors: [] });

/** Apply a complete provider snapshot while retaining admin pricing and artwork. */
export async function syncWebBuilderCatalogue(options: {
  packages?: boolean;
  gameCode?: string;
  onlyActiveGames?: boolean;
  source?: WebBuilderProduct[];
} = {}) {
  const games = emptyStats();
  const packages = emptyStats();
  try {
    const products = options.source ? normalizeWebBuilderProducts(options.source) : await getWebBuilderProducts({ forceRefresh: true });
    if (!products.length) throw new Error("WebBuilder returned no products; the existing catalogue was preserved.");
    // Validate every mapping before making changes, including products outside
    // the selected game, so a wrong regional filter cannot silently hide stock.
    const byGame = new Map<string, WebBuilderProduct[]>();
    for (const product of products) {
      const definition = getWebBuilderGame(product);
      if (!definition) {
        packages.errors.push(`Unmapped WebBuilder game: ${product.game || product.id}`);
        packages.failed++;
        continue;
      }
      const list = byGame.get(definition.code) || [];
      list.push(product);
      byGame.set(definition.code, list);
    }
    const targets = options.gameCode
      ? WEBBUILDER_GAMES.filter(game => game.code === options.gameCode || game.slug === options.gameCode)
      : WEBBUILDER_GAMES;
    if (options.gameCode && !targets.length) throw new Error("WebBuilder game not found in the configured catalogue.");
    await connectDB();
    for (const definition of targets) {
      const gameProducts = byGame.get(definition.code) || [];
      let gameSaved = false;
      try {
        let game = await Game.findOne({ supplier: "webbuilder", supplierGameCode: definition.code }).lean();
        if (!game && !gameProducts.length) continue;
        games.total++;
        if (!game) {
          const created = await Game.create({
            slug: definition.slug, name: definition.name, supplier: "webbuilder", supplierGameCode: definition.code,
            category: definition.category, currencyName: definition.currencyName, publisher: definition.publisher,
            image: definition.image, banner: definition.image, description: `Top up ${definition.name}.`,
            requiresServer: definition.requiresServer, checkoutSupported: true,
            gameFields: definition.requiresServer ? ["userid", "serverid"] : ["userid"],
            userIdLabel: definition.userIdLabel, serverLabel: definition.serverLabel || "Server ID",
            isActive: false, isPopular: definition.isPopular, isTrending: false, badge: definition.badge || "",
            defaultMarginPercent: 12, sortOrder: definition.sortOrder,
          });
          game = created.toObject();
          games.imported++;
        } else {
          await Game.updateOne({ _id: game._id }, { $set: {
            requiresServer: definition.requiresServer, checkoutSupported: true,
            gameFields: definition.requiresServer ? ["userid", "serverid"] : ["userid"],
          } });
          games.updated++;
        }
        gameSaved = true;
        if (!options.packages) continue;
        if (options.onlyActiveGames && !game.isActive) { packages.skipped++; continue; }
        packages.total += gameProducts.length;
        const existing = await GamePackage.find({ supplier: "webbuilder", supplierProductCode: { $in: gameProducts.map(product => product.id) } }).lean();
        const byCode = new Map(existing.map(pkg => [pkg.supplierProductCode, pkg]));
        if (byCode.size !== existing.length) throw new Error("Duplicate stored supplier product IDs need review before syncing this game.");
        const margin = Number.isFinite(game.defaultMarginPercent) && game.defaultMarginPercent >= 0 ? game.defaultMarginPercent : 12;
        if (gameProducts.length) await GamePackage.bulkWrite(gameProducts.map((product, index) => {
          const saved = byCode.get(product.id);
          const available = isWebBuilderProductAvailable(product);
          const sellingPrice = available ? Math.ceil((product.price_cents * (1 + margin / 100) - 1e-9)) / 100 : null;
          return { updateOne: {
            filter: saved ? { _id: saved._id } : { supplier: "webbuilder", supplierProductCode: product.id },
            update: {
              $set: { gameSlug: game.slug, gameCode: definition.code, buyingPrice: product.price_cents / 100,
                priceCents: product.price_cents, currency: product.currency, supplierAvailable: available, syncedAt: new Date() },
              $setOnInsert: { supplier: "webbuilder", supplierProductCode: product.id, name: product.name,
                diamondsOrPoints: product.name, sellingPrice, originalPrice: null, isActive: false,
                adminConfigured: false, isFeatured: false, sortOrder: index + 1 },
            }, upsert: true,
          } };
        }));
        for (const product of gameProducts) {
          if (byCode.has(product.id)) packages.updated++; else packages.imported++;
        }
        // Apply removal cleanup to every game, including an empty regional group.
        const cleanup = await GamePackage.updateMany({ supplier: "webbuilder",
          $or: [{ gameCode: definition.code }, { gameSlug: game.slug }],
          supplierProductCode: { $nin: gameProducts.map(product => product.id) }, supplierAvailable: { $ne: false },
        }, { $set: { supplierAvailable: false, syncedAt: new Date() } });
        packages.skipped += cleanup.modifiedCount;
      } catch (error) {
        const message = `${definition.code}: ${error instanceof Error ? error.message : "Sync failed"}`;
        if (!gameSaved) { games.failed++; games.errors.push(message); }
        if (options.packages) { packages.failed++; packages.errors.push(message); }
      }
    }
  } catch (error) {
    const stats = options.packages ? packages : games;
    stats.failed++;
    stats.errors.push(error instanceof Error ? error.message : "WebBuilder sync failed.");
  }
  return { games, packages };
}
