import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import {
  getWebBuilderProducts,
  getWebBuilderBalance,
  WebBuilderProduct,
  WebBuilderBalance,
} from "@/lib/suppliers/webbuilder";
import { invalidateCatalogueCache } from "@/lib/services/cacheService";

export interface HonorOfKingsSyncStats {
  supplier: "webbuilder";
  gameCreated: boolean;
  importedPackages: number;
  updatedPackages: number;
  skippedPackages: number;
  failedPackages: number;
  balance?: WebBuilderBalance;
  errors: string[];
  total: number;
}

export const HOK_GAME_SLUG = "honor-of-kings";
export const HOK_GAME_CODE = "hok";

/**
 * Synchronize Honor of Kings from WebBuilder Reseller API
 * Strictly Honor of Kings only.
 * Refreshes published IDs, names, regions, reseller price_cents, and orderable status.
 * Preserves admin custom selling prices, images, and custom descriptions.
 */
export async function syncHonorOfKingsCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<HonorOfKingsSyncStats> {
  await connectDB();

  const stats: HonorOfKingsSyncStats = {
    supplier: "webbuilder",
    gameCreated: false,
    importedPackages: 0,
    updatedPackages: 0,
    skippedPackages: 0,
    failedPackages: 0,
    errors: [],
    total: 0,
  };

  // 1. Check reseller account balance
  try {
    const balance = await getWebBuilderBalance();
    stats.balance = balance;
    console.log(
      `[WebBuilder Sync] Account Balance: $${(balance.available_cents / 100).toFixed(2)} available, $${(balance.reserved_cents / 100).toFixed(2)} reserved.`
    );
  } catch (balErr: unknown) {
    const msg = balErr instanceof Error ? balErr.message : String(balErr);
    stats.errors.push(`Balance check note: ${msg}`);
  }

  // 2. Ensure Honor of Kings Game entity exists in database
  let hokGame = await Game.findOne({
    supplier: "webbuilder",
    $or: [{ slug: HOK_GAME_SLUG }, { supplierGameCode: HOK_GAME_CODE }],
  });

  if (!hokGame) {
    hokGame = await Game.create({
      slug: HOK_GAME_SLUG,
      name: "Honor of Kings",
      supplier: "webbuilder",
      supplierGameCode: HOK_GAME_CODE,
      category: "MOBA",
      image: "https://api.g2bulk.com/images/hok.png", // High quality hero asset
      banner: "https://api.g2bulk.com/images/hok.png",
      publisher: "Level Infinite",
      currencyName: "Tokens",
      description:
        "Official Honor of Kings Tokens instant top-up via WebBuilder API. Automated 24/7 delivery to your player ID.",
      requiresServer: true,
      serverLabel: "Server / Zone ID",
      userIdLabel: "Player ID (UID)",
      instruction:
        "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID and Zone ID.",
      badge: "POPULAR",
      isPopular: true,
      isTrending: true,
      isActive: true,
      defaultMarginPercent: 12,
      sortOrder: 1,
    });
    stats.gameCreated = true;
    console.log("[WebBuilder Sync] Created Honor of Kings game document in database.");
  }

  // 3. Fetch products from WebBuilder (filtered strictly for Honor of Kings)
  let products: WebBuilderProduct[] = [];
  try {
    products = await getWebBuilderProducts({
      forceRefresh: options?.forceRefresh ?? true,
      honorOfKingsOnly: true,
    });
    stats.total = products.length;
  } catch (prodErr: unknown) {
    const msg = prodErr instanceof Error ? prodErr.message : String(prodErr);
    stats.errors.push(`Products fetch error: ${msg}`);
    return stats;
  }

  if (products.length === 0) {
    stats.errors.push("No Honor of Kings products found on WebBuilder /products endpoint.");
    return stats;
  }

  // 4. Upsert each Honor of Kings package
  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const supplierProductCode = String(prod.id).trim(); // Use ID unchanged!

    if (!supplierProductCode) {
      stats.skippedPackages++;
      continue;
    }

    try {
      const existing = await GamePackage.findOne({
        supplier: "webbuilder",
        supplierProductCode,
      });

      const buyingPriceUsd = typeof prod.price_cents === "number" ? prod.price_cents / 100 : null;
      const isOrderable = prod.orderable !== false && prod.status !== "inactive";

      // Extract token number from name (e.g. "80 Tokens" -> "80")
      const tokensMatch = prod.name.match(/\d[\d,]*/);
      const diamondsOrPoints = tokensMatch ? tokensMatch[0].replace(/,/g, "") : prod.name;

      if (!existing) {
        // Create new package - keep sellingPrice null until admin sets selling price
        await GamePackage.create({
          gameSlug: hokGame.slug,
          gameCode: HOK_GAME_CODE,
          supplier: "webbuilder",
          supplierProductCode,
          name: prod.name,
          diamondsOrPoints,
          buyingPrice: buyingPriceUsd,
          priceCents: prod.price_cents,
          sellingPrice: null, // Admin configured in dashboard
          originalPrice: null,
          currency: prod.currency || "USD",
          badge: i === 0 ? "POPULAR" : "",
          isActive: isOrderable,
          adminConfigured: false,
          sortOrder: i + 1,
          syncedAt: new Date(),
        });
        stats.importedPackages++;
      } else {
        // Update supplier wholesale price and availability without overwriting admin configurations
        await GamePackage.updateOne(
          { _id: existing._id },
          {
            $set: {
              buyingPrice: buyingPriceUsd,
              priceCents: prod.price_cents,
              isActive: isOrderable,
              name: existing.name || prod.name,
              syncedAt: new Date(),
            },
          }
        );
        stats.updatedPackages++;
      }
    } catch (pkgErr: unknown) {
      stats.failedPackages++;
      const msg = pkgErr instanceof Error ? pkgErr.message : String(pkgErr);
      stats.errors.push(`Failed to sync product ${supplierProductCode}: ${msg}`);
    }
  }

  invalidateCatalogueCache();
  return stats;
}
