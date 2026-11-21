import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { syncWebBuilderCatalogue } from "./webbuilderSyncService";
export { WEBBUILDER_GAMES } from "@/lib/suppliers/webbuilderCatalogue";
import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { isVngzzGameConfigured, getVngzzProducts } from "@/lib/suppliers/vngzz2";
import { syncVngzzCatalogue, emptyVngzzStats } from "./vngzzSyncService";
import { getG2BulkRobloxProducts } from "@/lib/suppliers/g2bulk";

export interface SyncStats {
  supplier: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
  errors: string[];
}

export interface FullSyncResult {
  success: boolean;
  games: {
    webbuilder: SyncStats;
    vngzz2?: SyncStats;
    g2bulk?: SyncStats;
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  packages?: {
    webbuilder: SyncStats;
    vngzz2?: SyncStats;
    g2bulk?: SyncStats;
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  timestamp: string;
}

export function emptyG2BulkStats(): SyncStats {
  return {
    supplier: "g2bulk",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };
}

function getPersistentSupplierImageUrl(value?: string | null): string | undefined {
  const imageUrl = value?.trim();
  if (!imageUrl || /^(?:blob|data):/i.test(imageUrl)) return undefined;
  if (imageUrl.startsWith("/") && !imageUrl.startsWith("//")) return imageUrl;

  try {
    return new URL(imageUrl).protocol === "https:" ? imageUrl : undefined;
  } catch {
    return undefined;
  }
}

export const G2BULK_ROBLOX_GAME = {
  name: "Roblox",
  slug: "roblox",
  code: "roblox",
  category: "Adventure",
  currencyName: "Robux",
  publisher: "Roblox Corporation",
  requiresServer: false,
  userIdLabel: "Roblox Username",
  image: "/images/roblox-official.webp?v=2026",
  banner: "/images/roblox-official.webp?v=2026",
  badge: "HOT",
  isPopular: true,
  sortOrder: 5,
};

export async function syncG2BulkRobloxGame(): Promise<SyncStats> {
  await connectDB();
  const stats = emptyG2BulkStats();
  stats.total = 1;

  try {
    const existing = await Game.findOne({
      supplier: "g2bulk",
      $or: [{ slug: G2BULK_ROBLOX_GAME.slug }, { supplierGameCode: G2BULK_ROBLOX_GAME.code }],
    });

    if (!existing) {
      await Game.create({
        slug: G2BULK_ROBLOX_GAME.slug,
        name: G2BULK_ROBLOX_GAME.name,
        supplier: "g2bulk",
        supplierGameCode: G2BULK_ROBLOX_GAME.code,
        category: G2BULK_ROBLOX_GAME.category,
        image: G2BULK_ROBLOX_GAME.image,
        banner: G2BULK_ROBLOX_GAME.banner,
        publisher: G2BULK_ROBLOX_GAME.publisher,
        currencyName: G2BULK_ROBLOX_GAME.currencyName,
        description: "Instant automated Roblox Robux recharge & digital Gift Cards via G2Bulk. Safe 24/7 delivery.",
        requiresServer: false,
        userIdLabel: G2BULK_ROBLOX_GAME.userIdLabel,
        instruction: "Enter your Roblox Username (or User ID) to recharge Robux or Gift Cards.",
        badge: G2BULK_ROBLOX_GAME.badge,
        isPopular: true,
        isTrending: true,
        isActive: true,
        defaultMarginPercent: 10,
        sortOrder: G2BULK_ROBLOX_GAME.sortOrder,
      });
      stats.imported++;
    } else {
      await Game.updateOne(
        { _id: existing._id },
        {
          $set: {
            supplier: "g2bulk",
            supplierGameCode: G2BULK_ROBLOX_GAME.code,
            requiresServer: false,
            userIdLabel: G2BULK_ROBLOX_GAME.userIdLabel,
            isActive: true,
            image: existing.image || G2BULK_ROBLOX_GAME.image,
            banner: existing.banner || G2BULK_ROBLOX_GAME.banner,
            updatedAt: new Date(),
          },
        }
      );
      stats.updated++;
    }
  } catch (err: unknown) {
    stats.failed++;
    stats.errors.push(`Failed to sync G2Bulk Roblox game: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stats;
}

export async function syncG2BulkRobloxPackages(): Promise<SyncStats> {
  await connectDB();
  const stats = emptyG2BulkStats();

  try {
    const robloxGame = await Game.findOne({
      supplier: "g2bulk",
      $or: [{ slug: G2BULK_ROBLOX_GAME.slug }, { supplierGameCode: G2BULK_ROBLOX_GAME.code }],
    });

    if (!robloxGame) {
      stats.failed++;
      stats.errors.push("Roblox game record not found in database. Please sync games first.");
      return stats;
    }

    const products = await getG2BulkRobloxProducts();
    // Prioritize popular Global Robux and US Gift Cards
    const relevantProducts = products.filter((p) => {
      const cat = (p.category_title || "").toLowerCase();
      return cat.includes("global") || cat.includes("us giftcard");
    });
    const listToSync = relevantProducts.length > 0 ? relevantProducts : products;
    stats.total = listToSync.length;

    for (const prod of listToSync) {
      try {
        const prodId = String(prod.id);
        const wholesaleCost = Number(prod.unit_price) || 0;
        const defaultMargin = robloxGame.defaultMarginPercent || 10;
        const computedSellingPrice = Math.round(wholesaleCost * (1 + defaultMargin / 100) * 100) / 100;
        const computedOriginalPrice = Math.round(computedSellingPrice * 1.15 * 100) / 100;

        const isCard = prod.title.toLowerCase().includes("us") || prod.title.toLowerCase().includes("$");
        const fallbackImage = isCard ? "/images/roblox.webp" : "/images/robux-coin.webp";
        const supplierImage = getPersistentSupplierImageUrl(prod.image_url);
        const badge = prod.title.includes("800") || prod.title.includes("20$") ? "HOT" : prod.title.includes("1000") || prod.title.includes("200 Robux") ? "POPULAR" : "";

        const existing = await GamePackage.findOne({
          supplier: "g2bulk",
          supplierProductCode: prodId,
        });

        if (!existing) {
          await GamePackage.create({
            gameSlug: "roblox",
            gameCode: "roblox",
            supplier: "g2bulk",
            supplierProductCode: prodId,
            name: prod.title,
            diamondsOrPoints: prod.title,
            buyingPrice: wholesaleCost,
            sellingPrice: computedSellingPrice,
            originalPrice: computedOriginalPrice,
            currency: "USD",
            customImage: supplierImage || fallbackImage,
            badge,
            isActive: true,
            supplierAvailable: prod.stock !== 0,
            adminConfigured: false,
            sortOrder: Math.round(wholesaleCost * 10),
          });
          stats.imported++;
        } else {
          const updateFields: Record<string, unknown> = {
            gameSlug: "roblox",
            gameCode: "roblox",
            supplier: "g2bulk",
            name: prod.title,
            diamondsOrPoints: prod.title,
            buyingPrice: wholesaleCost,
            supplierAvailable: prod.stock !== 0,
            updatedAt: new Date(),
          };

          if (!existing.adminConfigured) {
            updateFields.sellingPrice = computedSellingPrice;
            updateFields.originalPrice = computedOriginalPrice;
          }

          // Supplier artwork can replace only the sync-generated fallback; keep admin image choices intact.
          if (supplierImage && (!existing.customImage || existing.customImage === fallbackImage)) {
            updateFields.customImage = supplierImage;
          }

          await GamePackage.updateOne({ _id: existing._id }, { $set: updateFields });
          stats.updated++;
        }
      } catch (pkgErr: unknown) {
        stats.failed++;
        stats.errors.push(`Failed to sync Roblox package ${prod.id}: ${pkgErr instanceof Error ? pkgErr.message : String(pkgErr)}`);
      }
    }
  } catch (err: unknown) {
    stats.failed++;
    stats.errors.push(`G2Bulk Roblox packages sync error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stats;
}

/**
 * 1. Synchronize all games from WebBuilder API
 * Preserves existing admin customizations (images, descriptions, selling prices, active states).
 */
export async function syncGamesFromSuppliers(options: { supplier?: "webbuilder" | "vngzz2" | "g2bulk" } = {}): Promise<FullSyncResult["games"]> {
  let webbuilderStats = { ...emptyVngzzStats(), supplier: "webbuilder" };
  let vngzzStats = emptyVngzzStats();
  const g2bulkStats = emptyG2BulkStats();

  if (options.supplier !== "vngzz2" && options.supplier !== "g2bulk") {
    const res = await syncWebBuilderCatalogue();
    webbuilderStats = res.games;
  }
  if (options.supplier === "vngzz2" && isVngzzGameConfigured()) {
    const res = await syncVngzzCatalogue();
    vngzzStats = res.games;
  }

  invalidateCatalogueCache();
  return combinedStats(webbuilderStats, vngzzStats, g2bulkStats);
}

/**
 * 2. Synchronize packages from WebBuilder API / VngZz2
 * Preserves customer selling prices, custom package images, admin availability toggles, and badges.
 */
export async function syncPackagesFromSuppliers(options: {
  gameCode?: string;
  supplier?: "webbuilder" | "vngzz2" | "g2bulk";
  onlyActiveGames?: boolean;
  recalculateSellingPrices?: boolean;
} = {}): Promise<FullSyncResult["packages"]> {
  if (options.gameCode && !options.supplier) {
    await connectDB();
    const selectedGame = await Game.findOne({ slug: options.gameCode }).lean();
    if (selectedGame) options = { ...options, supplier: selectedGame.supplier, gameCode: selectedGame.supplierGameCode };
  }

  let webbuilderStats = { ...emptyVngzzStats(), supplier: "webbuilder" };
  let vngzzStats = emptyVngzzStats();
  const g2bulkStats = emptyG2BulkStats();

  if (!options.supplier || options.supplier === "webbuilder") {
    const res = await syncWebBuilderCatalogue({ ...options, packages: true });
    webbuilderStats = res.packages;
  }
  if ((!options.supplier || options.supplier === "vngzz2") && isVngzzGameConfigured()) {
    const res = await syncVngzzCatalogue({ packages: true, gameCode: options.gameCode, onlyActiveGames: options.onlyActiveGames });
    vngzzStats = res.packages;
  }
  if ((!options.supplier || options.supplier === "g2bulk") && (!options.gameCode || options.gameCode === "roblox")) {
    const res = await syncG2BulkRobloxPackages();
    g2bulkStats.imported += res.imported;
    g2bulkStats.updated += res.updated;
    g2bulkStats.skipped += res.skipped;
    g2bulkStats.failed += res.failed;
    g2bulkStats.total += res.total;
    g2bulkStats.errors.push(...res.errors);
  }

  invalidateCatalogueCache();
  return combinedStats(webbuilderStats, vngzzStats, g2bulkStats);
}

export interface StockSyncResult {
  checkedGames: number;
  updatedPackages: number;
  outOfStockPackages: number;
  inStockPackages: number;
  durationMs: number;
  errors: string[];
}

/**
 * Periodically verifies supplier stock/availability for active games.
 * Marks out-of-stock items supplierAvailable: false so storefront displays them as out of stock.
 */
export async function reconcileActiveSupplierStock(maxDurationMs = 15000): Promise<StockSyncResult> {
  const started = Date.now();
  const summary: StockSyncResult = {
    checkedGames: 0,
    updatedPackages: 0,
    outOfStockPackages: 0,
    inStockPackages: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    await connectDB();

    // 1. Reconcile active VNGZZ2 games stock
    if (isVngzzGameConfigured()) {
      const activeVngzzGames = await Game.find({
        supplier: "vngzz2",
        isActive: true,
      }).select("supplierGameCode slug").lean();

      for (const game of activeVngzzGames) {
        if (Date.now() - started > maxDurationMs) break;
        summary.checkedGames++;
        try {
          const products = await getVngzzProducts(game.supplierGameCode);
          if (Array.isArray(products) && products.length > 0) {
            const bulkOps = products.map((prod) => {
              const isAvailable = Boolean(prod.available && prod.currency === "USD");
              if (isAvailable) {
                summary.inStockPackages++;
              } else {
                summary.outOfStockPackages++;
              }
              return {
                updateOne: {
                  filter: {
                    supplier: "vngzz2" as const,
                    gameCode: game.supplierGameCode,
                    supplierProductCode: prod.product_code,
                  },
                  update: {
                    $set: {
                      supplierAvailable: isAvailable,
                      buyingPrice: prod.price,
                      priceCents: Math.round(prod.price * 100),
                      syncedAt: new Date(),
                    },
                  },
                },
              };
            });

            const res = await GamePackage.bulkWrite(bulkOps);
            summary.updatedPackages += (res.modifiedCount || 0);

            // Mark any package not in supplier's active product list as supplierAvailable: false
            const productCodes = products.map((p) => p.product_code);
            const staleRes = await GamePackage.updateMany(
              {
                supplier: "vngzz2",
                gameCode: game.supplierGameCode,
                supplierProductCode: { $nin: productCodes },
                supplierAvailable: { $ne: false },
              },
              {
                $set: { supplierAvailable: false, syncedAt: new Date() },
              }
            );
            if (staleRes.modifiedCount > 0) {
              summary.updatedPackages += staleRes.modifiedCount;
              summary.outOfStockPackages += staleRes.modifiedCount;
            }
          }
        } catch (gameErr) {
          summary.errors.push(`VNGZZ2 ${game.supplierGameCode}: ${gameErr instanceof Error ? gameErr.message : String(gameErr)}`);
        }
      }
    }

    // 2. Reconcile active G2Bulk Roblox stock
    if (Date.now() - started <= maxDurationMs) {
      const activeRoblox = await Game.findOne({
        supplier: "g2bulk",
        isActive: true,
      }).lean();

      if (activeRoblox) {
        summary.checkedGames++;
        try {
          const robloxProducts = await getG2BulkRobloxProducts();
          if (Array.isArray(robloxProducts) && robloxProducts.length > 0) {
            const bulkOps = robloxProducts.map((prod) => {
              const isAvailable = Boolean(prod.stock !== 0);
              if (isAvailable) {
                summary.inStockPackages++;
              } else {
                summary.outOfStockPackages++;
              }
              return {
                updateOne: {
                  filter: {
                    supplier: "g2bulk" as const,
                    supplierProductCode: String(prod.id),
                  },
                  update: {
                    $set: {
                      supplierAvailable: isAvailable,
                      buyingPrice: Number(prod.unit_price) || 0,
                      updatedAt: new Date(),
                    },
                  },
                },
              };
            });
            const res = await GamePackage.bulkWrite(bulkOps);
            summary.updatedPackages += (res.modifiedCount || 0);
          }
        } catch (robloxErr) {
          summary.errors.push(`G2Bulk Roblox: ${robloxErr instanceof Error ? robloxErr.message : String(robloxErr)}`);
        }
      }
    }

    if (summary.updatedPackages > 0) {
      invalidateCatalogueCache();
    }
  } catch (err) {
    summary.errors.push(`reconcileActiveSupplierStock: ${err instanceof Error ? err.message : String(err)}`);
  }

  summary.durationMs = Date.now() - started;
  return summary;
}

function combinedStats(webbuilder: SyncStats, vngzz2: SyncStats, g2bulk?: SyncStats) {
  const g2 = g2bulk || emptyG2BulkStats();
  return {
    webbuilder,
    vngzz2,
    g2bulk: g2,
    totalImported: webbuilder.imported + vngzz2.imported + g2.imported,
    totalUpdated: webbuilder.updated + vngzz2.updated + g2.updated,
    totalSkipped: webbuilder.skipped + vngzz2.skipped + g2.skipped,
    totalFailed: webbuilder.failed + vngzz2.failed + g2.failed,
  };
}
