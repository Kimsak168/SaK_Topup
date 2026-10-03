import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { ClientGame, ClientPackage } from "@/types/game";
import { getVizoPackages } from "@/lib/suppliers/vizo";
import { getG2BulkCatalogue } from "@/lib/suppliers/g2bulk";

/**
 * Fetch all active games for customer homepage and game list
 * Loads ONLY administrator-enabled games from MongoDB
 */
export async function getClientGames(
  category?: string,
  query?: string,
  options?: { timeoutMs?: number; throwOnError?: boolean }
): Promise<ClientGame[]> {
  const timeoutMs = options?.timeoutMs ?? 4500;
  const throwOnError = options?.throwOnError ?? false;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database request timed out")), timeoutMs)
    );

    const queryPromise = (async () => {
      await connectDB();

      const filter: Record<string, unknown> = { isActive: true };
      if (category && category !== "all") {
        filter.category = { $regex: new RegExp(`^${category}$`, "i") };
      }
      if (query && query.trim()) {
        filter.$or = [
          { name: { $regex: query.trim(), $options: "i" } },
          { publisher: { $regex: query.trim(), $options: "i" } },
          { category: { $regex: query.trim(), $options: "i" } },
          { supplierGameCode: { $regex: query.trim(), $options: "i" } },
        ];
      }

      const games = await Game.find(filter).sort({ isPopular: -1, sortOrder: 1, name: 1 }).lean();

      return games.map((g) => {
        // Free Fire must use Vizo exclusively
        const isFreeFire =
          g.name.toLowerCase().includes("free fire") ||
          g.slug.includes("freefire") ||
          (g.supplierGameCode && g.supplierGameCode.includes("freefire"));

        const supplier = isFreeFire ? "vizo" : (g.supplier as "vizo" | "g2bulk");
        const code = isFreeFire ? (g.supplierGameCode || "freefire_global") : (g.supplierGameCode || g.slug);

        return {
          id: String(g._id),
          slug: g.slug,
          name: g.name,
          code,
          supplier,
          path: `/games/${supplier}/${code}`,
          category: g.category,
          image: g.customImage || g.image,
          banner: g.banner,
          publisher: g.publisher,
          currencyName: g.currencyName,
          description: g.description,
          requiresServer: g.requiresServer,
          serverLabel: g.serverLabel || "Server ID",
          userIdLabel: g.userIdLabel || "Player ID",
          instruction: g.instruction,
          badge: g.badge,
          isPopular: g.isPopular,
          isTrending: g.isTrending,
        };
      });
    })();

    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (err) {
    console.error("[GameService] getClientGames error:", err instanceof Error ? err.message : String(err));
    if (throwOnError) {
      throw err;
    }
    return [];
  }
}

/**
 * Lookup game by supplier and game code with loop-free redirection handling
 * Loads strictly from MongoDB Atlas
 */
export async function getGameBySupplierAndCode(
  rawSupplier: string,
  rawCode: string
): Promise<{ game: ClientGame | null; shouldRedirect?: string }> {
  await connectDB();

  const supplier = rawSupplier.toLowerCase().trim();
  let code = rawCode.trim().toLowerCase();

  // Normalize Free Fire aliases
  if (code === "free-fire" || code === "freefire") {
    code = "freefire_global";
  } else if (code === "free-fire-sgmy" || code === "freefire-sgmy" || code === "ff-sgmy") {
    code = "freefire_sgmy";
  }

  // Handle invalid supplier and game combinations without redirect loops:
  // If Free Fire was requested with g2bulk, redirect cleanly to vizo
  if (supplier === "g2bulk" && (code.includes("freefire") || code === "ff")) {
    const targetCode = code.includes("sgmy") ? "freefire_sgmy" : "freefire_global";
    return {
      game: null,
      shouldRedirect: `/games/vizo/${targetCode}`,
    };
  }

  // If G2Bulk games requested on vizo, redirect to g2bulk
  if (supplier === "vizo" && (code === "pubgm" || code === "pubg-mobile")) {
    return {
      game: null,
      shouldRedirect: `/games/g2bulk/pubgm`,
    };
  }
  if (supplier === "vizo" && (code === "mlbb" || code === "mobile-legends")) {
    return {
      game: null,
      shouldRedirect: `/games/g2bulk/mlbb`,
    };
  }
  if (supplier === "vizo" && code === "mlbb_global") {
    return {
      game: null,
      shouldRedirect: `/games/g2bulk/mlbb_global`,
    };
  }
  if (supplier === "g2bulk" && code === "mobile-legends") {
    return {
      game: null,
      shouldRedirect: `/games/g2bulk/mlbb`,
    };
  }

  const isFreeFire = code.includes("freefire");
  const targetSupplier = isFreeFire ? "vizo" : (supplier as "vizo" | "g2bulk");

  const game = await Game.findOne({
    $or: [
      { supplier: targetSupplier, supplierGameCode: code, isActive: true },
      { supplier: targetSupplier, slug: code, isActive: true },
      { supplierGameCode: code, isActive: true },
      { slug: code, isActive: true },
    ],
  }).lean();

  if (!game) {
    return { game: null };
  }

  const assignedCode = isFreeFire ? (game.supplierGameCode || code) : (game.supplierGameCode || game.slug);
  const finalSupplier = isFreeFire ? "vizo" : game.supplier;

  return {
    game: {
      id: String(game._id),
      slug: game.slug,
      code: assignedCode,
      supplier: finalSupplier,
      path: `/games/${finalSupplier}/${assignedCode}`,
      name: game.name,
      category: game.category,
      image: game.customImage || game.image,
      banner: game.banner,
      publisher: game.publisher,
      currencyName: game.currencyName,
      description: game.description,
      requiresServer: game.requiresServer,
      serverLabel: game.serverLabel || "Server ID",
      userIdLabel: game.userIdLabel || "Player ID",
      instruction: game.instruction,
      badge: game.badge,
      isPopular: game.isPopular,
      isTrending: game.isTrending,
    },
  };
}

