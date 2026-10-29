import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { listSupplierAccounts, isSupplierId } from "@/lib/services/supplierManager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ supplierId: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const { supplierId } = await context.params;
  if (!isSupplierId(supplierId)) return NextResponse.json({ success: false, error: "Unknown supplier account." }, { status: 404 });
  try {
    const supplier = (await listSupplierAccounts()).find(item => item.id === supplierId);
    return NextResponse.json({ success: true, supplier });
  } catch {
    return NextResponse.json({ success: false, error: "Supplier account data is unavailable." }, { status: 503 });
  }
}
