import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isSupplierId, testSupplierConnection } from "@/lib/services/supplierManager";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ supplierId: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const { supplierId } = await context.params;
  if (!isSupplierId(supplierId)) return NextResponse.json({ success: false, error: "Unknown supplier account." }, { status: 404 });
  try {
    return NextResponse.json({ success: true, ...(await testSupplierConnection(supplierId, auth.session)) });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 250) : "Supplier connection test failed.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
