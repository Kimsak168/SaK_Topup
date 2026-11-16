import "server-only";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";
import { dispatchOrderNotifications } from "@/lib/services/telegramNotificationService";

/**
 * Server-side Payment Watcher
 * 
 * Runs in the background on the server via Next.js `after()`.
 * Actively monitors an order after QR generation, even if the customer:
 * - Clears/closes their browser tab ("clear website")
 * - Leaves the site open in ABA Mobile
 * - Loses mobile internet connection
 * 
 * Once payment settles in ABA, this watcher immediately marks the order PAID
 * and triggers automated top-up fulfillment via the game supplier.
 */
export async function watchOrderPaymentUntilSettled(
  orderNumber: string,
  transactionId: string,
  maxWaitMs = 50_000
): Promise<void> {
  const started = Date.now();
  const pollIntervalMs = 3500;

  try {
    await connectDB();

    while (Date.now() - started < maxWaitMs) {
      // Wait before checking to give the customer time to transfer in ABA
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      // Fetch the latest order state to see if client polling or webhook already settled it
      const order = await Order.findOne({ orderNumber }).lean();
      if (!order) return;

      const currentStatus = String(order.paymentStatus || "").toUpperCase();

      // If already settled, we're done
      if (currentStatus === "PAID" || currentStatus === "FAILED") {
        return;
      }

      // Reconcile against VngZz2 / ABA gateway
      try {
        const latest = await reconcileOrderPayment(orderNumber, true);
        const nextStatus = String(latest.paymentStatus || "").toUpperCase();

        if (nextStatus === "PAID") {
          // Immediately dispatch Telegram notification for successful payment & fulfillment
          try {
            await dispatchOrderNotifications(orderNumber);
          } catch {
            // Non-critical notification failure
          }
          return;
        }

        if (nextStatus === "FAILED") {
          return;
        }
      } catch {
        // Transient inquiry error; retry on next tick
      }
    }

    // If still pending after maxWaitMs, trigger a background cron sweep so the order isn't forgotten
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    if (appUrl) {
      const pingUrl = `${appUrl.replace(/\/+$/, "")}/api/cron/payments?limit=5`;
      void fetch(pingUrl, {
        headers: { "user-agent": "vercel-cron/self-trigger" },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } catch (error) {
    console.error(`[ServerPaymentWatcher] Error watching order ${orderNumber}:`, error);
  }
}
