import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import {
  getWebBuilderProducts,
  getWebBuilderBalance,
  WebBuilderProduct,
} from "@/lib/suppliers/webbuilder";
import { invalidateCatalogueCache } from "@/lib/services/cacheService";

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
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  packages?: {
    webbuilder: SyncStats;
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  timestamp: string;
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
export async function syncGamesFromSuppliers(): Promise<FullSyncResult["games"]> {
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

  invalidateCatalogueCache();

  return {
    webbuilder: webbuilderStats,
    totalImported: webbuilderStats.imported,
    totalUpdated: webbuilderStats.updated,
    totalSkipped: webbuilderStats.skipped,
    totalFailed: webbuilderStats.failed,
  };
}

/**
 * 2. Synchronize packages from WebBuilder API
 * Preserves customer selling prices, custom package images, admin availability toggles, and badges.
 */
export async function syncPackagesFromSuppliers(options: {
  gameCode?: string;
  supplier?: "webbuilder";
  onlyActiveGames?: boolean;
} = {}): Promise<FullSyncResult["packages"]> {
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
                  isActive: isOrderable,
                  sellingPrice: existing.sellingPrice || defaultSellingPrice,
                  originalPrice:
                    existing.originalPrice ||
                    (defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null),
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

  invalidateCatalogueCache();

  return {
    webbuilder: webbuilderStats,
    totalImported: webbuilderStats.imported,
    totalUpdated: webbuilderStats.updated,
    totalSkipped: webbuilderStats.skipped,
    totalFailed: webbuilderStats.failed,
  };
}
