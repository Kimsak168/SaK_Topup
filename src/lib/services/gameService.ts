import "server-only";
import { cache } from "react";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import type { ClientGame, ClientPackage } from "@/types/game";
import { cachePublicQuery, CATALOGUE_TAG, invalidateCatalogueCache } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

// Current App Store cover art for the standard game catalogue. Admin-uploaded
// customImage values still take priority over these defaults.
const CURRENT_GAME_COVER_ART: Record<string, string> = {
  "free-fire-khsgmy": "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9d/58/5d/9d585d57-5f64-b153-6603-9ac569287017/AppIcon-1761076778-1x_U007emarketing-0-8-0-85-220-0.png/512x512bb.jpg",
  hok: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/10/e4/fe/10e4fe00-2610-bd44-4cab-f68e49518979/AppIcon-1x_U007emarketing-0-6-0-85-220-0.png/512x512bb.jpg",
  mlbb: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/81/36/47/81364792-25ad-a8fb-80ab-bbfa6523c6de/AppIcon-1x_U007emarketing-0-7-0-85-220-0.png/512x512bb.jpg",
  "pubg-mobile": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4f/8d/38/4f8d3800-68b5-1c53-b0f7-7d46bda6a394/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/512x512bb.jpg",
  roblox: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/68/66/b0/6866b035-efb2-9a39-c8aa-21c60dec2a0a/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.png/512x512bb.jpg",
  "8-ball-pool": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/64/0c/3d/640c3d70-3a45-da59-3aa1-5e13eccdf116/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.png/512x512bb.jpg",
  "blood-strike": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b8/a4/e7/b8a4e7ad-660b-a456-77de-1b2f5c4a9b6a/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg",
  "magic-chess-gogo": "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/46/5b/ca/465bca79-fa16-8ad4-73fe-f8ee63e33c9d/Placeholder.mill/512x512bb.jpg",
};

