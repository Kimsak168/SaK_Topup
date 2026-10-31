import "server-only";
import { randomUUID } from "node:crypto";
import { Order } from "@/models/Order";
import { reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";
import { reconcileSupplierFulfillment } from "@/lib/services/fulfillmentService";
import { acquireJobLease, releaseJobLease } from "@/lib/services/backgroundJobLease";

export async function reconcilePendingOrderStatuses(limit = 5) {
  const lease = await acquireJobLease("order-status-poll", 60_000);
  if (!lease) return { checked: 0, busy: true };
  const started = Date.now();
  let checked = 0;
  try {
    while (checked < limit && Date.now() - started < 25_000) {
      const now = new Date();
      const token = randomUUID();
      const order = await Order.findOneAndUpdate({
        createdAt: { $gte: new Date(Date.now() - 48 * 3600_000) },
        $and: [
          { $or: [{ supplierNextPollAt: { $exists: false } }, { supplierNextPollAt: { $lte: now } }] },
          { $or: [{ supplierPollLockedUntil: { $exists: false } }, { supplierPollLockedUntil: { $lte: now } }] },
          { $or: [{ supplierPollAttempts: { $exists: false } }, { supplierPollAttempts: { $lt: 48 } }] },
          { $or: [
            { paymentStatus: { $in: ["PENDING", "pending", "EXPIRED", "expired"] }, transactionId: { $type: "string", $ne: "" }, paymentGateway: { $in: ["aba_payway_v2", "vngzz2", "khqr"] } },
            { paymentStatus: { $in: ["PAID", "paid"] }, fulfillmentStatus: { $in: ["NOT_STARTED", "pending", "processing", "PROCESSING"] } },
          ] },
        ],
      }, { $set: { supplierPollLockedUntil: new Date(Date.now() + 120_000), supplierPollToken: token }, $inc: { supplierPollAttempts: 1 } },
      { new: true, sort: { supplierNextPollAt: 1, createdAt: 1 } });
      if (!order) break;
      checked++;
      try {
        const latest = await reconcileOrderPayment(order.orderNumber);
        if (String(latest.paymentStatus).toUpperCase() === "PAID" && String(latest.fulfillmentStatus).toLowerCase() === "processing") {
          await reconcileSupplierFulfillment(order.orderNumber);
        }
      } catch {
        // Inquiry failures remain unknown. Never resubmit a supplier purchase.
      } finally {
        const delay = Math.min(3600, 60 * 2 ** Math.min(6, Math.max(0, (order.supplierPollAttempts || 1) - 1)));
        await Order.updateOne({ _id: order._id, supplierPollToken: token }, {
          $set: { supplierNextPollAt: new Date(Date.now() + delay * 1000) },
          $unset: { supplierPollLockedUntil: "", supplierPollToken: "" },
        });
      }
    }
    return { checked };
  } finally {
    await releaseJobLease("order-status-poll", lease);
  }
}
