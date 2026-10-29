import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getFinanceTransactions, parseFinanceRange } from "@/lib/services/adminFinanceService";

export const dynamic = "force-dynamic";
const ALLOWED_STATUS = new Set(["pending", "PENDING", "successful", "SUCCESSFUL", "paid", "PAID", "failed", "FAILED", "expired", "EXPIRED"]);

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || undefined;
    const currency = params.get("currency")?.toUpperCase();
    if (status && !ALLOWED_STATUS.has(status)) return NextResponse.json({ success: false, error: "Unsupported payment status filter." }, { status: 400 });
    if (currency && !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ success: false, error: "Currency must be a three-letter code." }, { status: 400 });
    const page = Math.max(1, Math.min(100_000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 25));
    const result = await getFinanceTransactions({ ...parseFinanceRange(params), page, limit, status, currency });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Choose") ? error.message : "Finance transactions are unavailable.";
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith("Choose") ? 400 : 503 });
  }
}
