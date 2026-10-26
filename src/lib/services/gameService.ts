import "server-only";
import { cache } from "react";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import type { ClientGame, ClientPackage } from "@/types/game";
import { cachePublicQuery, CATALOGUE_TAG, invalidateCatalogueCache } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";
import { legacyImageBytes, setCachedLegacyImage } from "./legacyImageService";

const getCatalogue = cache(cachePublicQuery("games", CATALOGUE_TAG, async (): Promise<ClientGame[]> =>
  withCatalogueTimeout(catalogueQuery("games", async () => {
    const games = await Game.find({ isActive: true })
      .select("slug name supplier supplierGameCode category image customImage banner publisher currencyName description requiresServer serverLabel userIdLabel instruction badge isPopular isTrending sortOrder")
      .sort({ isPopular: -1, sortOrder: 1, name: 1 }).maxTimeMS(4000).lean();
    return games.map(g => {
      const supplier = g.supplier;
      const code = g.supplierGameCode || g.slug;
      return {
        id: String(g._id), slug: g.slug, name: g.name, code, supplier,
        path: `/games/${supplier}/${code}`, category: g.category,
        image: g.customImage || g.image, banner: g.banner, publisher: g.publisher,
        currencyName: g.currencyName, description: g.description,
        requiresServer: g.requiresServer, serverLabel: g.serverLabel || "Server ID",
        userIdLabel: g.userIdLabel || "Player ID", instruction: g.instruction,
        badge: g.badge, isPopular: g.isPopular, isTrending: g.isTrending,
      };
    });
  }))
));

export async function getClientGames(
  category?: string,
  query?: string,
  options?: { timeoutMs?: number; throwOnError?: boolean }
): Promise<ClientGame[]> {
  try {
    const games = await withCatalogueTimeout(getCatalogue(), options?.timeoutMs);
    const categoryFilter = category?.trim().toLowerCase();
    const search = query?.trim().toLowerCase();
    // Reuse the small active catalogue instead of caching arbitrary search keys
    // or running unindexed regular expressions for each search term.
    return games.filter(g =>
      (!categoryFilter || categoryFilter === "all" || g.category.toLowerCase() === categoryFilter) &&
      (!search || [g.name, g.publisher, g.category, g.code].some(value => value.toLowerCase().includes(search)))
    );
  } catch (error) {
    if (options?.throwOnError) throw error;
    console.error("[Catalogue] Games temporarily unavailable");
    return [];
  }
}

export const getGameBySupplierAndCode = cache(async (
  rawSupplier: string,
  rawCode: string
): Promise<{ game: ClientGame | null; shouldRedirect?: string }> => {
  const supplier = rawSupplier.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "free-fire": "freefire_khsgmy", freefire: "freefire_khsgmy", ff: "freefire_khsgmy",
    "free-fire-sgmy": "freefire_khsgmy", "freefire-sgmy": "freefire_khsgmy", "ff-sgmy": "freefire_khsgmy",
    "freefire_sgmy": "freefire_khsgmy",
    "freefire_global": "freefire_khsgmy", "free-fire-global": "freefire_khsgmy",
    "freefire_khsgmy": "freefire_khsgmy", "free-fire-khsgmy": "freefire_khsgmy", "ff-khsgmy": "freefire_khsgmy",
    khsgmy: "freefire_khsgmy",
    "pubg-mobile": "pubgm", pubg: "pubgm", "pubg_mobile": "pubgm",
    "mobile-legends": "mlbb", mlbb_global: "mlbb",
    "honor-of-kings": "hok", honor_of_kings: "hok",
    "blood-strike": "bloodstrike",
    "magic-chess-gogo": "magic_chess", "magic-chess": "magic_chess",
    "8-ball-pool": "8ballpool", "8ball": "8ballpool",
    telegram: "telegram", "telegram-stars": "telegram", "telegram_stars": "telegram", tg: "telegram",
  };
  const raw = rawCode.toLowerCase().trim();
  const code = aliases[raw] || raw;
  const targetSupplier = "webbuilder";
  if (supplier !== "webbuilder" || raw !== code) {
    return { game: null, shouldRedirect: `/games/webbuilder/${code}` };
  }
  // Share the same catalogue across metadata, page, and package slug resolution.
  const games = await getCatalogue();
  const game = games.find(g => g.supplier === targetSupplier && (g.code.toLowerCase() === code || g.slug === code));
  if (game && (game.supplier !== supplier || game.code !== raw)) {
    return { game: null, shouldRedirect: game.path };
  }
  return { game: game || null };
});

export async function updatePackageSellingPrice(
  packageId: string,
  newSellingPrice: number,
  badge?: string,
  isActive?: boolean
): Promise<boolean> {
  await connectDB();
  const updateData: Record<string, unknown> = {
    sellingPrice: newSellingPrice,
    originalPrice: Math.round(newSellingPrice * 1.15 * 100) / 100,
    adminConfigured: true,
  };
  if (badge !== undefined) updateData.badge = badge;
  if (isActive !== undefined) updateData.isActive = isActive;
  const result = await GamePackage.findByIdAndUpdate(packageId, updateData);
  if (result) invalidateCatalogueCache();
  return !!result;
}

