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
    $or: [{ slug: HOK_GAME_SLUG }, { slug: "hok" }, { supplierGameCode: HOK_GAME_CODE }],
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
      requiresServer: false,
      userIdLabel: "Player ID (UID)",
      instruction:
        "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID.",
      badge: "POPULAR",
      isPopular: true,
      isTrending: true,
      isActive: true,
      defaultMarginPercent: 12,
      sortOrder: 1,
    });
    stats.gameCreated = true;
    console.log("[WebBuilder Sync] Created Honor of Kings game document in database.");
  } else {
    await Game.updateOne(
      { _id: hokGame._id },
      {
        $set: {
          requiresServer: false,
          userIdLabel: "Player ID (UID)",
          instruction:
            "Open Honor of Kings, tap your avatar to open profile. Locate your numeric UID.",
          updatedAt: new Date(),
        },
        $unset: {
          serverLabel: "",
        },
      }
    );
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

export interface FreeFireSyncStats {
  supplier: "webbuilder";
  gameCreated: boolean;
  importedPackages: number;
  updatedPackages: number;
  deactivatedStalePackages: number;
  skippedPackages: number;
  failedPackages: number;
  balance?: WebBuilderBalance;
  errors: string[];
  total: number;
}

export const FREE_FIRE_GAME_SLUG = "free-fire-khsgmy";
export const FREE_FIRE_GAME_CODE = "freefire_khsgmy";

/**
 * Synchronize Free Fire (KHSGMY) from WebBuilder Reseller API
 * Refreshes published IDs, names, regions, reseller price_cents, and orderable status.
 * Automatically deactivates old/stale packages that no longer exist on WebBuilder.
 */
export async function syncFreeFireCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<FreeFireSyncStats> {
  await connectDB();

  const stats: FreeFireSyncStats = {
    supplier: "webbuilder",
    gameCreated: false,
    importedPackages: 0,
    updatedPackages: 0,
    deactivatedStalePackages: 0,
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

  // 2. Ensure Free Fire Game entity exists in database
  let ffGame = await Game.findOne({
    supplier: "webbuilder",
    $or: [
      { slug: FREE_FIRE_GAME_SLUG },
      { slug: "free-fire-sgmy" },
      { slug: "free-fire" },
      { supplierGameCode: FREE_FIRE_GAME_CODE },
      { supplierGameCode: "freefire_sgmy" },
      { name: /free fire/i },
    ],
  });

  const ffArtwork = ffGame?.customImage || ffGame?.image || "https://api.g2bulk.com/images/freefire_global.png";

  if (!ffGame) {
    ffGame = await Game.create({
      slug: FREE_FIRE_GAME_SLUG,
      name: "Free Fire (KHSGMY)",
      supplier: "webbuilder",
      supplierGameCode: FREE_FIRE_GAME_CODE,
      category: "Battle Royale",
      image: ffArtwork,
      banner: ffArtwork,
      publisher: "Garena",
      currencyName: "Diamonds",
      description:
        "Official Garena Free Fire Diamonds instant top-up via WebBuilder API. Automated 24/7 delivery for Cambodia, Singapore, and Malaysia players.",
      requiresServer: false,
      serverLabel: "Server ID",
      userIdLabel: "Player ID (UID)",
      instruction:
        "Open Free Fire, tap your avatar at the top left. Your numeric Player ID is displayed under your nickname.",
      badge: "HOT DEAL",
      isPopular: true,
      isTrending: true,
      isActive: true,
      defaultMarginPercent: 12,
      sortOrder: 1,
    });
    stats.gameCreated = true;
    console.log("[WebBuilder Sync] Created Free Fire (KHSGMY) game document in database.");
  } else {
    await Game.updateOne(
      { _id: ffGame._id },
      {
        $set: {
          name: "Free Fire (KHSGMY)",
          supplier: "webbuilder",
          supplierGameCode: FREE_FIRE_GAME_CODE,
          slug: FREE_FIRE_GAME_SLUG,
          requiresServer: false,
          userIdLabel: "Player ID (UID)",
          currencyName: "Diamonds",
          isActive: true,
          updatedAt: new Date(),
        },
      }
    );
  }

  // 3. Fetch products from WebBuilder (filtered for Free Fire)
  let products: WebBuilderProduct[] = [];
  try {
    const allProducts = await getWebBuilderProducts({
      forceRefresh: options?.forceRefresh ?? true,
    });
    products = allProducts.filter(
      (p) =>
        p.game === "Free Fire KHSGMY" ||
        p.game === "Free Fire SGMY" ||
        (p.game && p.game.toLowerCase().includes("free fire"))
    );
    stats.total = products.length;
  } catch (prodErr: unknown) {
    const msg = prodErr instanceof Error ? prodErr.message : String(prodErr);
    stats.errors.push(`Products fetch error: ${msg}`);
    return stats;
  }

  if (products.length === 0) {
    stats.errors.push("No Free Fire products found on WebBuilder /products endpoint.");
    return stats;
  }

  // Deactivate any stale WebBuilder Free Fire packages not in the live products list
  const validCodes = products.map((p) => String(p.id).trim());
  const staleResult = await GamePackage.updateMany(
    {
      supplier: "webbuilder",
      $or: [{ gameCode: /freefire/i }, { gameSlug: /free-fire/i }],
      supplierProductCode: { $nin: validCodes },
    },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  stats.deactivatedStalePackages = staleResult.modifiedCount;

  // 4. Upsert each Free Fire package
  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const supplierProductCode = String(prod.id).trim();

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

      const isNumeric = /^\d+$/.test(prod.name.trim());
      const displayName = isNumeric
        ? `${prod.name} Diamonds`
        : prod.name === "Weekly"
        ? "Weekly Membership"
        : prod.name === "Monthly"
        ? "Monthly Membership"
        : prod.name;
      const diamondsOrPoints = isNumeric ? prod.name : prod.name;

      // Default ~12% markup
      const defaultSellingPrice = buyingPriceUsd
        ? Math.round(buyingPriceUsd * 1.12 * 100) / 100
        : null;

      // Badges & sort orders
      let badge = "";
      if (prod.name === "100") badge = "POPULAR";
      else if (prod.name === "Weekly") badge = "HOT";
      else if (prod.name === "Monthly") badge = "BEST VALUE";

      let sortOrder = i + 1;
      if (isNumeric) {
        const num = parseInt(prod.name, 10);
        if (num === 25) sortOrder = 1;
        else if (num === 100) sortOrder = 2;
        else if (num === 310) sortOrder = 3;
        else if (num === 520) sortOrder = 4;
        else if (num === 1060) sortOrder = 5;
        else if (num === 2180) sortOrder = 6;
        else if (num === 5600) sortOrder = 7;
        else if (num === 11500) sortOrder = 8;
        else sortOrder = 9;
      } else if (prod.name.includes("Weekly Lite")) {
        sortOrder = 10;
      } else if (prod.name === "Weekly") {
        sortOrder = 11;
      } else if (prod.name === "Monthly") {
        sortOrder = 12;
      } else {
        sortOrder = 20 + i;
      }

      if (!existing) {
        await GamePackage.create({
          gameSlug: ffGame.slug,
          gameCode: FREE_FIRE_GAME_CODE,
          supplier: "webbuilder",
          supplierProductCode,
          name: displayName,
          diamondsOrPoints,
          buyingPrice: buyingPriceUsd,
          priceCents: prod.price_cents,
          sellingPrice: defaultSellingPrice,
          originalPrice: defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null,
          currency: prod.currency || "USD",
          badge,
          isActive: isOrderable,
          adminConfigured: true,
          sortOrder,
          syncedAt: new Date(),
        });
        stats.importedPackages++;
      } else {
        await GamePackage.updateOne(
          { _id: existing._id },
          {
            $set: {
              gameSlug: ffGame.slug,
              gameCode: FREE_FIRE_GAME_CODE,
              buyingPrice: buyingPriceUsd,
              priceCents: prod.price_cents,
              isActive: isOrderable,
              name: existing.name || displayName,
              sellingPrice: existing.sellingPrice || defaultSellingPrice,
              originalPrice:
                existing.originalPrice ||
                (defaultSellingPrice ? Math.round(defaultSellingPrice * 1.15 * 100) / 100 : null),
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