/**
 * Admin function to update selling price for a package
 */
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
  if (badge !== undefined) {
    updateData.badge = badge;
  }
  if (isActive !== undefined) {
    updateData.isActive = isActive;
  }
  const result = await GamePackage.findByIdAndUpdate(packageId, updateData);
  return !!result;
}

/**
 * Fetch and normalize packages directly server-side with MongoDB prices applied
 */
export async function getNormalizedPackages(
  supplier: string,
  code: string
): Promise<ClientPackage[]> {
  try {
    await connectDB();
    const normalizedSupplier = supplier.toLowerCase().trim() === "g2bulk" ? "g2bulk" : "vizo";
    const rawCode = code.trim();

    const priceMap = new Map<
      string,
      {
        sellingPrice: number | null;
        isActive: boolean;
        originalPrice: number | null;
        badge?: string;
        customImage?: string | null;
      }
    >();

    try {
      const existingConfigs = await GamePackage.find({
        supplier: normalizedSupplier,
        $or: [{ gameCode: rawCode }, { gameSlug: rawCode }],
      }).lean();

      for (const cfg of existingConfigs) {
        const hasConfiguredPrice =
          typeof cfg.sellingPrice === "number" && cfg.sellingPrice > 0;

        priceMap.set(cfg.supplierProductCode, {
          sellingPrice: hasConfiguredPrice ? cfg.sellingPrice : null,
          isActive: cfg.isActive !== false,
          originalPrice:
            typeof cfg.originalPrice === "number" && cfg.originalPrice > 0
              ? cfg.originalPrice
              : null,
          badge: cfg.badge || undefined,
          customImage: cfg.customImage || null,
        });
      }
    } catch (dbErr) {
      console.warn("MongoDB connection fallback loading packages:", dbErr);
    }

    if (normalizedSupplier === "vizo") {
      const vizoProducts = await getVizoPackages(rawCode);
      return vizoProducts.map((prod) => {
        const configured = priceMap.get(prod.product_code);
        const sellingPrice = configured?.sellingPrice ?? null;
        const isAvailable = sellingPrice !== null && (configured?.isActive ?? true);

        return {
          id: prod.product_code,
          supplierProductCode: prod.product_code,
          name: prod.name.includes("Diamond") ? prod.name : `${prod.name} Diamonds`,
          diamondsOrPoints: prod.name,
          sellingPrice,
          originalPrice: configured?.originalPrice ?? null,
          currency: "USD",
          badge: configured?.badge,
          isFeatured: false,
          isAvailable,
          category: "diamonds",
          group: "diamonds",
          customImage: configured?.customImage || null,
        };
      });
    } else {
      const g2Items = await getG2BulkCatalogue(rawCode);
      return g2Items.map((item) => {
        const codeId = String(item.id);
        const configured = priceMap.get(codeId);
        const sellingPrice = configured?.sellingPrice ?? null;
        const isAvailable = sellingPrice !== null && (configured?.isActive ?? true);

        const isNumeric = /^\d+$/.test(item.name.trim());
        const isSpecial = !isNumeric || /pass|pack|weekly|monthly|twilight|starlight|member/i.test(item.name);
        const group = isSpecial ? "special" : "diamonds";

        let diamondsOrPoints = item.name;
        if (rawCode === "mlbb") {
          diamondsOrPoints = isNumeric ? `${item.name} Diamonds` : item.name;
        }

        return {
          id: codeId,
          supplierProductCode: codeId,
          name: item.name,
          diamondsOrPoints,
          sellingPrice,
          originalPrice: configured?.originalPrice ?? null,
          currency: "USD",
          badge: configured?.badge,
          isFeatured: false,
          isAvailable,
          category: group,
          group,
          customImage: configured?.customImage || null,
        };
      });
    }
  } catch (err) {
    console.error("Error in getNormalizedPackages:", err);
    return [];
  }
}
