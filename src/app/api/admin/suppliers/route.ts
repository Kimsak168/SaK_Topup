import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  listSupplierAccounts,
  recordManualSupplierBalance,
} from "@/lib/services/supplierManager";

export const dynamic = "force-dynamic";

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 250) : "Supplier operation failed.";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    const accounts = await listSupplierAccounts();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), accounts });
  } catch {
    return NextResponse.json({ success: false, error: "Supplier account data is unavailable." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "A JSON request body is required." }, { status: 400 }); }
  if (body.action !== "manual-balance") return NextResponse.json({ success: false, error: "Unsupported supplier action." }, { status: 400 });
  try {
    const result = await recordManualSupplierBalance({
      supplierId: String(body.supplierId || ""),
      walletId: String(body.walletId || ""),
      amount: String(body.amount || ""),
      currency: String(body.currency || "").toUpperCase(),
      confirmation: String(body.confirmation || ""),
    }, auth.session);
    return NextResponse.json({ success: true, balance: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: safeMessage(error) }, { status: 400 });
  }
}
