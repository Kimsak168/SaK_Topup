import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import {
  getWebBuilderProducts,
  WebBuilderProduct,
} from "@/lib/suppliers/webbuilder";
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

export const G2BULK_ROBLOX_GAME = {
  name: "Roblox",
  slug: "roblox",
  code: "roblox",
  category: "Adventure",
  currencyName: "Robux",
  publisher: "Roblox Corporation",
  requiresServer: false,
  userIdLabel: "Roblox Username",
  image: "/images/roblox.jpg",
  banner: "/images/roblox.jpg",
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
            customImage: isCard ? "/images/roblox.jpg" : "/images/robux-coin.jpg",
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

interface WebBuilderGameDefinition {
  name: string;
  slug: string;
  code: string;
  category: string;
  currencyName: string;
  publisher: string;
  filter: (p: WebBuilderProduct) => boolean;
  requiresServer: boolean;
  serverLabel?: string;
  userIdLabel: string;
  image: string;
  badge?: string;
  isPopular: boolean;
  sortOrder: number;
}

export const WEBBUILDER_GAMES: WebBuilderGameDefinition[] = [
  {
    name: "Free Fire (KHSGMY)",
    slug: "free-fire-khsgmy",
    code: "freefire_khsgmy",
    category: "Battle Royale",
    currencyName: "Diamonds",
    publisher: "Garena",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("free fire")),
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "https://api.g2bulk.com/images/freefire_global.png",
    badge: "HOT",
    isPopular: true,
    sortOrder: 1,
  },
  {
    name: "Mobile Legends",
    slug: "mlbb",
    code: "mlbb",
    category: "MOBA",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("mobile legend")),
    requiresServer: true,
    serverLabel: "Zone ID (4-5 digits)",
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/mlbb_global.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: "Honor of Kings",
    slug: "hok",
    code: "hok",
    category: "MOBA",
    currencyName: "Tokens",
    publisher: "Level Infinite",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("honor of king")),
    requiresServer: false,
    userIdLabel: "Player ID (UID)",
    image: "https://api.g2bulk.com/images/hok.png",
    badge: "TRENDING",
    isPopular: true,
    sortOrder: 3,
  },
  {
    name: "PUBG Mobile",
    slug: "pubg-mobile",
    code: "pubgm",
    category: "Battle Royale",
    currencyName: "UC",
    publisher: "Krafton / Tencent",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("pubg")),
    requiresServer: false,
    userIdLabel: "Character ID",
    image: "https://api.g2bulk.com/images/pubgm.png",
    badge: "POPULAR",
    isPopular: true,
    sortOrder: 4,
  },
  {
    name: "Blood Strike",
    slug: "blood-strike",
    code: "bloodstrike",
    category: "Battle Royale",
    currencyName: "Gold",
    publisher: "NetEase",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("blood strike")),
    requiresServer: false,
    userIdLabel: "User ID",
    image: "https://api.g2bulk.com/images/bloodstrike.png",
    badge: "",
    isPopular: false,
    sortOrder: 5,
  },
  {
    name: "Magic Chess: Go Go",
    slug: "magic-chess-gogo",
    code: "magic_chess",
    category: "Strategy",
    currencyName: "Diamonds",
    publisher: "Moonton",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("magic chess")),
    requiresServer: true,
    serverLabel: "Zone ID",
    userIdLabel: "User ID",
    image: "/images/magic-chess.jpg",
    badge: "NEW",
    isPopular: false,
    sortOrder: 6,
  },
  {
    name: "8 Ball Pool",
    slug: "8-ball-pool",
    code: "8ballpool",
    category: "Sports",
    currencyName: "Cash / Coins",
    publisher: "Miniclip",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("8 ball")),
    requiresServer: false,
    userIdLabel: "Unique ID",
    image: "/images/8ballpool.jpg",
    badge: "",
    isPopular: false,
    sortOrder: 7,
  },
  {
    name: "Telegram Stars",
    slug: "telegram",
    code: "telegram",
    category: "Apps & Social",
    currencyName: "Stars",
    publisher: "Telegram FZ-LLC",
    filter: (p) => Boolean(p.game && p.game.toLowerCase().includes("telegram")),
    requiresServer: false,
    userIdLabel: "Telegram Username",
    image: "/images/telegram-stars.jpg",
    badge: "HOT",
    isPopular: true,
    sortOrder: 8,
  },
];

