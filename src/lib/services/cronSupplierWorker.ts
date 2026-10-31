import "server-only";
import { randomUUID } from "node:crypto";
import { Order } from "@/models/Order";
import { reconcileSupplierFulfillment } from "@/lib/services/fulfillmentService";
import { acquireJobLease, releaseJobLease } from "@/lib/services/backgroundJobLease";
import { logCronEvent } from "@/lib/cronLogger";

export interface SupplierReconciliationSummary {
  checked: number;
  completed: number;
  failed: number;
  processing: number;
  skipped: number;
  busy?: boolean;
  durationMs: number;
}

export async function reconcileSupplierOrdersBatch(limit = 10, maxDurationMs = 25000): Promise<SupplierReconciliationSummary> {
  const started = Date.now();
  const summary: SupplierReconciliationSummary = {
    checked: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    skipped: 0,
    durationMs: 0,
  };

  const lease = await acquireJobLease("cron-supplier-orders", 60_000);
  if (!lease) {
    logCronEvent({ tag: "CRON_SUPPLIER", event: "busy", details: { message: "Another supplier reconciliation worker is active." } });
    summary.busy = true;
    summary.durationMs = Date.now() - started;
    return summary;
  }

  logCronEvent({ tag: "CRON_SUPPLIER", event: "start", details: { limit, maxDurationMs } });

  try {
    while (summary.checked < limit && Date.now() - started < maxDurationMs) {
      const now = new Date();
      const token = randomUUID();

      // Atomic claim for verified paid orders awaiting supplier delivery
      const order = await Order.findOneAndUpdate(
        {
          createdAt: { $gte: new Date(Date.now() - 7 * 86400_000) },
          paymentStatus: { $in: ["PAID", "paid"] },
          fulfillmentStatus: { $in: ["NOT_STARTED", "pending", "processing", "PROCESSING"] },
          $and: [
            { $or: [{ supplierNextPollAt: { $exists: false } }, { supplierNextPollAt: { $lte: now } }] },
            { $or: [{ supplierPollLockedUntil: { $exists: false } }, { supplierPollLockedUntil: { $lte: now } }] },
            { $or: [{ supplierPollAttempts: { $exists: false } }, { supplierPollAttempts: { $lt: 48 } }] },
          ],
        },
        {
          $set: {
            supplierPollLockedUntil: new Date(Date.now() + 120_000),
            supplierPollToken: token,
          },
          $inc: { supplierPollAttempts: 1 },
        },
        { new: true, sort: { supplierNextPollAt: 1, createdAt: 1 } }
      );

      if (!order) break;
      summary.checked++;

      let outcome: "completed" | "failed" | "processing" = "processing";
      try {
        const result = await reconcileSupplierFulfillment(order.orderNumber);
        const latestFulfillment = String(result.fulfillmentStatus).toLowerCase();

        if (["completed", "delivered", "success"].includes(latestFulfillment)) {
          outcome = "completed";
          summary.completed++;
        } else if (latestFulfillment === "failed") {
          outcome = "failed";
          summary.failed++;
        } else {
          outcome = "processing";
          summary.processing++;
        }

        logCronEvent({
          tag: "CRON_SUPPLIER",
          event: "progress",
          orderNumber: order.orderNumber,
          supplier: order.supplier,
          details: { outcome, message: result.message, supplierOrderId: result.supplierOrderId },
        });
      } catch (err) {
        // Network timeout, provider 503, or temporary supplier outage:
        // NEVER mark order as failed! Keep it processing safely.
        outcome = "processing";
        summary.processing++;
        logCronEvent({
          tag: "CRON_SUPPLIER",
          event: "transient_error",
          orderNumber: order.orderNumber,
          supplier: order.supplier,
          error: err instanceof Error ? err.message : "Supplier status check temporarily unavailable",
        });
      } finally {
        const attempts = order.supplierPollAttempts || 1;
        // Exponential backoff: 60s, 120s, 240s... up to 3600s
        const delaySeconds = Math.min(3600, 60 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
        const isFinished = outcome === "completed" || outcome === "failed";

        await Order.updateOne(
          { _id: order._id, supplierPollToken: token },
          {
            $set: {
              ...(isFinished
                ? { supplierNextPollAt: new Date(Date.now() + 30 * 86400_000) }
                : { supplierNextPollAt: new Date(Date.now() + delaySeconds * 1000) }),
            },
            $unset: { supplierPollLockedUntil: "", supplierPollToken: "" },
          }
        );
      }
    }

    summary.durationMs = Date.now() - started;
    logCronEvent({
      tag: "CRON_SUPPLIER",
      event: "summary",
      durationMs: summary.durationMs,
      stats: { ...summary },
    });
    return summary;
  } finally {
    await releaseJobLease("cron-supplier-orders", lease);
  }
}

