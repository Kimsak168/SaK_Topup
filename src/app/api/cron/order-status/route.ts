import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { reconcilePendingPaymentsBatch } from "@/lib/services/cronPaymentWorker";
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
      error: "Unauthorized cron access attempt to /api/cron/order-status",
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    await connectDB();
    const payments = await reconcilePendingPaymentsBatch(5, 12000);
    const supplierOrders = await reconcileSupplierOrdersBatch(5, 12000);
    const checked = payments.checked + supplierOrders.checked;

    return NextResponse.json({
      success: true,
      job: "order-status",
      timestamp: new Date().toISOString(),
      checked,
      payments,
      supplierOrders,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Status worker failed";
    logCronEvent({
      tag: "CRON_SUPPLIER",
      event: "permanent_error",
      error: errorMsg,
    });
    return NextResponse.json({ success: false, error: "Status worker unavailable" }, { status: 503 });
  }
}
