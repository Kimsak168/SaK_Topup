import "server-only";
import { cache } from "react";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import type { ClientGame, ClientPackage } from "@/types/game";
import { cachePublicQuery, CATALOGUE_TAG, invalidateCatalogueCache } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

const getCatalogue = cache(cachePublicQuery("games", CATALOGUE_TAG, async (): Promise<ClientGame[]> =>
  withCatalogueTimeout(catalogueQuery("games", async () => {
    const games = await Game.find({ isActive: true })
      .select("slug name supplier supplierGameCode category image customImage banner publisher currencyName description requiresServer serverLabel userIdLabel instruction badge isPopular isTrending sortOrder")
      .sort({ isPopular: -1, sortOrder: 1, name: 1 }).maxTimeMS(4000).lean();
    return games.map(g => {
      const isFreeFire = g.name.toLowerCase().includes("free fire") || g.slug.includes("freefire") || g.supplierGameCode?.includes("freefire");
      const supplier = isFreeFire ? "vizo" : g.supplier;
      const code = g.supplierGameCode || (isFreeFire ? "freefire_global" : g.slug);
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
    "free-fire": "freefire_global", freefire: "freefire_global", ff: "freefire_global",
    "free-fire-sgmy": "freefire_sgmy", "freefire-sgmy": "freefire_sgmy", "ff-sgmy": "freefire_sgmy",
    "pubg-mobile": "pubgm", "mobile-legends": "mlbb",
  };
  const raw = rawCode.toLowerCase().trim();
  const code = aliases[raw] || raw;
  const targetSupplier = code.includes("freefire") ? "vizo"
    : ["pubgm", "mlbb", "mlbb_global"].includes(code) ? "g2bulk" : supplier;
  if (!["vizo", "g2bulk"].includes(targetSupplier)) return { game: null };
  if (targetSupplier !== supplier || raw !== code) {
    return { game: null, shouldRedirect: `/games/${targetSupplier}/${code}` };
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
  supplier: "vizo" | "g2bulk", code: string, slug: string
): Promise<ClientPackage[]> => withCatalogueTimeout(catalogueQuery("packages", async () => {
  const configs = await GamePackage.find({
    supplier,
    $or: [{ gameCode: code }, { gameSlug: { $in: [...new Set([code, slug])] } }],
  })
    .select("supplierProductCode name diamondsOrPoints sellingPrice originalPrice currency badge bonus isFeatured isActive customImage sortOrder updatedAt")
    .sort({ sortOrder: 1, sellingPrice: 1 }).maxTimeMS(4000).lean();

  return configs.map(cfg => {
    const hasPrice = typeof cfg.sellingPrice === "number" && Number.isFinite(cfg.sellingPrice) && cfg.sellingPrice > 0;
    const isNumeric = /^\d+$/.test(cfg.name.trim());
    const group = supplier === "vizo" || isNumeric ? "diamonds" : "special";
    const name = supplier === "vizo" && !cfg.name.includes("Diamond") ? `${cfg.name} Diamonds` : cfg.name;
    const image = cfg.customImage || null;
    return {
      id: cfg.supplierProductCode, supplierProductCode: cfg.supplierProductCode,
      name, diamondsOrPoints: cfg.diamondsOrPoints || (code === "mlbb" && isNumeric ? `${cfg.name} Diamonds` : cfg.name),
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