/**
 * 1. Synchronize all games from WebBuilder API
 * Preserves existing admin customizations (images, descriptions, selling prices, active states).
 */
export async function syncGamesFromSuppliers(options: { supplier?: "webbuilder" | "vngzz2" | "g2bulk" } = {}): Promise<FullSyncResult["games"]> {
  if (options.supplier === "vngzz2") {
    const result = await syncVngzzCatalogue();
    invalidateCatalogueCache();
    return combinedStats({ ...emptyVngzzStats(), supplier: "webbuilder" }, result.games, emptyG2BulkStats());
  }

  if (options.supplier === "g2bulk") {
    const g2Stats = await syncG2BulkRobloxGame();
    invalidateCatalogueCache();
    return combinedStats(
      { ...emptyVngzzStats(), supplier: "webbuilder" },
      emptyVngzzStats(),
      g2Stats
    );
  }
  await connectDB();

  const webbuilderStats: SyncStats = {
    supplier: "webbuilder",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: WEBBUILDER_GAMES.length,
    errors: [],
  };

  try {
    for (const def of WEBBUILDER_GAMES) {
      try {
        const existing = await Game.findOne({
          supplier: "webbuilder",
          $or: [{ slug: def.slug }, { supplierGameCode: def.code }],
        });

        if (!existing) {
          await Game.create({
            slug: def.slug,
            name: def.name,
            supplier: "webbuilder",
            supplierGameCode: def.code,
            category: def.category,
            image: def.image,
            banner: def.image,
            publisher: def.publisher,
            currencyName: def.currencyName,
            description: `Instant ${def.name} automated top-up via WebBuilder API. Safe 24/7 delivery.`,
            requiresServer: def.requiresServer,
            serverLabel: def.serverLabel || "Server ID",
            userIdLabel: def.userIdLabel,
            instruction: "Enter your player account ID from the in-game profile.",
            badge: def.badge || "",
            isPopular: def.isPopular,
            isTrending: def.isPopular,
            isActive: true,
            defaultMarginPercent: 12,
            sortOrder: def.sortOrder,
          });
          webbuilderStats.imported++;
        } else {
          const updateFields: Record<string, unknown> = {
            supplier: "webbuilder",
            supplierGameCode: def.code,
            requiresServer: def.requiresServer,
            serverLabel: def.serverLabel || existing.serverLabel || "Server ID",
            userIdLabel: def.userIdLabel || existing.userIdLabel,
            updatedAt: new Date(),
          };
          if (!existing.image || existing.image === "/images/hero-banner.jpg") {
            updateFields.image = def.image;
            updateFields.banner = def.image;
          }
          await Game.updateOne(
            { _id: existing._id },
            { $set: updateFields }
          );
          webbuilderStats.updated++;
        }
      } catch (gameErr: unknown) {
        webbuilderStats.failed++;
        webbuilderStats.errors.push(
          `Failed to sync WebBuilder game ${def.name}: ${gameErr instanceof Error ? gameErr.message : String(gameErr)}`
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    webbuilderStats.failed++;
    webbuilderStats.errors.push(`WebBuilder games sync error: ${msg}`);
  }

  const vngzzStats = emptyVngzzStats();
  if (options.supplier !== "webbuilder" && options.supplier !== "g2bulk" && isVngzzGameConfigured()) {
    try { Object.assign(vngzzStats, (await syncVngzzCatalogue()).games); }
    catch (error) { vngzzStats.failed++; vngzzStats.errors.push(error instanceof Error ? error.message : "VNGZZ2 sync failed"); }
  }

  let g2bulkStats = emptyG2BulkStats();
  if (options.supplier !== "webbuilder") {
    try {
      g2bulkStats = await syncG2BulkRobloxGame();
    } catch (error) {
      g2bulkStats.failed++;
      g2bulkStats.errors.push(error instanceof Error ? error.message : "G2Bulk sync failed");
    }
  }

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
} = {}): Promise<FullSyncResult["packages"]> {
  if (options.supplier === "vngzz2") {
    const result = await syncVngzzCatalogue({ ...options, packages: true });
    invalidateCatalogueCache();
    return combinedStats({ ...emptyVngzzStats(), supplier: "webbuilder" }, result.packages, emptyG2BulkStats());
  }

  if (options.supplier === "g2bulk" || options.gameCode === "roblox") {
    const g2Stats = await syncG2BulkRobloxPackages();
    invalidateCatalogueCache();
    return combinedStats(
      { ...emptyVngzzStats(), supplier: "webbuilder" },
      emptyVngzzStats(),
      g2Stats
    );
  }
  await connectDB();

  const webbuilderStats: SyncStats = {
    supplier: "webbuilder",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  try {
    const allProducts = await getWebBuilderProducts({ forceRefresh: true });
    webbuilderStats.total = allProducts.length;

    // Filter game definitions if gameCode specified
    const targetGames = options.gameCode
      ? WEBBUILDER_GAMES.filter((g) => g.code === options.gameCode || g.slug === options.gameCode)
      : WEBBUILDER_GAMES;

    for (const def of targetGames) {
      if (options.onlyActiveGames) {
        const gameDoc = await Game.findOne({
          supplier: "webbuilder",
          $or: [{ slug: def.slug }, { supplierGameCode: def.code }],
        }).lean();
        if (gameDoc && !gameDoc.isActive) continue;
      }

      const productsForGame = allProducts.filter(def.filter);

      for (let i = 0; i < productsForGame.length; i++) {
        const prod = productsForGame[i];
        const supplierProductCode = String(prod.id).trim();
        if (!supplierProductCode) {
          webbuilderStats.skipped++;
          continue;
        }

        try {
          const buyingPriceUsd = typeof prod.price_cents === "number" ? prod.price_cents / 100 : null;
          const isOrderable = prod.orderable !== false && prod.status !== "inactive";
          const defaultSellingPrice = buyingPriceUsd
            ? Math.round(buyingPriceUsd * 1.12 * 100) / 100
            : null;

          const existing = await GamePackage.findOne({
            supplier: "webbuilder",
            supplierProductCode,
          });

          if (!existing) {
            await GamePackage.create({
              gameSlug: def.slug,
              gameCode: def.code,
              supplier: "webbuilder",
              supplierProductCode,
              name: prod.name,
              diamondsOrPoints: prod.name,
              buyingPrice: buyingPriceUsd,
              priceCents: prod.price_cents,
              sellingPrice: defaultSellingPrice,
              originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
              currency: prod.currency || "USD",
              badge: "",
              isActive: isOrderable,
              adminConfigured: true,
              sortOrder: i + 1,
              syncedAt: new Date(),
            });
            webbuilderStats.imported++;
          } else {
            await GamePackage.updateOne(
              { _id: existing._id },
              {
                $set: {
                  gameSlug: def.slug,
                  gameCode: def.code,
                  buyingPrice: buyingPriceUsd,
                  priceCents: prod.price_cents,
                  supplierAvailable: isOrderable,
                  syncedAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );
            webbuilderStats.updated++;
          }
        } catch (pkgErr: unknown) {
          webbuilderStats.failed++;
          webbuilderStats.errors.push(
            `Failed to sync package ${supplierProductCode}: ${pkgErr instanceof Error ? pkgErr.message : String(pkgErr)}`
          );
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    webbuilderStats.failed++;
    webbuilderStats.errors.push(`WebBuilder packages fetch error: ${msg}`);
  }

  const vngzzStats = emptyVngzzStats();
  if (options.supplier !== "webbuilder" && options.supplier !== "g2bulk" && isVngzzGameConfigured()) {
    try { Object.assign(vngzzStats, (await syncVngzzCatalogue({ ...options, packages: true })).packages); }
    catch (error) { vngzzStats.failed++; vngzzStats.errors.push(error instanceof Error ? error.message : "VNGZZ2 sync failed"); }
  }

  let g2bulkStats = emptyG2BulkStats();
  if (options.supplier !== "webbuilder" && (!options.gameCode || options.gameCode === "roblox")) {
    try {
      g2bulkStats = await syncG2BulkRobloxPackages();
    } catch (error) {
      g2bulkStats.failed++;
      g2bulkStats.errors.push(error instanceof Error ? error.message : "G2Bulk packages sync failed");
    }
  }

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
