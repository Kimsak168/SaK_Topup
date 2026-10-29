import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { getVngzzGames, getVngzzProducts, getVngzzImageUrl, isVngzzCheckoutSupported, type VngzzGame, type VngzzProduct } from "@/lib/suppliers/vngzz2";
import type { SyncStats } from "./syncService";

export function emptyVngzzStats(): SyncStats {
  return { supplier: "vngzz2", imported: 0, updated: 0, skipped: 0, failed: 0, total: 0, errors: [] };
}

export async function syncVngzzCatalogue(options: {
  packages?: boolean;
  gameCode?: string;
  onlyActiveGames?: boolean;
  // A downloaded provider snapshot lets the CLI import the exact reviewed data.
  source?: { games: VngzzGame[]; products: (code: string) => Promise<VngzzProduct[]> };
} = {}) {
  const games = emptyVngzzStats();
  const packages = emptyVngzzStats();
  const categories = options.source?.games ?? await getVngzzGames();
  const selected = options.gameCode ? categories.filter(game => game.game_code === options.gameCode || `vngzz2-${game.game_code.replace(/_/g, "-")}` === options.gameCode) : categories;
  if (options.gameCode && !selected.length) throw new Error("VNGZZ2 game not found in the provider catalogue.");
  if (!categories.length) throw new Error("VNGZZ2 returned no games; the existing catalogue was preserved.");
  await connectDB();
  games.total = selected.length;
  let index = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (index < selected.length) {
      const sortOrder = index;
      const category = selected[index++];
      let gameSaved = false;
      try {
        const code = category.game_code;
        const slug = `vngzz2-${code.replace(/_/g, "-")}`;
        const image = getVngzzImageUrl(category.image_url || category.thumb_url);
        const checkoutSupported = isVngzzCheckoutSupported(category);
        const result = await Game.updateOne({ supplier: "vngzz2", supplierGameCode: code }, {
          $set: { gameFields: category.game_fields, requiresServer: category.game_fields.includes("serverid"), checkoutSupported },
          $setOnInsert: {
            slug, name: category.display_name || category.name, supplier: "vngzz2", supplierGameCode: code,
            image, banner: image, description: category.description || `Top up ${category.name}.`,
            category: /mlbb|magic_chess|hok|league_of_legends|wild_rift/.test(code) ? "MOBA" : /freefire|pubgm|bloodstrike/.test(code) ? "Battle Royale" : "Games",
            publisher: "Official Publisher", currencyName: code === "pubgm" ? "UC" : code === "hok" ? "Tokens" : /freefire|mlbb/.test(code) ? "Diamonds" : "Credits",
            serverLabel: "Server / Zone ID", userIdLabel: code === "telegram" ? "Telegram Username" : "Player ID",
            instruction: category.description || "Enter the account ID from your in-game profile.",
            isActive: false, isPopular: false, isTrending: false, defaultMarginPercent: 12, sortOrder: 100 + sortOrder,
          },
        }, { upsert: true, runValidators: true });
        if (result.upsertedCount) games.imported++; else games.updated++;
        gameSaved = true;
        if (!options.packages) continue;
        const savedGame = await Game.findOne({ supplier: "vngzz2", supplierGameCode: code }).lean();
        if (!savedGame) throw new Error("Imported game could not be read back.");
        if (options.onlyActiveGames && !savedGame.isActive) { packages.skipped++; continue; }
        const products = options.source ? await options.source.products(code) : await getVngzzProducts(code);
        packages.total += products.length;
        const existingPackages = await GamePackage.find({ supplier: "vngzz2", gameCode: code }).select("supplierProductCode").lean();
        const existingCodes = new Set(existingPackages.map(pkg => pkg.supplierProductCode));
        const margin = Number.isFinite(savedGame.defaultMarginPercent) && savedGame.defaultMarginPercent >= 0 ? savedGame.defaultMarginPercent : 12;
        if (products.length) await GamePackage.bulkWrite(products.map((product, i) => {
          const sellingPrice = product.available && product.currency === "USD" ? Math.ceil((product.price * (1 + margin / 100) - 1e-9) * 100) / 100 : null;
          return { updateOne: {
            filter: { supplier: "vngzz2", gameCode: code, supplierProductCode: product.product_code },
            update: {
              $set: { buyingPrice: product.price, priceCents: Math.round(product.price * 100), supplierAvailable: product.available && product.currency === "USD", syncedAt: new Date() },
              $setOnInsert: { gameSlug: savedGame.slug, gameCode: code, supplier: "vngzz2", supplierProductCode: product.product_code, name: product.name, diamondsOrPoints: product.name, sellingPrice, originalPrice: null, currency: product.currency, isActive: false, isFeatured: false, adminConfigured: false, sortOrder: i + 1 },
            },
            upsert: true,
          } };
        }));
        for (const product of products) {
          if (existingCodes.has(product.product_code)) packages.updated++; else packages.imported++;
        }
        // A successful, complete response may mark removed stock unavailable.
        // Preserve admin toggles, custom prices and images, including null prices.
        await GamePackage.updateMany({ supplier: "vngzz2", gameCode: code, supplierProductCode: { $nin: products.map(product => product.product_code) } }, { $set: { supplierAvailable: false, syncedAt: new Date() } });
      } catch (error) {
        const message = `${category.game_code}: ${error instanceof Error ? error.message : "Sync failed"}`;
        if (!gameSaved) { games.failed++; games.errors.push(message); }
        if (options.packages) { packages.failed++; packages.errors.push(message); }
      }
    }
  }));
  return { games, packages };
}
