import "server-only";
import { cache } from "react";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import type { ClientGame, ClientPackage } from "@/types/game";
import { cachePublicQuery, CATALOGUE_TAG, invalidateCatalogueCache } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";
import { versionImageUrl } from "@/lib/blob-shared";

// These uploads share the same black-background artwork. Match the stored
// upload revision so price edits retain the cutout and future uploads take over.
const LEGACY_LEVEL_UP_ARTWORK = new Set([
  "/api/packages/6ad6452f92d124dc45126345/image?v=d70ce864-3114-4500-ac6e-6f6482501389",
  "/api/packages/6ad6452f92d124dc45126346/image?v=2cac64c0-3fba-4423-bbfc-c559b5737979",
  "/api/packages/6ad6452f92d124dc45126347/image?v=f9bbc8e9-3d7e-4a0d-ae34-9297a5eeb48e",
  "/api/packages/6ad6452f92d124dc45126348/image?v=e14beeb5-b373-4f05-9aca-0d61abbf8132",
  "/api/packages/6ad6453092d124dc45126349/image?v=ffcd9587-3fa7-43a3-98a3-5837ece53b47",
  "/api/packages/6ad6453092d124dc4512634a/image?v=d552c80e-13a5-4685-8f0c-21479eece5db",
]);

const FREE_FIRE_MEMBERSHIP_ARTWORK = {
  weekly: "/images/packages/freefire-weekly-transparent.webp",
  monthly: "/images/packages/freefire-monthly-transparent.webp",
};

const LEGACY_MEMBERSHIP_ARTWORK: Record<string, string> = {
  "/api/packages/6ad6453092d124dc4512634c/image?v=6e8d4fb0-e796-43fb-adf6-b82934eed2fd": FREE_FIRE_MEMBERSHIP_ARTWORK.weekly,
  "/api/packages/6ad6453092d124dc4512634f/image?v=d5d87a6a-eed4-4ffc-932c-8fac92011a5b": FREE_FIRE_MEMBERSHIP_ARTWORK.monthly,
};

// Current App Store cover art for the standard game catalogue. Admin-uploaded
// customImage values still take priority over these defaults.
const CURRENT_GAME_COVER_ART: Record<string, string> = {
  "free-fire-khsgmy": "/images/freefire.webp?v=naruto",
  hok: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/10/e4/fe/10e4fe00-2610-bd44-4cab-f68e49518979/AppIcon-1x_U007emarketing-0-6-0-85-220-0.png/512x512bb.jpg",
  mlbb: "/images/mlbb/mlbb.webp?v=kh",
  "webbuilder-mlbb-global": "/images/mlbb/mlbb_global.webp?v=2026",
  "webbuilder-mlbb-id": "/images/mlbb/mlbb_id.webp?v=2026",
  "webbuilder-mlbb-ph": "/images/mlbb/mlbb_ph.webp?v=2026",
  "webbuilder-mlbb-ru": "/images/mlbb/mlbb_ru.webp?v=2026",
  "webbuilder-mlbb-tr": "/images/mlbb/mlbb_tr.webp?v=2026",
  "webbuilder-mlbb-br": "/images/mlbb/mlbb_br.webp?v=2026",
  "webbuilder-mlbb-special": "/images/mlbb/mlbb_special.webp?v=2026",
  "pubg-mobile": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4f/8d/38/4f8d3800-68b5-1c53-b0f7-7d46bda6a394/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/512x512bb.jpg",
  roblox: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/68/66/b0/6866b035-efb2-9a39-c8aa-21c60dec2a0a/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.png/512x512bb.jpg",
  "8-ball-pool": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/64/0c/3d/640c3d70-3a45-da59-3aa1-5e13eccdf116/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.png/512x512bb.jpg",
  "blood-strike": "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b8/a4/e7/b8a4e7ad-660b-a456-77de-1b2f5c4a9b6a/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg",
  "magic-chess-gogo": "/images/magic-chess.webp?v=2026",
  "webbuilder-mcgg-my": "/images/magic-chess.webp?v=2026",
  "webbuilder-mcgg-ph": "/images/magic-chess.webp?v=2026",
  "webbuilder-mcgg-ru": "/images/magic-chess.webp?v=2026",
  "webbuilder-mcgg-tr": "/images/magic-chess.webp?v=2026",
};

