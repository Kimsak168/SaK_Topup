import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  verifyVngZz2WebhookSignature,
  checkVngZz2Transaction,
  formatVngZzAmount,
} from "@/lib/services/vngzzPayWayService";
import { triggerAutomaticFulfillment } from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text().catch(() => "");
    if (!rawBody) {
      return NextResponse.json({ success: false, error: "Empty webhook payload" }, { status: 400 });
    }

    const signature =
      req.headers.get("x-signature") ||
      req.headers.get("x-vngzz2-signature") ||
      req.headers.get("x-webhook-signature") ||
      "";

    // 1. Verify Webhook Signature if secret configured
    const isSignatureValid = verifyVngZz2WebhookSignature({
      rawBody,
      signature,
    });

    if (!isSignatureValid) {
      console.warn("[VngZz2 Webhook] Rejected webhook due to invalid signature.");
      return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
    }

    // Extract transaction identifiers
    const data = (body.data || body) as Record<string, unknown>;
    const transactionId = String(
      data.transaction_id || data.transactionId || body.transaction_id || body.id || ""
    ).trim();

    const orderNumber = String(
      data.orderNumber ||
        data.order_number ||
        (data.metadata as Record<string, unknown>)?.orderNumber ||
        body.orderNumber ||
        ""
    ).trim();

    if (!transactionId && !orderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing transaction_id or orderNumber in webhook payload" },
        { status: 400 }
      );
    }

    await connectDB();
    let order: IOrder | null = null;
    if (orderNumber) {
      order = (await Order.findOne({ orderNumber })) as IOrder | null;
      if (!order) {
        console.warn(`[VngZz2 Webhook] Order not found for order number ${orderNumber}`);
        return NextResponse.json({ success: true, message: "Order not found locally" }, { status: 200 });
      }
    }

    const verifiedTransactionId = transactionId || String(order?.transactionId || "").trim();
    if (!verifiedTransactionId) {
      return NextResponse.json(
        { success: false, error: "Missing transaction_id for the local order" },
        { status: 400 }
      );
    }

    if (transactionId && order?.transactionId && String(order.transactionId).trim() !== transactionId) {
      console.warn(`[VngZz2 Webhook] Transaction/order mismatch for order ${orderNumber}`);
      return NextResponse.json({ success: false, error: "Transaction does not match order" }, { status: 400 });
    }

    // 2. Authoritative Server-to-Server Verification
    // Never trust webhook payload blindly: always reconcile with check_transaction
    const checkResult = await checkVngZz2Transaction(verifiedTransactionId);
    if (!checkResult.isPaid) {
      console.warn(
        `[VngZz2 Webhook] Transaction ${verifiedTransactionId} received webhook but is not verified as PAID (state: ${checkResult.state}).`
      );
      return NextResponse.json({ success: true, message: "Transaction not paid yet" }, { status: 200 });
    }

    if (!order) {
      order = (await Order.findOne({ transactionId: verifiedTransactionId })) as IOrder | null;
    }
    if (!order) {
      console.warn(`[VngZz2 Webhook] Order not found for txn ${verifiedTransactionId}`);
      return NextResponse.json({ success: true, message: "Order not found locally" }, { status: 200 });
    }

    // Prevent underpayment
    if (typeof checkResult.amount === "number" && checkResult.amount > 0 && checkResult.amount < order.amount) {
      console.warn(
        `[VngZz2 Webhook] Underpaid order ${order.orderNumber}: expected ${order.amount}, got ${checkResult.amount}`
      );
      return NextResponse.json({ success: false, error: "Underpaid transaction" }, { status: 400 });
    }

    if (checkResult.transactionId !== verifiedTransactionId) {
      return NextResponse.json({ success: false, error: "Verified transaction reference does not match this order." }, { status: 400 });
    }
    if (!Number.isFinite(checkResult.amount) || checkResult.amount <= 0 || formatVngZzAmount(checkResult.amount) !== formatVngZzAmount(order.amount)) {
      return NextResponse.json({ success: false, error: "Verified payment amount does not match the order." }, { status: 400 });
    }
    if (String(checkResult.currency).toUpperCase() !== String(order.currency || "USD").toUpperCase()) {
      return NextResponse.json({ success: false, error: "Verified payment currency does not match the order." }, { status: 400 });
    }

    if (["PAID", "REFUNDED"].includes(String(order.paymentStatus).toUpperCase())) {
      return NextResponse.json({ success: true, message: "Duplicate callback acknowledged; payment was already processed." });
    }
    if (!["PENDING"].includes(String(order.paymentStatus).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Order is not in a payable state." }, { status: 409 });
    }

    // Atomically transition order to PAID
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: order.orderNumber, paymentStatus: { $in: ["PENDING", "pending"] } },
      {
        $set: {
          paymentStatus: "PAID",
          paidAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    await Payment.findOneAndUpdate(
      { orderNumber: order.orderNumber },
      {
        $setOnInsert: {
          paymentId: `PAY-${order.orderNumber}`,
          orderNumber: order.orderNumber,
          gateway: "aba_payway_v2",
          amount: order.amount,
          currency: order.currency || "USD",
        },
        $set: {
          status: "PAID",
          paidAt: new Date(),
          transactionId: checkResult.transactionId || verifiedTransactionId,
          ...(checkResult.paywayTransactionId ? { payerAccount: checkResult.paywayTransactionId } : {}),
          rawResponse: { state: "PAID", transactionId: verifiedTransactionId, amount: formatVngZzAmount(checkResult.amount), currency: checkResult.currency, verifiedAt: checkResult.checkedAt || new Date().toISOString() },
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Atomically trigger fulfillment if order was updated
    if (updatedOrder) {
      triggerAutomaticFulfillment(order.orderNumber).catch((err) => {
        console.error(`[VngZz2 Webhook] Auto-fulfillment error for ${order.orderNumber}:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      message: "Webhook processed and order reconciled",
      orderNumber: order.orderNumber,
      isPaid: true,
    });
  } catch (error: unknown) {
    console.error("[VngZz2 Webhook Error]:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal webhook processing error" },
      { status: 500 }
    );
  }
}
