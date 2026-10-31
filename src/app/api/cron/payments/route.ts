import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { reconcilePendingPaymentsBatch } from "@/lib/services/cronPaymentWorker";
import { logCronEvent } from "@/lib/cronLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logCronEvent({
      tag: "CRON_AUTH",
      event: "permanent_error",
      error: "Unauthorized cron access attempt to /api/cron/payments",
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 10;

  try {
    await connectDB();
    const result = await reconcilePendingPaymentsBatch(limit, 25000);
    return NextResponse.json({
      success: true,
      job: "payments",
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Payment reconciliation worker failed";
    logCronEvent({
      tag: "CRON_PAYMENTS",
      event: "permanent_error",
      error: errorMsg,
    });
    return NextResponse.json({ success: false, error: "Payment reconciliation worker unavailable" }, { status: 503 });
  }
}

