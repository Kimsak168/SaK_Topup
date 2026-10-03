import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { getVizoCategories, getVizoPackages, VizoProduct } from "@/lib/suppliers/vizo";
import { getG2BulkGames, getG2BulkCatalogue, G2BulkCatalogueItem } from "@/lib/suppliers/g2bulk";

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
    vizo: SyncStats;
    g2bulk: SyncStats;
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  packages?: {
    vizo: SyncStats;
    g2bulk: SyncStats;
    totalImported: number;
    totalUpdated: number;
    totalSkipped: number;
    totalFailed: number;
  };
  timestamp: string;
}

/**
 * Infer game category based on game name for clean UI categorization
 */
function inferCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("battle") || lower.includes("fire") || lower.includes("pubg") || lower.includes("strike") || lower.includes("arena")) {
    return "Battle Royale";
  }
  if (lower.includes("legend") || lower.includes("moba") || lower.includes("lol") || lower.includes("rift") || lower.includes("dota")) {
    return "MOBA";
  }
  if (lower.includes("call of duty") || lower.includes("cod") || lower.includes("valorant") || lower.includes("fps") || lower.includes("shooter") || lower.includes("overwatch")) {
    return "Action";
  }
  if (lower.includes("genshin") || lower.includes("honkai") || lower.includes("ragnarok") || lower.includes("rpg") || lower.includes("wuthering")) {
    return "RPG";
  }
  if (lower.includes("clash") || lower.includes("strategy") || lower.includes("empire") || lower.includes("tactic") || lower.includes("chess")) {
    return "Strategy";
  }
  if (lower.includes("gift") || lower.includes("card") || lower.includes("steam") || lower.includes("playstation") || lower.includes("xbox") || lower.includes("roblox") || lower.includes("nintendo")) {
    return "Gift Cards";
  }
  return "Action";
}

/**
 * Infer in-game currency name
 */
function inferCurrency(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("free fire") || lower.includes("mobile legend") || lower.includes("mlbb")) return "Diamonds";
  if (lower.includes("pubg")) return "UC";
  if (lower.includes("valorant")) return "VP (Points)";
  if (lower.includes("blood strike")) return "Gold";
  if (lower.includes("genshin")) return "Genesis Crystals";
  if (lower.includes("honkai")) return "Oneiric Shards";
  if (lower.includes("roblox")) return "Robux";
  if (lower.includes("clash")) return "Gems";
  if (lower.includes("arena breakout")) return "Bonds";
  return "In-Game Points";
}

/**
 * Generate a clean URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 1. Synchronize all games from real supplier APIs (Vizo & G2Bulk)
 * Preserves existing admin customizations (images, descriptions, selling prices, active states).
 */
