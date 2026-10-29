import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { SupplierBalanceSnapshot } from "@/models/SupplierBalanceSnapshot";
import { isSupplierId } from "@/lib/services/supplierManager";

export const dynamic = "force-dynamic";

function pagination(req: NextRequest) {
  const page = Math.max(1, Math.min(100_000, Number(req.nextUrl.searchParams.get("page")) || 1));
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit")) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

export async function GET(req: NextRequest, context: { params: Promise<{ supplierId: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const { supplierId } = await context.params;
  if (!isSupplierId(supplierId)) return NextResponse.json({ success: false, error: "Unknown supplier account." }, { status: 404 });
  try {
    await connectDB();
    const { page, limit, skip } = pagination(req);
    const filter = { supplierId };
    const [rows, total] = await Promise.all([
      SupplierBalanceSnapshot.find(filter).sort({ checkedAt: -1 }).skip(skip).limit(limit).lean(),
      SupplierBalanceSnapshot.countDocuments(filter),
    ]);
    return NextResponse.json({
      success: true,
      rows: rows.map(row => ({ id: String(row._id), walletId: row.walletId, amount: row.amount.toString(), currency: row.currency, source: row.source, freshness: row.source === "manual" ? "manual" : Date.now() - row.checkedAt.getTime() <= 5 * 60_000 ? "live" : "cached", checkedAt: row.checkedAt, checkedBy: row.checkedBy || null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Balance history is unavailable." }, { status: 503 });
  }
}