const getCatalogue = cache(cachePublicQuery("games", CATALOGUE_TAG, async (): Promise<ClientGame[]> =>
  withCatalogueTimeout(catalogueQuery("games", async () => {
    const games = await Game.find({ isActive: true })
      .select("slug name supplier supplierGameCode category image customImage banner publisher currencyName description requiresServer checkoutSupported serverLabel userIdLabel instruction badge isPopular isTrending sortOrder")
      .sort({ isPopular: -1, sortOrder: 1, name: 1 }).maxTimeMS(4000).lean();
    const publicGames = games.map(g => {
      const supplier = g.supplier;
      const storedCode = g.supplierGameCode || g.slug;
      const isWebBuilderFreeFire = supplier === "webbuilder" &&
        ["freefire_khsgmy", "freefire_sgmy", "freefire_global", "freefire", "free-fire", "ff"].includes(storedCode);
      const slug = isWebBuilderFreeFire ? "free-fire-khsgmy" : g.slug;
      const code = isWebBuilderFreeFire ? "freefire_khsgmy" : storedCode;
      return {
        id: String(g._id), slug, name: isWebBuilderFreeFire ? "Free Fire (KHSGMY)" : g.name, code, supplier,
        path: `/games/${supplier}/${code}`, category: g.category,
        image: g.customImage || CURRENT_GAME_COVER_ART[slug] || g.image, banner: g.banner, publisher: g.publisher,
        currencyName: g.currencyName, description: g.description,
        requiresServer: g.requiresServer, serverLabel: g.serverLabel || "Server ID",
        checkoutSupported: g.checkoutSupported !== false,
        userIdLabel: g.userIdLabel || "Player ID", instruction: g.instruction,
        badge: g.badge, isPopular: g.isPopular, isTrending: g.isTrending,
      };
    });
    // A stale regional alias must not create a second card pointing at KHSGMY.
    return [...new Map(publicGames.map(game => [`${game.supplier}:${game.code}`, game] as const)).values()];
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
  try {
    const supplier = rawSupplier.toLowerCase().trim();
    // VNGZZ2 regional codes are distinct products, not legacy aliases. Resolve
    // the exact supplier/code before applying any WebBuilder compatibility rules.
    if (supplier === "vngzz2") {
      const identifier = rawCode.trim().toLowerCase();
      const games = await getCatalogue();
      const game = games.find(g => g.supplier === supplier && (g.code.toLowerCase() === identifier || g.slug === identifier));
      return game && game.code !== rawCode ? { game: null, shouldRedirect: game.path } : { game: game || null };
    }
    // Regional WebBuilder codes take precedence over legacy base-game aliases.
    if (supplier === "webbuilder") {
      const identifier = rawCode.trim().toLowerCase();
      const game = (await getCatalogue()).find(g => g.supplier === supplier && (g.code.toLowerCase() === identifier || g.slug === identifier));
      if (game) return game.code !== rawCode ? { game: null, shouldRedirect: game.path } : { game };
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
    if (!["g2bulk", "webbuilder"].includes(targetSupplier)) return { game: null };
    if (targetSupplier !== supplier || raw !== code) {
      return { game: null, shouldRedirect: `/games/${targetSupplier}/${code}` };
    }
    // Share the same catalogue across metadata, page, and package slug resolution.
    const game = games.find(g => g.supplier === targetSupplier && (g.code.toLowerCase() === code || g.slug === code));
    if (game && (game.supplier !== supplier || game.code !== raw)) {
      return { game: null, shouldRedirect: game.path };
    }
    return { game: game || null };
  } catch (error) {
    console.error("[getGameBySupplierAndCode] Error loading game:", error);
    return { game: null };
  }
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

function extractPackageNumber(baseName: string): number {
  const match = baseName.replace(/,/g, "").match(/\d+(?:\s+\d+)*/);
  if (!match) return 0;
  return Number(match[0].replace(/\s+/g, "")) || 0;
}

function getBloodStrikePackageImage(baseName: string): string {
  if (/voucher|cornucopia/i.test(baseName)) {
    return "/images/packages/bloodstrike-voucher.webp";
  }
  if (/upgrade\s*point|upgrade.*chest/i.test(baseName)) {
    return "/images/packages/bloodstrike-upgrade-chest.webp";
  }
  if (/lucky\s*bag/i.test(baseName)) {
    return "/images/packages/bloodstrike-lucky-bag.webp";
  }
  if (/eternal\s*valor|safe/i.test(baseName)) {
    return "/images/packages/bloodstrike-safe.webp";
  }
  if (/ultra\s*skin|lucky\s*chest|chest/i.test(baseName)) {
    return "/images/packages/bloodstrike-skin-chest.webp";
  }
  if (/strike\s*pass\s*premium/i.test(baseName)) {
    return "/images/packages/bloodstrike-pass-premium.webp";
  }
  if (/strike\s*pass(\s*elite)?/i.test(baseName)) {
    return "/images/packages/bloodstrike-pass-elite.webp";
  }
  if (/level[\s-]*up|season\s*pass|pass/i.test(baseName)) {
    return "/images/packages/bloodstrike-level-up.webp";
  }
  const amount = extractPackageNumber(baseName);
  if (/deal/i.test(baseName)) {
    if (amount >= 900) return "/images/packages/bloodstrike-gold-vault.webp";
    if (amount >= 700) return "/images/packages/bloodstrike-gold-chest.webp";
    if (amount >= 500) return "/images/packages/bloodstrike-gold-case.webp";
    if (amount >= 250) return "/images/packages/bloodstrike-gold-bag.webp";
    if (amount >= 90) return "/images/packages/bloodstrike-gold-md.webp";
    return "/images/packages/bloodstrike-gold-sm.webp";
  }
  if (amount >= 5000) return "/images/packages/bloodstrike-gold-vault.webp";
  if (amount >= 2000) return "/images/packages/bloodstrike-gold-chest.webp";
  if (amount >= 1000) return "/images/packages/bloodstrike-gold-case.webp";
  if (amount >= 500) return "/images/packages/bloodstrike-gold-bag.webp";
  if (amount >= 200) return "/images/packages/bloodstrike-gold-md.webp";
  return "/images/packages/bloodstrike-gold-sm.webp";
}

function getMcggPackageImage(baseName: string): string {
  if (/bounty/i.test(baseName)) return "/images/packages/mcgg-battle-bounty.webp";
  if (/discount/i.test(baseName)) return "/images/packages/mcgg-battle-discounts.webp";
  if (/card|pass|weekly|monthly|bundle/i.test(baseName)) return "/images/packages/mcgg-weekly-pass.webp";
  const amount = extractPackageNumber(baseName);
  if (amount >= 3000) return "/images/packages/mcgg-diamond-truck.webp";
  if (amount >= 1100) return "/images/packages/mcgg-diamond-case.webp";
  if (amount >= 400) return "/images/packages/mcgg-diamond-safe.webp";
  if (amount >= 100) return "/images/packages/mcgg-diamond-pile.webp";
  return "/images/packages/mcgg-diamond-sm.webp";
}

function getEightBallPackageImage(baseName: string): string {
  if (/bundle|coda/i.test(baseName)) return "/images/packages/8ball-bundle.webp";
  if (/spin/i.test(baseName)) return "/images/packages/8ball-goldenspin.webp";
  if (/shot/i.test(baseName)) return "/images/packages/8ball-goldenshot.webp";
  const amount = extractPackageNumber(baseName);
  if (/scratch/i.test(baseName)) {
    return amount >= 10 ? "/images/packages/8ball-scratcher-2.webp" : "/images/packages/8ball-scratcher-1.webp";
  }
  if (/cash/i.test(baseName)) {
    return amount >= 100 ? "/images/packages/8ball-cash-2.webp" : "/images/packages/8ball-cash-1.webp";
  }
  if (amount >= 200000) return "/images/packages/8ball-coins-3.webp";
  if (amount >= 50000) return "/images/packages/8ball-coins-2.webp";
  return "/images/packages/8ball-coins-1.webp";
}

function getDefaultGamePackageImage(
  code: string,
  slug: string,
  baseName: string,
  isDiamondPackage: boolean
): string | null {
  const key = `${code} ${slug}`.toLowerCase();
  if (key.includes("mlbb") || key.includes("mobile-legends")) {
    return isDiamondPackage ? "/images/mlbb-diamond.webp" : null;
  }
  if (key.includes("freefire") || key.includes("ff-") || key.includes("free-fire")) {
    return isDiamondPackage ? "/images/diamond-crystals.webp" : null;
  }
  if (key.includes("roblox")) return /gift|\$/i.test(baseName) ? "/images/roblox.webp" : "/images/robux-coin.webp";
  if (key.includes("magic_chess") || key.includes("mcgg")) return getMcggPackageImage(baseName);
  if (key.includes("telegram")) {
    return /premium/i.test(baseName) ? "/images/packages/telegram-premium.webp" : "/images/packages/telegram-star.svg";
  }
  if (key.includes("bloodstrike") || key.includes("blood-strike")) return getBloodStrikePackageImage(baseName);
  if (key.includes("8ball") || key.includes("8-ball")) return getEightBallPackageImage(baseName);
  if (key.includes("zepeto")) {
    if (/premium/i.test(baseName)) return "/images/packages/zepeto-premium.webp";
    const amount = extractPackageNumber(baseName);
    if (/coins?/i.test(baseName)) {
      if (amount >= 100000) return "/images/packages/zepeto-coins-3.webp";
      if (amount >= 20000) return "/images/packages/zepeto-coins-2.webp";
      return "/images/packages/zepeto-coins-1.webp";
    }
    if (amount >= 500) return "/images/packages/zepeto-zems-3.webp";
    if (amount >= 50) return "/images/packages/zepeto-zems-2.webp";
    return "/images/packages/zepeto-zems-1.webp";
  }
  return null;
}

// Supplier sync is an explicit admin action. Failed reads throw and are never
// cached as a successful empty catalogue. Only customer fields leave the server.
const getSavedPackages = cachePublicQuery("packages", CATALOGUE_TAG, async (
  supplier: "webbuilder" | "g2bulk" | "vngzz2", code: string, slug: string
): Promise<ClientPackage[]> => withCatalogueTimeout(catalogueQuery("packages", async () => {
  const isCanonicalFreeFire = supplier === "webbuilder" && code === "freefire_khsgmy";
  const packageFilter = isCanonicalFreeFire
    ? {
        supplier,
        $or: [
          { gameCode: code },
          { gameCode: { $exists: false }, gameSlug: { $in: [...new Set([code, slug])] } },
        ],
      }
    : {
        supplier,
        $or: [{ gameCode: code }, { gameSlug: { $in: [...new Set([code, slug])] } }],
      };
  const configs = await GamePackage.find(packageFilter)
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
    const defaultGameImage = getDefaultGamePackageImage(code, slug, baseName, isDiamondPackage);
    const customImage = cfg.customImage && LEGACY_LEVEL_UP_ARTWORK.has(cfg.customImage)
      ? "/images/packages/freefire-level-up-transparent.webp"
      : (cfg.customImage && LEGACY_MEMBERSHIP_ARTWORK[cfg.customImage]) || cfg.customImage;
    const membershipType = /^(weekly|monthly)(?:\s+membership)?(?:\s*[×x]\s*\d+)?$/i.exec(baseName.trim())?.[1].toLowerCase();
    const membershipPrefix = /^(weekly|monthly)(?=$|[\s×x]|lite|elite|card|pass)/i.exec(baseName.trim())?.[1].toLowerCase();
    const selectedMembershipType = membershipType || membershipPrefix;
    const membershipImage = isFreeFire && selectedMembershipType === "weekly"
      ? FREE_FIRE_MEMBERSHIP_ARTWORK.weekly
      : isFreeFire && selectedMembershipType === "monthly"
        ? FREE_FIRE_MEMBERSHIP_ARTWORK.monthly
        : null;
    const levelUpImage = isFreeFire && /level\s*up/i.test(baseName)
      ? "/images/packages/freefire-level-up-transparent.webp"
      : null;
    const image = customImage || levelUpImage || membershipImage || defaultGameImage;
    return {
      id: cfg.supplierProductCode, supplierProductCode: cfg.supplierProductCode,
      name, diamondsOrPoints,
      sellingPrice: hasPrice ? cfg.sellingPrice : null,
      originalPrice: typeof cfg.originalPrice === "number" && cfg.originalPrice > 0 ? cfg.originalPrice : null,
      currency: cfg.currency || "USD", badge: cfg.badge || undefined, bonus: cfg.bonus || undefined,
      isFeatured: Boolean(cfg.isFeatured), isAvailable: hasPrice && cfg.isActive !== false && cfg.supplierAvailable !== false,
      category: group, group,
      customImage: image ? versionImageUrl(image, cfg.updatedAt) : image,
    };
  });
})));

export const getNormalizedPackages = cache(async (supplier: string, code: string): Promise<ClientPackage[]> => {
  try {
    const result = await getGameBySupplierAndCode(supplier, code);
    if (result.shouldRedirect) {
      const [, , nextSupplier, nextCode] = result.shouldRedirect.split("/");
      return getNormalizedPackages(nextSupplier, nextCode);
    }
    if (!result.game) return [];
    const game = result.game;
    const packages = await getSavedPackages(game.supplier, game.code, game.slug);
    return game.checkoutSupported === false ? packages.map(pkg => ({ ...pkg, isAvailable: false })) : packages;
  } catch (error) {
    console.error("[getNormalizedPackages] Error loading packages:", error);
    return [];
  }
});