export async function syncGamesFromSuppliers(): Promise<FullSyncResult["games"]> {
  await connectDB();

  const vizoStats: SyncStats = {
    supplier: "vizo",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  const g2bulkStats: SyncStats = {
    supplier: "g2bulk",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  // ==========================================
  // 1. SYNC VIZO GAMES (Focus on Free Fire)
  // ==========================================
  try {
    const vizoCategories = await getVizoCategories();
    vizoStats.total = vizoCategories.length;

    // Free Fire must use Vizo exclusively (Global and SGMY)
    const freeFireConfigs = [
      {
        code: "freefire_global",
        slug: "free-fire",
        name: "Free Fire",
        sortOrder: 1,
      },
      {
        code: "freefire_sgmy",
        slug: "free-fire-sgmy",
        name: "Free Fire (SGMY)",
        sortOrder: 2,
      },
    ];

    let foundAnyFF = false;
    for (const ffConfig of freeFireConfigs) {
      const freeFireCat = vizoCategories.find((c) => c.game_code === ffConfig.code);
      if (!freeFireCat) continue;
      foundAnyFF = true;

      const code = ffConfig.code;
      const existing = await Game.findOne({ supplier: "vizo", supplierGameCode: code });

      if (!existing) {
        await Game.create({
          slug: ffConfig.slug,
          name: ffConfig.name,
          supplier: "vizo",
          supplierGameCode: code,
          category: "Battle Royale",
          image: "https://api.g2bulk.com/images/freefire_global.png",
          banner: "https://api.g2bulk.com/images/freefire_global.png",
          publisher: "Garena",
          currencyName: "Diamonds",
          description:
            freeFireCat.description ||
            `Instant Free Fire Diamonds automated top-up for ${ffConfig.name} via Vizo API.`,
          requiresServer: freeFireCat.requires_server || false,
          serverLabel: "Server ID",
          userIdLabel: "Player ID (UID)",
          instruction:
            "Open Free Fire, tap your avatar at the top left. Your numeric Player ID is displayed under your nickname.",
          badge: "HOT DEAL",
          isPopular: true,
          isTrending: true,
          isActive: true,
          defaultMarginPercent: 12,
          sortOrder: ffConfig.sortOrder,
        });
        vizoStats.imported++;
      } else {
        await Game.updateOne(
          { _id: existing._id },
          {
            $set: {
              image: existing.image || "https://api.g2bulk.com/images/freefire_global.png",
              requiresServer: freeFireCat.requires_server || false,
              updatedAt: new Date(),
            },
          }
        );
        vizoStats.updated++;
      }
    }

    if (!foundAnyFF) {
      vizoStats.errors.push("Free Fire categories not found on Vizo catalogue");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vizoStats.failed++;
    vizoStats.errors.push(`Vizo games fetch error: ${msg}`);
  }

  // ==========================================
  // 2. SYNC G2BULK DIRECT TOP-UP GAMES
  // ==========================================
  try {
    const g2Games = await getG2BulkGames();
    g2bulkStats.total = g2Games.length;

    for (const g of g2Games) {
      const rawCode = g.code?.trim();
      if (!rawCode) {
        g2bulkStats.skipped++;
        continue;
      }

      // STRICT REQUIREMENT: Exclude Free Fire from G2Bulk (it belongs to Vizo!)
      if (
        rawCode.toLowerCase().includes("freefire") ||
        rawCode.toLowerCase() === "ff" ||
        g.name.toLowerCase().includes("free fire")
      ) {
        g2bulkStats.skipped++;
        continue;
      }

      try {
        const existing = await Game.findOne({ supplier: "g2bulk", supplierGameCode: rawCode });

        if (!existing) {
          // Determine friendly slug
          let slug = slugify(g.name || rawCode);
          // Check if slug taken by another game
          const slugExists = await Game.findOne({ slug });
          if (slugExists) {
            slug = `${slugify(rawCode)}-g2`;
          }

          // Well-known games get enabled by default
          const isFeatured =
            rawCode === "pubgm" ||
            rawCode === "mlbb_global" ||
            rawCode === "valorant" ||
            rawCode === "bloodstrike" ||
            rawCode === "arena_breakout";

          await Game.create({
            slug,
            name: g.name,
            supplier: "g2bulk",
            supplierGameCode: rawCode,
            category: inferCategory(g.name),
            image: g.image_url || "/images/hero-banner.jpg",
            publisher: "Official Publisher",
            currencyName: inferCurrency(g.name),
            description: `Automated instant top-up for ${g.name}. Safe and fast 24/7 delivery.`,
            requiresServer: rawCode.includes("mlbb"),
            serverLabel: rawCode.includes("mlbb") ? "Zone ID (4-5 digits)" : "Server ID",
            userIdLabel: "User ID",
            instruction: "Enter your player account ID from the in-game profile.",
            badge: isFeatured ? "POPULAR" : "",
            isPopular: isFeatured,
            isTrending: isFeatured,
            isActive: isFeatured, // Admin can toggle on/off any imported game in /admin/games
            defaultMarginPercent: 12,
            sortOrder: isFeatured ? 2 : 100,
          });
          g2bulkStats.imported++;
        } else {
          // Update supplier-controlled information without overwriting administrator-controlled fields:
          // PRESERVES: customImage, description, selling prices, custom sorting, isActive, badges
          const updateFields: Record<string, unknown> = {
            updatedAt: new Date(),
          };

          const apiImg = g.image_url || `https://api.g2bulk.com/images/${encodeURIComponent(rawCode)}.png`;
          if (!existing.customImage && apiImg) {
            updateFields.image = apiImg;
          }

          await Game.updateOne({ _id: existing._id }, { $set: updateFields });
          g2bulkStats.updated++;
        }
      } catch (gameErr: unknown) {
        g2bulkStats.failed++;
        g2bulkStats.errors.push(
          `Failed to sync G2Bulk game ${rawCode}: ${gameErr instanceof Error ? gameErr.message : String(gameErr)}`
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    g2bulkStats.failed++;
    g2bulkStats.errors.push(`G2Bulk games fetch error: ${msg}`);
  }

  return {
    vizo: vizoStats,
    g2bulk: g2bulkStats,
    totalImported: vizoStats.imported + g2bulkStats.imported,
    totalUpdated: vizoStats.updated + g2bulkStats.updated,
    totalSkipped: vizoStats.skipped + g2bulkStats.skipped,
    totalFailed: vizoStats.failed + g2bulkStats.failed,
  };
}

/**
 * 2. Synchronize packages from real supplier APIs
 * Preserves customer selling prices, custom package images, admin availability toggles, and badges.
 */
export async function syncPackagesFromSuppliers(options: {
  gameCode?: string;
  supplier?: "vizo" | "g2bulk";
  onlyActiveGames?: boolean;
} = {}): Promise<FullSyncResult["packages"]> {
  await connectDB();

  const vizoStats: SyncStats = {
    supplier: "vizo",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  const g2bulkStats: SyncStats = {
    supplier: "g2bulk",
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    errors: [],
  };

  const syncVizo = !options.supplier || options.supplier === "vizo";
  const syncG2Bulk = !options.supplier || options.supplier === "g2bulk";

  // ==========================================
  // 1. SYNC VIZO PACKAGES (Free Fire Global & Free Fire SGMY)
  // ==========================================
  if (syncVizo) {
    const vizoCodesToSync = options.gameCode
      ? [options.gameCode]
      : ["freefire_global", "freefire_sgmy"];

    for (const vizoCode of vizoCodesToSync) {
      if (vizoCode !== "freefire_global" && vizoCode !== "freefire_sgmy") continue;

      try {
        const vizoProducts: VizoProduct[] = await getVizoPackages(vizoCode);
        vizoStats.total += vizoProducts.length;

        // Find Free Fire game document in DB for gameSlug
        const ffGame = await Game.findOne({ supplier: "vizo", supplierGameCode: vizoCode });
        const gameSlug = ffGame?.slug || (vizoCode === "freefire_sgmy" ? "free-fire-sgmy" : "free-fire");

        for (let i = 0; i < vizoProducts.length; i++) {
          const prod = vizoProducts[i];
          const supplierProductCode = prod.product_code;

          try {
            const existing = await GamePackage.findOne({
              supplier: "vizo",
              gameSlug,
              supplierProductCode,
            });

            if (!existing) {
              // New package: do NOT invent customer selling price (remains null until admin configures it)
              await GamePackage.create({
                gameSlug,
                gameCode: vizoCode,
                supplier: "vizo",
                supplierProductCode,
                name: prod.name.includes("Diamond") ? prod.name : `${prod.name} Diamonds`,
                diamondsOrPoints: prod.name.replace(/\D/g, "") || "",
                buyingPrice: typeof prod.sell_price === "number" ? prod.sell_price : null,
                sellingPrice: null, // Admin must set customer selling price
                originalPrice: null,
                currency: "USD",
                badge: prod.product_code.includes("110") ? "POPULAR" : "",
                isActive: prod.status === "active",
                adminConfigured: false,
                sortOrder: i + 1,
                syncedAt: new Date(),
              });
              vizoStats.imported++;
            } else {
              // Update supplier buying costs privately; DO NOT overwrite admin selling price, badge or active state
              await GamePackage.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    buyingPrice: typeof prod.sell_price === "number" ? prod.sell_price : existing.buyingPrice,
                    syncedAt: new Date(),
                    name: existing.name || prod.name,
                  },
                }
              );
              vizoStats.updated++;
            }
          } catch (pkgErr: unknown) {
            vizoStats.failed++;
            vizoStats.errors.push(
              `Failed to sync Vizo package ${supplierProductCode}: ${pkgErr instanceof Error ? pkgErr.message : String(pkgErr)}`
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vizoStats.failed++;
        vizoStats.errors.push(`Vizo package sync failed for ${vizoCode}: ${msg}`);
      }
    }
  }

  // ==========================================
  // 2. SYNC G2BULK PACKAGES
  // ==========================================
  if (syncG2Bulk) {
    try {
      const query: Record<string, unknown> = { supplier: "g2bulk" };
      if (options.gameCode) {
        query.supplierGameCode = options.gameCode;
      } else if (options.onlyActiveGames) {
        query.isActive = true;
      }

      const targetGames = await Game.find(query).lean();

      for (const game of targetGames) {
        const code = game.supplierGameCode;

        // Skip Free Fire on G2Bulk
        if (code.toLowerCase().includes("freefire") || code === "ff") {
          g2bulkStats.skipped++;
          continue;
        }

        try {
          // Fetch live G2Bulk catalogue
          const catalogueItems: G2BulkCatalogueItem[] = await getG2BulkCatalogue(code);
          g2bulkStats.total += catalogueItems.length;

          for (let i = 0; i < catalogueItems.length; i++) {
            const item = catalogueItems[i];
            const supplierProductCode = String(item.id);

            try {
              const existing = await GamePackage.findOne({
                supplier: "g2bulk",
                gameSlug: game.slug,
                supplierProductCode,
              });

              if (!existing) {
                // New package: do NOT invent customer selling price (remains null until admin configures it)
                await GamePackage.create({
                  gameSlug: game.slug,
                  gameCode: code,
                  supplier: "g2bulk",
                  supplierProductCode,
                  name: item.name,
                  buyingPrice: typeof item.amount === "number" ? item.amount : null,
                  sellingPrice: null, // Admin must set customer selling price
                  originalPrice: null,
                  currency: "USD",
                  badge: "",
                  isActive: true,
                  adminConfigured: false,
                  sortOrder: i + 1,
                  syncedAt: new Date(),
                });
                g2bulkStats.imported++;
              } else {
                // Update supplier buying costs privately; DO NOT overwrite admin selling price, badge or active state
                await GamePackage.updateOne(
                  { _id: existing._id },
                  {
                    $set: {
                      buyingPrice: typeof item.amount === "number" ? item.amount : existing.buyingPrice,
                      syncedAt: new Date(),
                      name: existing.name || item.name,
                    },
                  }
                );
                g2bulkStats.updated++;
              }
            } catch (pErr: unknown) {
              g2bulkStats.failed++;
              g2bulkStats.errors.push(
                `Failed to upsert G2Bulk package ${code}/${supplierProductCode}: ${pErr instanceof Error ? pErr.message : String(pErr)}`
              );
            }
          }

          // Gentle pause between games to prevent supplier rate limits
          await new Promise((resolve) => setTimeout(resolve, 80));
        } catch (gameCatErr: unknown) {
          const msg = gameCatErr instanceof Error ? gameCatErr.message : String(gameCatErr);
          // 404 means the game has no direct packages or is voucher-only, record gracefully
          g2bulkStats.failed++;
          g2bulkStats.errors.push(`Game ${code} catalogue error: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      g2bulkStats.failed++;
      g2bulkStats.errors.push(`G2Bulk package sync failed: ${msg}`);
    }
  }

  return {
    vizo: vizoStats,
    g2bulk: g2bulkStats,
    totalImported: vizoStats.imported + g2bulkStats.imported,
    totalUpdated: vizoStats.updated + g2bulkStats.updated,
    totalSkipped: vizoStats.skipped + g2bulkStats.skipped,
    totalFailed: vizoStats.failed + g2bulkStats.failed,
  };
}
