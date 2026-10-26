import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { checkVngZz2Transaction } from "@/lib/services/vngzzPayWayService";
import { triggerAutomaticFulfillment } from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body.orderNumber || "").trim();
    const transactionId = String(body.transactionId || "").trim();

    if (!orderNumber && !transactionId) {
      return NextResponse.json(
        { success: false, error: "Either orderNumber or transactionId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // 1. Find local order
    const filter: Record<string, unknown> = {};
    if (orderNumber) filter.orderNumber = orderNumber;
    if (transactionId) filter.transactionId = transactionId;

    const order = (await Order.findOne(filter)) as IOrder | null;
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const currentPayStatus = String(order.paymentStatus).toUpperCase();
    if (currentPayStatus === "PAID") {
      return NextResponse.json({
        success: true,
        orderNumber: order.orderNumber,
        paymentStatus: "PAID",
        fulfillmentStatus: order.fulfillmentStatus,
        isPaid: true,
      });
    }

    // 2. Query VngZz2 API for authoritative transaction verification
    const txnToQuery = transactionId || order.transactionId;
    if (!txnToQuery) {
      return NextResponse.json({
        success: true,
        orderNumber: order.orderNumber,
        paymentStatus: "PENDING",
        isPaid: false,
      });
    }

    const checkResult = await checkVngZz2Transaction(txnToQuery);

    if (checkResult.isPaid) {
      // Amount verification: prevent underpaid transactions
      if (typeof checkResult.amount === "number" && checkResult.amount > 0) {
        if (checkResult.amount < order.amount) {
          console.warn(
            `[VngZz2 Check] Underpaid order ${order.orderNumber}: Expected $${order.amount}, got $${checkResult.amount}`
          );
          return NextResponse.json({
            success: false,
            error: "Payment amount does not match order amount",
            isPaid: false,
          });
        }
      }

      // Mark order PAID atomically
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

      // Mark payment PAID
      await Payment.findOneAndUpdate(
        { orderNumber: order.orderNumber },
        {
          $set: {
            status: "PAID",
            paidAt: new Date(),
            transactionId: checkResult.transactionId || txnToQuery,
            payerAccount: checkResult.paywayTransactionId || undefined,
            rawResponse: {
              paywayTransactionId: checkResult.paywayTransactionId,
              receiptUrl: checkResult.receiptUrl,
              checkedAt: checkResult.checkedAt,
            },
            updatedAt: new Date(),
          },
        }
      );

      // Trigger automatic game fulfillment if order was updated now
      if (updatedOrder) {
        triggerAutomaticFulfillment(order.orderNumber).catch((err) => {
          console.error(`[VngZz2 Check] Auto-fulfillment error for ${order.orderNumber}:`, err);
        });
      }

      return NextResponse.json({
        success: true,
        orderNumber: order.orderNumber,
        paymentStatus: "PAID",
        fulfillmentStatus: updatedOrder?.fulfillmentStatus || order.fulfillmentStatus,
        isPaid: true,
        paywayTransactionId: checkResult.paywayTransactionId,
      });
    }

    // Not paid yet
    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      paymentStatus: checkResult.state || "PENDING",
      isPaid: false,
    });
  } catch (error: unknown) {
    console.error("[VngZz2 Check Route Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to verify transaction status",
      },
      { status: 500 }
    );
  }
}
