import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
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
    const filter = { supplier: supplierId };
    const [orders, total] = await Promise.all([
      Order.find(filter).select("orderNumber supplier supplierOrderId gameName gameSlug serviceType packageName quantity playerId amount buyingPrice profit currency paymentStatus fulfillmentStatus createdAt updatedAt paidAt fulfilledAt lastSupplierStatus").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return NextResponse.json({ success: true, rows: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    return NextResponse.json({ success: false, error: "Supplier orders are unavailable." }, { status: 503 });
  }
}
