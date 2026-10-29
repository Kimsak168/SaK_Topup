import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { GamePackage } from "@/models/GamePackage";
import { SmmService } from "@/models/SmmService";
import { isSupplierId } from "@/lib/services/supplierManager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ supplierId: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const { supplierId } = await context.params;
  if (!isSupplierId(supplierId)) return NextResponse.json({ success: false, error: "Unknown supplier account." }, { status: 404 });
  try {
    await connectDB();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit")) || 25));
    const [games, smm] = await Promise.all([
      GamePackage.find({ supplier: supplierId }).select("gameSlug gameCode supplier supplierProductCode name sellingPrice currency isActive supplierAvailable syncedAt").sort({ gameSlug: 1, sortOrder: 1 }).lean(),
      supplierId === "vngzz2"
        ? SmmService.find({ supplier: supplierId }).select("supplier supplierServiceId name category serviceType platform rate min max isActive supplierAvailable syncedAt").sort({ name: 1 }).lean()
        : Promise.resolve([]),
    ]);
    const rows = [
      ...games.map(row => ({ id: row.supplierProductCode, kind: "game", name: row.name, gameCode: row.gameCode || row.gameSlug, price: row.sellingPrice, currency: row.currency, active: row.isActive, available: row.supplierAvailable, syncedAt: row.syncedAt })),
      ...smm.map(row => ({ id: row.supplierServiceId, kind: "smm", name: row.name, category: row.category, platform: row.platform, serviceType: row.serviceType, rate: row.rate ?? null, min: row.min, max: row.max, active: row.isActive, available: row.supplierAvailable, syncedAt: row.syncedAt })),
    ];
    const start = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      rows: rows.slice(start, start + limit),
      mappingState: supplierId === "webbuilder" ? "game-only" : supplierId === "g2bulk" ? "game-catalog-present-smm-catalog-not-mapped" : "game-and-smm",
      pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Supplier service mappings are unavailable." }, { status: 503 });
  }
}
