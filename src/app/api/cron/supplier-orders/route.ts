import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { reconcileSupplierOrdersBatch } from "@/lib/services/cronSupplierWorker";
import { logCronEvent } from "@/lib/cronLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logCronEvent({
      tag: "CRON_AUTH",
      event: "permanent_error",
      error: "Unauthorized cron access attempt to /api/cron/supplier-orders",
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 10;

  try {
    await connectDB();
    const result = await reconcileSupplierOrdersBatch(limit, 25000);
    return NextResponse.json({
      success: true,
      job: "supplier-orders",
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Supplier reconciliation worker failed";
    logCronEvent({
      tag: "CRON_SUPPLIER",
      event: "permanent_error",
      error: errorMsg,
    });
    return NextResponse.json({ success: false, error: "Supplier reconciliation worker unavailable" }, { status: 503 });
  }
}

