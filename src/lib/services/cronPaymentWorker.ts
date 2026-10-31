import "server-only";
import { randomUUID } from "node:crypto";
import { Order } from "@/models/Order";
import { reconcileOrderPayment, PaymentVerificationError } from "@/lib/services/paymentReconciliationService";
import { acquireJobLease, releaseJobLease } from "@/lib/services/backgroundJobLease";
import { logCronEvent } from "@/lib/cronLogger";

export interface PaymentReconciliationSummary {
  checked: number;
  paid: number;
  failed: number;
  expired: number;
  pending: number;
  skipped: number;
  busy?: boolean;
  durationMs: number;
}

export async function reconcilePendingPaymentsBatch(limit = 10, maxDurationMs = 25000): Promise<PaymentReconciliationSummary> {
  const started = Date.now();
  const summary: PaymentReconciliationSummary = {
    checked: 0,
    paid: 0,
    failed: 0,
    expired: 0,
    pending: 0,
    skipped: 0,
    durationMs: 0,
  };

  const lease = await acquireJobLease("cron-payment-reconciliation", 60_000);
  if (!lease) {
    logCronEvent({ tag: "CRON_PAYMENTS", event: "busy", details: { message: "Another payment reconciliation worker is active." } });
    summary.busy = true;
    summary.durationMs = Date.now() - started;
    return summary;
  }

  logCronEvent({ tag: "CRON_PAYMENTS", event: "start", details: { limit, maxDurationMs } });

  try {
    while (summary.checked < limit && Date.now() - started < maxDurationMs) {
      const now = new Date();
      const token = randomUUID();

      // Atomic record claim using token fencing & exponential backoff check
      const order = await Order.findOneAndUpdate(
        {
          createdAt: { $gte: new Date(Date.now() - 48 * 3600_000) },
          transactionId: { $type: "string", $ne: "" },
          paymentGateway: { $in: ["aba_payway_v2", "vngzz2", "khqr"] },
          paymentStatus: { $in: ["PENDING", "pending", "EXPIRED", "expired"] },
          $and: [
            { $or: [{ paymentPollNextAt: { $exists: false } }, { paymentPollNextAt: { $lte: now } }] },
            { $or: [{ paymentPollLockedUntil: { $exists: false } }, { paymentPollLockedUntil: { $lte: now } }] },
            { $or: [{ paymentPollAttempts: { $exists: false } }, { paymentPollAttempts: { $lt: 48 } }] },
          ],
        },
        {
          $set: {
            paymentPollLockedUntil: new Date(Date.now() + 120_000),
            paymentPollToken: token,
          },
          $inc: { paymentPollAttempts: 1 },
        },
        { new: true, sort: { paymentPollNextAt: 1, createdAt: 1 } }
      );

      if (!order) break;
      summary.checked++;

      let outcome: "PAID" | "FAILED" | "EXPIRED" | "PENDING" = "PENDING";
      try {
        const latest = await reconcileOrderPayment(order.orderNumber, true);
        const currentStatus = String(latest.paymentStatus).toUpperCase();
        if (currentStatus === "PAID") {
          outcome = "PAID";
          summary.paid++;
        } else if (currentStatus === "FAILED") {
          outcome = "FAILED";
          summary.failed++;
        } else if (currentStatus === "EXPIRED") {
          outcome = "EXPIRED";
          summary.expired++;
        } else {
          summary.pending++;
        }

        logCronEvent({
          tag: "CRON_PAYMENTS",
          event: "progress",
          orderNumber: order.orderNumber,
          transactionId: order.transactionId,
          details: { outcome, previousStatus: order.paymentStatus },
        });
      } catch (err) {
        if (err instanceof PaymentVerificationError && err.permanent) {
          summary.failed++;
          logCronEvent({
            tag: "CRON_PAYMENTS",
            event: "permanent_error",
            orderNumber: order.orderNumber,
            transactionId: order.transactionId,
            error: err.message,
          });
        } else {
          // Transient network failure or provider 503; preserve PENDING status safely
          summary.pending++;
          logCronEvent({
            tag: "CRON_PAYMENTS",
            event: "transient_error",
            orderNumber: order.orderNumber,
            transactionId: order.transactionId,
            error: err instanceof Error ? err.message : "Provider inquiry unavailable",
          });
        }
      } finally {
        const attempts = order.paymentPollAttempts || 1;
        // Exponential backoff: 60s, 120s, 240s... up to 3600s
        const delaySeconds = Math.min(3600, 60 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
        const isSettled = outcome === "PAID" || outcome === "FAILED";

        await Order.updateOne(
          { _id: order._id, paymentPollToken: token },
          {
            $set: {
              ...(isSettled
                ? { paymentPollNextAt: new Date(Date.now() + 7 * 86400_000) }
                : { paymentPollNextAt: new Date(Date.now() + delaySeconds * 1000) }),
            },
            $unset: { paymentPollLockedUntil: "", paymentPollToken: "" },
          }
        );
      }
    }

    summary.durationMs = Date.now() - started;
    logCronEvent({
      tag: "CRON_PAYMENTS",
      event: "summary",
      durationMs: summary.durationMs,
      stats: { ...summary },
    });
    return summary;
  } finally {
    await releaseJobLease("cron-payment-reconciliation", lease);
  }
}