const getCatalogue = cache(cachePublicQuery("games", CATALOGUE_TAG, async (): Promise<ClientGame[]> =>
  withCatalogueTimeout(catalogueQuery("games", async () => {
    const games = await Game.find({ isActive: true })
      .select("slug name supplier supplierGameCode category image customImage banner publisher currencyName description requiresServer checkoutSupported serverLabel userIdLabel instruction badge isPopular isTrending sortOrder")
      .sort({ isPopular: -1, sortOrder: 1, name: 1 }).maxTimeMS(4000).lean();
    return games.map(g => {
      const supplier = g.supplier;
      const code = g.supplierGameCode || g.slug;
      return {
        id: String(g._id), slug: g.slug, name: g.name, code, supplier,
        path: `/games/${supplier}/${code}`, category: g.category,
        image: g.customImage || CURRENT_GAME_COVER_ART[g.slug] || g.image, banner: g.banner, publisher: g.publisher,
        currencyName: g.currencyName, description: g.description,
        requiresServer: g.requiresServer, serverLabel: g.serverLabel || "Server ID",
        checkoutSupported: g.checkoutSupported !== false,
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
  // VNGZZ2 regional codes are distinct products, not legacy aliases. Resolve
  // the exact supplier/code before applying any WebBuilder compatibility rules.
  if (supplier === "vngzz2") {
    const identifier = rawCode.trim().toLowerCase();
    const games = await getCatalogue();
    const game = games.find(g => g.supplier === supplier && (g.code.toLowerCase() === identifier || g.slug === identifier));
    return game && game.code !== rawCode ? { game: null, shouldRedirect: game.path } : { game: game || null };
  }
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
    roblox: "roblox", robux: "roblox",
  };
  const raw = rawCode.toLowerCase().trim();
  const code = aliases[raw] || raw;
  const games = await getCatalogue();
  const matched = games.find(g => g.supplier === supplier && (g.code.toLowerCase() === code || g.slug === code))
    || games.find(g => g.supplier !== "vngzz2" && (g.code.toLowerCase() === code || g.slug === code));
  const targetSupplier = matched?.supplier || (
    (code.includes("freefire") || code === "free-fire" || code === "ff" || code.includes("khsgmy") || code.includes("sgmy")) ? "webbuilder"
    : ["mlbb", "mobile-legends", "mlbb_global"].includes(code) ? "webbuilder"
    : ["pubgm", "pubg-mobile"].includes(code) ? (matched?.supplier || "g2bulk")
    : ["hok", "honor-of-kings", "honor_of_kings"].includes(code) ? "webbuilder"
    : (code === "roblox" || code === "robux") ? "g2bulk"
    : supplier
  );
  if (!["vizo", "g2bulk", "webbuilder"].includes(targetSupplier)) return { game: null };
  if (targetSupplier !== supplier || raw !== code) {
    return { game: null, shouldRedirect: `/games/${targetSupplier}/${code}` };
  }
  // Share the same catalogue across metadata, page, and package slug resolution.
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
  supplier: "webbuilder" | "vizo" | "g2bulk" | "vngzz2", code: string, slug: string
): Promise<ClientPackage[]> => withCatalogueTimeout(catalogueQuery("packages", async () => {
  const configs = await GamePackage.find({
    supplier,
    $or: [{ gameCode: code }, { gameSlug: { $in: [...new Set([code, slug])] } }],
  })
    .select("supplierProductCode name diamondsOrPoints sellingPrice originalPrice currency badge bonus isFeatured isActive supplierAvailable customImage sortOrder updatedAt")
    .sort({ sortOrder: 1, sellingPrice: 1 }).maxTimeMS(4000).lean();

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
    const isRoblox = code === "roblox" || slug === "roblox" || code.includes("roblox") || slug.includes("roblox");
    const isDiamondGame = isFreeFire || isMlbb || code === "mlbb" || slug === "mlbb";
    const isSpecial = /\b(pass|pack|package|weekly|monthly|twilight|starlight|member|subscription|bundle|membership|vip|level\s*up|card|gift\s*card)\b/i.test(baseName);
    const isDiamondPackage = !isSpecial && (/\bdiamonds?\b/i.test(baseName) || /\bdiamonds?\b/i.test(baseDiamonds) || isNumeric || /\brobux\b/i.test(baseName));
    const group = isDiamondPackage ? "diamonds" : "special";
    const name = isDiamondGame && !baseName.includes("Diamond") && isNumeric
      ? `${baseName} Diamonds`
      : baseName;
    const diamondsOrPoints = isDiamondsNumeric && isDiamondGame
      ? `${baseDiamonds} Diamonds`
      : baseDiamonds || (isDiamondGame && isNameNumeric ? `${baseName} Diamonds` : baseName);
    const defaultDiamondImage = isMlbb
      ? "/images/mlbb-diamond.png"
      : isFreeFire
      ? "/images/diamond-crystals.png"
      : isRoblox
      ? "/images/robux-coin.jpg"
      : null;
    const image = cfg.customImage || (isDiamondPackage || isRoblox ? defaultDiamondImage : null);
    return {
      id: cfg.supplierProductCode, supplierProductCode: cfg.supplierProductCode,
      name, diamondsOrPoints,
      sellingPrice: hasPrice ? cfg.sellingPrice : null,
      originalPrice: typeof cfg.originalPrice === "number" && cfg.originalPrice > 0 ? cfg.originalPrice : null,
      currency: cfg.currency || "USD", badge: cfg.badge || undefined, bonus: cfg.bonus || undefined,
      isFeatured: Boolean(cfg.isFeatured), isAvailable: hasPrice && cfg.isActive !== false && cfg.supplierAvailable !== false,
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
  const packages = await getSavedPackages(game.supplier, game.code, game.slug);
  return game.checkoutSupported === false ? packages.map(pkg => ({ ...pkg, isAvailable: false })) : packages;
});
