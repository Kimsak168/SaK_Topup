import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getFinanceSummary, parseFinanceRange } from "@/lib/services/adminFinanceService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await getFinanceSummary(parseFinanceRange(req.nextUrl.searchParams))) });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Choose") ? error.message : "Finance summary is unavailable.";
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith("Choose") ? 400 : 503 });
  }
}
