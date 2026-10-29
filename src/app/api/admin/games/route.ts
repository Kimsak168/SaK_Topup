import { invalidateCatalogueCache } from "@/lib/services/cacheService";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { requireAdminAuth } from "@/lib/auth";
import { getAdminPagination, escapeSearchRegex } from "@/lib/adminQuery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const search = escapeSearchRegex(searchParams.get("search")?.trim() || "");
    const supplier = searchParams.get("supplier")?.trim().toLowerCase() || "all";
    const status = searchParams.get("status")?.trim().toLowerCase() || "all";
    const { page, limit } = getAdminPagination(searchParams);

    const filter: Record<string, unknown> = {};

    if (supplier !== "all") {
      filter.supplier = supplier;
    }

    if (status === "active") {
      filter.isActive = true;
    } else if (status === "disabled") {
      filter.isActive = false;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { supplierGameCode: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Game.countDocuments(filter);
    const games = await Game.find(filter)
      .sort({ isActive: -1, sortOrder: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Global KPI stats
    const [totalAll, activeCount, webbuilderCount] = await Promise.all([
      Game.countDocuments().catch(() => 0),
      Game.countDocuments({ isActive: true }).catch(() => 0),
      Game.countDocuments({ supplier: "webbuilder" }).catch(() => 0),
    ]);

    return NextResponse.json({
      success: true,
      games: games.map((g) => ({
        id: String(g._id),
        slug: g.slug,
        name: g.name,
        supplier: g.supplier,
        supplierGameCode: g.supplierGameCode,
        category: g.category,
        image: g.customImage || g.image,
        rawImage: g.image,
        customImage: g.customImage || null,
        description: g.description,
        isActive: g.isActive,
        isPopular: g.isPopular,
        isTrending: g.isTrending,
        badge: g.badge || "",
        sortOrder: g.sortOrder || 0,
        requiresServer: g.requiresServer,
        updatedAt: g.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      kpi: {
        totalAll,
        activeCount,
        disabledCount: totalAll - activeCount,
        webbuilderCount,
      },
    });
  } catch (error: unknown) {
    console.error("Admin GET games error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load games" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json();
    const { gameId, isActive, customImage, description, badge, sortOrder, category, name } = body;

    if (!gameId) {
      return NextResponse.json({ success: false, error: "Missing gameId" }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof isActive === "boolean") {
      updateFields.isActive = isActive;
      if (isActive) {
        const gameDoc = await Game.findById(gameId).lean();
        if (gameDoc) {
          const activePkgCount = await GamePackage.countDocuments({
            $or: [{ gameSlug: gameDoc.slug }, { gameCode: gameDoc.supplierGameCode }],
            isActive: true,
          });
          if (activePkgCount === 0) {
            await GamePackage.updateMany(
              {
                $or: [{ gameSlug: gameDoc.slug }, { gameCode: gameDoc.supplierGameCode }],
                sellingPrice: { $gt: 0 },
              },
              { $set: { isActive: true, updatedAt: new Date() } }
            );
          }
        }
      }
    }
    if (typeof customImage === "string") updateFields.customImage = customImage.trim();
    if (typeof description === "string") updateFields.description = description.trim();
    if (typeof badge === "string") updateFields.badge = badge.trim();
    if (typeof sortOrder === "number") updateFields.sortOrder = sortOrder;
    if (typeof category === "string") updateFields.category = category.trim();
    if (typeof name === "string") updateFields.name = name.trim();

    const updated = await Game.findByIdAndUpdate(gameId, updateFields, { new: true }).lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Game not found" }, { status: 404 });
    }

    invalidateCatalogueCache();
    return NextResponse.json({
      success: true,
      message: "Game updated successfully",
      game: {
        id: String(updated._id),
        name: updated.name,
        isActive: updated.isActive,
        customImage: updated.customImage,
        description: updated.description,
        badge: updated.badge,
        sortOrder: updated.sortOrder,
      },
    });
  } catch (error: unknown) {
    console.error("Admin PATCH games error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update game" },
      { status: 500 }
    );
  }
}
