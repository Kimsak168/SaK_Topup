import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  verifyVngZz2WebhookSignature,
  checkVngZz2Transaction,
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

    // 2. Authoritative Server-to-Server Verification
    // Never trust webhook payload blindly: always reconcile with check_transaction
    const checkResult = await checkVngZz2Transaction(transactionId);
    if (!checkResult.isPaid) {
      console.warn(
        `[VngZz2 Webhook] Transaction ${transactionId} received webhook but is not verified as PAID (state: ${checkResult.state}).`
      );
      return NextResponse.json({ success: true, message: "Transaction not paid yet" }, { status: 200 });
    }

    await connectDB();

    const filter: Record<string, unknown> = {};
    if (orderNumber) filter.orderNumber = orderNumber;
    else if (transactionId) filter.transactionId = transactionId;

    const order = (await Order.findOne(filter)) as IOrder | null;
    if (!order) {
      console.warn(`[VngZz2 Webhook] Order not found for txn ${transactionId}`);
      return NextResponse.json({ success: true, message: "Order not found locally" }, { status: 200 });
    }

    // Prevent underpayment
    if (typeof checkResult.amount === "number" && checkResult.amount > 0 && checkResult.amount < order.amount) {
      console.warn(
        `[VngZz2 Webhook] Underpaid order ${order.orderNumber}: expected ${order.amount}, got ${checkResult.amount}`
      );
      return NextResponse.json({ success: false, error: "Underpaid transaction" }, { status: 400 });
    }

    // Atomically transition order to PAID
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: order.orderNumber, paymentStatus: { $ne: "PAID" } },
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
        $set: {
          status: "PAID",
          paidAt: new Date(),
          transactionId: checkResult.transactionId || transactionId,
          payerAccount: checkResult.paywayTransactionId || undefined,
          rawResponse: body,
          updatedAt: new Date(),
        },
      }
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
