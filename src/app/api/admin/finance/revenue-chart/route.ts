import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getFinanceRevenueChart, parseFinanceRange } from "@/lib/services/adminFinanceService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    const range = parseFinanceRange(req.nextUrl.searchParams);
    return NextResponse.json({ success: true, range: { from: range.from.toISOString(), to: range.to.toISOString() }, rows: await getFinanceRevenueChart(range) });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Choose") ? error.message : "Finance chart is unavailable.";
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith("Choose") ? 400 : 503 });
  }
}