// Supplier sync is an explicit admin action. Failed reads throw and are never
// cached as a successful empty catalogue. Only customer fields leave the server.
const getSavedPackages = cachePublicQuery("packages", CATALOGUE_TAG, async (
  supplier: "webbuilder", code: string, slug: string
): Promise<ClientPackage[]> => withCatalogueTimeout(catalogueQuery("packages", async () => {
  const configs = await GamePackage.find({
    supplier,
    $or: [{ gameCode: code }, { gameSlug: { $in: [...new Set([code, slug])] } }],
  })
    .select("supplierProductCode name diamondsOrPoints sellingPrice originalPrice currency badge bonus isFeatured isActive customImage sortOrder updatedAt imageData imageContentType")
    .sort({ sortOrder: 1, sellingPrice: 1 }).maxTimeMS(4000).lean();

  for (const cfg of configs) {
    if (cfg.imageData && cfg.imageContentType) {
      const bytes = legacyImageBytes(cfg.imageData);
      if (bytes) {
        setCachedLegacyImage(`package:${String(cfg._id)}`, {
          bytes,
          contentType: cfg.imageContentType,
          updatedAt: cfg.updatedAt,
        });
      }
    }
  }

  return configs.map(cfg => {
    const hasPrice = typeof cfg.sellingPrice === "number" && Number.isFinite(cfg.sellingPrice) && cfg.sellingPrice > 0;
    const isNameNumeric = /^\d+$/.test(cfg.name.trim());
    const rawDiamonds = (cfg.diamondsOrPoints || "").trim();
    const isDiamondsNumeric = /^\d+$/.test(rawDiamonds);
    const isNumeric = isNameNumeric || isDiamondsNumeric;
    const isFreeFire = code.includes("freefire") || code.includes("ff") || slug.includes("free-fire");
    const formatLevelUp = (str: string) =>
      isFreeFire ? str.replace(/Level\s*Up\s*(?:Package|Pass)?\s*[-–—:]*\s*(?:Level|Lv\.?)?\s*(\d+)/i, "Level Up $1") : str;
    const baseName = formatLevelUp(cfg.name);
    const baseDiamonds = formatLevelUp(rawDiamonds);
    const isMlbb = code.includes("mlbb") || code.includes("mobile-legends") || slug.includes("mlbb") || slug.includes("mobile-legends");
    const isDiamondGame = isFreeFire || isMlbb || code === "mlbb" || slug === "mlbb";
    const isSpecial = /\b(pass|pack|package|weekly|monthly|twilight|starlight|member|subscription|bundle|membership|vip|level\s*up)\b/i.test(baseName);
    const isDiamondPackage = !isSpecial && (/\bdiamonds?\b/i.test(baseName) || /\bdiamonds?\b/i.test(baseDiamonds) || isNumeric);
    const group = isDiamondPackage ? "diamonds" : "special";
    const name = isDiamondGame && !baseName.includes("Diamond") && isNumeric
      ? `${baseName} Diamonds`
      : baseName;
    const diamondsOrPoints = isDiamondsNumeric && isDiamondGame
      ? `${baseDiamonds} Diamonds`
      : baseDiamonds || (isDiamondGame && isNameNumeric ? `${baseName} Diamonds` : baseName);
    const defaultDiamondImage = isMlbb ? "/images/mlbb-diamond.png" : (isFreeFire ? "/images/diamond-crystals.png" : null);
    const image = cfg.customImage || (isDiamondPackage ? defaultDiamondImage : null);
    return {
      id: cfg.supplierProductCode, supplierProductCode: cfg.supplierProductCode,
      name, diamondsOrPoints,
      sellingPrice: hasPrice ? cfg.sellingPrice : null,
      originalPrice: typeof cfg.originalPrice === "number" && cfg.originalPrice > 0 ? cfg.originalPrice : null,
      currency: cfg.currency || "USD", badge: cfg.badge || undefined, bonus: cfg.bonus || undefined,
      isFeatured: Boolean(cfg.isFeatured), isAvailable: hasPrice && cfg.isActive !== false,
      category: group, group,
      // Mutable legacy DB image URLs need a new optimizer cache key after edits.
      customImage: image?.startsWith("/api/packages/") ? `${image.split("?")[0]}?v=${new Date(cfg.updatedAt).getTime()}` : image,
    };
  });
})));

export const getNormalizedPackages = cache(async (supplier: string, code: string): Promise<ClientPackage[]> => {
  const result = await getGameBySupplierAndCode(supplier, code);
  if (result.shouldRedirect) {
    const [, , nextSupplier, nextCode] = result.shouldRedirect.split("/");
    return getNormalizedPackages(nextSupplier, nextCode);
  }
  if (!result.game) return [];
  const game = result.game;
  return getSavedPackages(game.supplier, game.code, game.slug);
});
