import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";
import { Game } from "@/models/Game";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const game = searchParams.get("game")?.trim() || "";
    const supplier = searchParams.get("supplier")?.trim().toLowerCase() || "all";
    const status = searchParams.get("status")?.trim().toLowerCase() || "all"; // all | active | inactive | unconfigured | configured
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(250, parseInt(searchParams.get("limit") || "50", 10)));

    const filter: Record<string, unknown> = {};

    if (supplier !== "all") {
      filter.supplier = supplier;
    }

    if (game && game !== "all") {
      filter.$or = [{ gameSlug: game }, { gameCode: game }];
    }

    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    } else if (status === "unconfigured") {
      filter.$or = [{ sellingPrice: null }, { sellingPrice: { $exists: false } }, { sellingPrice: 0 }];
    } else if (status === "configured") {
      filter.sellingPrice = { $gt: 0 };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { supplierProductCode: { $regex: search, $options: "i" } },
        { gameSlug: { $regex: search, $options: "i" } },
        { gameCode: { $regex: search, $options: "i" } },
      ];
    }

    const total = await GamePackage.countDocuments(filter);
    const packages = await GamePackage.find(filter)
      .sort({ gameSlug: 1, sortOrder: 1, sellingPrice: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Stats
    const [totalPkgs, configuredPkgs, vizoPkgs, g2bulkPkgs] = await Promise.all([
      GamePackage.countDocuments().catch(() => 0),
      GamePackage.countDocuments({ sellingPrice: { $gt: 0 } }).catch(() => 0),
      GamePackage.countDocuments({ supplier: "vizo" }).catch(() => 0),
      GamePackage.countDocuments({ supplier: "g2bulk" }).catch(() => 0),
    ]);

    // Distinct games for filter dropdown
    const distinctGames = await Game.find({}).select("name slug supplierGameCode supplier").sort({ name: 1 }).lean().catch(() => []);

    return NextResponse.json({
      success: true,
      packages: packages.map((p) => ({
        id: String(p._id),
        gameSlug: p.gameSlug,
        gameCode: p.gameCode || p.gameSlug,
        supplier: p.supplier,
        supplierProductCode: p.supplierProductCode,
        name: p.name,
        diamondsOrPoints: p.diamondsOrPoints || "",
        bonus: p.bonus || "",
        buyingPrice: p.buyingPrice ?? null, // Supplier wholesale cost (Private to Admin)
        sellingPrice: p.sellingPrice ?? null, // Customer price
        originalPrice: p.originalPrice ?? null,
        currency: p.currency || "USD",
        badge: p.badge || "",
        isActive: p.isActive !== false,
        adminConfigured: p.adminConfigured || false,
        customImage: p.customImage || null,
        sortOrder: p.sortOrder || 0,
        syncedAt: p.syncedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      kpi: {
        totalPkgs,
        configuredPkgs,
        unconfiguredPkgs: totalPkgs - configuredPkgs,
        vizoPkgs,
        g2bulkPkgs,
      },
      availableGames: distinctGames.map((g) => ({
        slug: g.slug,
        code: g.supplierGameCode,
        name: g.name,
        supplier: g.supplier,
      })),
    });
  } catch (error: unknown) {
    console.error("Admin GET packages error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load packages" },
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
    const { packageId, sellingPrice, originalPrice, isActive, badge, customImage, sortOrder } = body;

    if (!packageId) {
      return NextResponse.json({ success: false, error: "Missing packageId" }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (sellingPrice !== undefined) {
      if (sellingPrice === null || sellingPrice === "" || Number(sellingPrice) <= 0) {
        updateFields.sellingPrice = null;
        updateFields.adminConfigured = false;
      } else {
        const num = parseFloat(String(sellingPrice));
        if (isNaN(num) || num < 0) {
          return NextResponse.json({ success: false, error: "Invalid selling price" }, { status: 400 });
        }
        updateFields.sellingPrice = num;
        updateFields.adminConfigured = true;
      }
    }

    if (originalPrice !== undefined) {
      if (originalPrice === null || originalPrice === "") {
        updateFields.originalPrice = null;
      } else {
        const num = parseFloat(String(originalPrice));
        updateFields.originalPrice = isNaN(num) ? null : num;
      }
    }

    if (typeof isActive === "boolean") updateFields.isActive = isActive;
    if (typeof badge === "string") updateFields.badge = badge.trim();
    if (typeof customImage === "string") updateFields.customImage = customImage.trim();
    if (typeof sortOrder === "number") updateFields.sortOrder = sortOrder;

    const updated = await GamePackage.findByIdAndUpdate(packageId, updateFields, { new: true }).lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Package not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Package updated successfully",
      package: {
        id: String(updated._id),
        sellingPrice: updated.sellingPrice,
        originalPrice: updated.originalPrice,
        isActive: updated.isActive,
        badge: updated.badge,
        adminConfigured: updated.adminConfigured,
      },
    });
  } catch (error: unknown) {
    console.error("Admin PATCH packages error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update package" },
      { status: 500 }
    );
  }
}
