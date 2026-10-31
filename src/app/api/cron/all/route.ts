import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { connectDB } from "@/lib/mongodb";
import { reconcilePendingPaymentsBatch } from "@/lib/services/cronPaymentWorker";
import { reconcileSupplierOrdersBatch } from "@/lib/services/cronSupplierWorker";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramOutboxService";
import { logCronEvent } from "@/lib/cronLogger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    logCronEvent({
      tag: "CRON_AUTH",
      event: "permanent_error",
      error: "Unauthorized cron access attempt to /api/cron/all",
    });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  logCronEvent({ tag: "CRON_ALL", event: "start" });

  try {
    await connectDB();

    // Step 1: Reconcile pending payments (20s budget)
    const payments = await reconcilePendingPaymentsBatch(10, 20000);

    // Step 2: Reconcile pending supplier top-up deliveries (20s budget)
    const supplierOrders = await reconcileSupplierOrdersBatch(10, 20000);

    // Step 3: Dispatch / retry pending Telegram outbox notifications (10s budget)
    const telegram = await dispatchPendingTelegramNotifications(20);

    const durationMs = Date.now() - started;

    logCronEvent({
      tag: "CRON_ALL",
      event: "summary",
      durationMs,
      stats: {
        payments,
        supplierOrders,
        telegram,
      },
    });

    return NextResponse.json({
      success: true,
      job: "all",
      timestamp: new Date().toISOString(),
      durationMs,
      payments,
      supplierOrders,
      telegram,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Master cron worker failed";
    logCronEvent({
      tag: "CRON_ALL",
      event: "permanent_error",
      error: errorMsg,
    });
    return NextResponse.json({ success: false, error: "Master cron worker unavailable" }, { status: 503 });
  }
}

