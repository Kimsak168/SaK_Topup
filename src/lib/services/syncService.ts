import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { syncWebBuilderCatalogue } from "./webbuilderSyncService";
export { WEBBUILDER_GAMES } from "@/lib/suppliers/webbuilderCatalogue";
import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { isVngzzGameConfigured } from "@/lib/suppliers/vngzz2";
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
  image: "/images/roblox.webp",
  banner: "/images/roblox.webp",
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
        defaultMarginPercent: 12,
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
        const defaultMargin = robloxGame.defaultMarginPercent || 12;
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
  if (options.supplier === "vngzz2" || options.supplier === "g2bulk") {
    return combinedStats({ ...emptyVngzzStats(), supplier: "webbuilder" }, emptyVngzzStats(), emptyG2BulkStats());
  }

  const { games: webbuilderStats } = await syncWebBuilderCatalogue();
  const vngzzStats = emptyVngzzStats();
  const g2bulkStats = emptyG2BulkStats();

  invalidateCatalogueCache();
  return combinedStats(webbuilderStats, vngzzStats, g2bulkStats);
}

/**
 * 2. Synchronize packages from WebBuilder API
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
  if (options.supplier === "vngzz2" || options.supplier === "g2bulk") {
    return combinedStats({ ...emptyVngzzStats(), supplier: "webbuilder" }, emptyVngzzStats(), emptyG2BulkStats());
  }

  const { packages: webbuilderStats } = await syncWebBuilderCatalogue({ ...options, packages: true });
  const vngzzStats = emptyVngzzStats();
  const g2bulkStats = emptyG2BulkStats();

  invalidateCatalogueCache();
  return combinedStats(webbuilderStats, vngzzStats, g2bulkStats);
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
