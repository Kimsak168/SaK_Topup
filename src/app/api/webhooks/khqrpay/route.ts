import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { verifyKhqrPayWebhookSignature } from "@/lib/services/khqrPayService";
import { reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";
import { dispatchOrderNotifications } from "@/lib/services/telegramNotificationService";

export const dynamic = "force-dynamic";

/**
 * KHQR PAY Webhook Handler (https://khqrpay.site/webhooks)
 * Receives: payment.update event
 * Statuses: Paid, Expired, Failed
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-webhook-signature");
    const rawBody = await req.text();

    if (!rawBody) {
      return NextResponse.json({ ok: false, error: "Empty webhook payload" }, { status: 400 });
    }

    // Verify signature if secret configured
    const isValid = verifyKhqrPayWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValid) {
      console.warn("[KHQR Pay Webhook] Signature verification failed.");
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Malformed JSON payload" }, { status: 400 });
    }

    const paymentId = String(payload.id || "").trim();
    const status = String(payload.status || "").trim().toLowerCase();

    if (!paymentId) {
      return NextResponse.json({ ok: false, error: "Missing payment id" }, { status: 400 });
    }

    console.log(`[KHQR Pay Webhook] Received update for payment ${paymentId}: ${status}`);

    await connectDB();
    const order = await Order.findOne({ transactionId: paymentId });

    if (!order) {
      console.warn(`[KHQR Pay Webhook] No order found matching transactionId ${paymentId}`);
      // Return 200 so khqrpay doesn't keep retrying unknown orders
      return NextResponse.json({ ok: true, message: "Order not found" });
    }

    if (status === "paid") {
      const settledOrder = await reconcileOrderPayment(order, true);

      // Dispatch order notifications to Telegram
      void dispatchOrderNotifications(settledOrder.orderNumber).catch((err) => {
        console.error(`[KHQR Pay Webhook] Notification dispatch error for ${settledOrder.orderNumber}:`, err);
      });

      return NextResponse.json({ ok: true, orderNumber: settledOrder.orderNumber, status: "PAID" });
    } else if (status === "expired" || status === "failed") {
      if (String(order.paymentStatus).toUpperCase() === "PENDING") {
        order.paymentStatus = status === "expired" ? "EXPIRED" : "FAILED";
        order.updatedAt = new Date();
        await order.save();
      }
      return NextResponse.json({ ok: true, orderNumber: order.orderNumber, status });
    }

    return NextResponse.json({ ok: true, status });
  } catch (err: unknown) {
    console.error("[KHQR Pay Webhook] Exception:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal webhook error" },
      { status: 500 }
    );
  }
}
