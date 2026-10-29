import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order, IOrder } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { checkVngZz2Transaction, formatVngZzAmount } from "@/lib/services/vngzzPayWayService";
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
      if (checkResult.transactionId !== txnToQuery) {
        return NextResponse.json({ success: false, error: "Verified transaction reference does not match this order.", isPaid: false }, { status: 400 });
      }
      if (!Number.isFinite(checkResult.amount) || checkResult.amount <= 0 || formatVngZzAmount(checkResult.amount) !== formatVngZzAmount(order.amount)) {
        return NextResponse.json({ success: false, error: "Payment amount does not match the order amount.", isPaid: false }, { status: 400 });
      }
      if (String(checkResult.currency).toUpperCase() !== String(order.currency || "USD").toUpperCase()) {
        return NextResponse.json({ success: false, error: "Payment currency does not match the order currency.", isPaid: false }, { status: 400 });
      }

      // Mark order PAID atomically
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

      // Mark payment PAID
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
            transactionId: checkResult.transactionId || txnToQuery,
            ...(checkResult.paywayTransactionId ? { payerAccount: checkResult.paywayTransactionId } : {}),
            rawResponse: { state: checkResult.state, transactionId: txnToQuery, amount: formatVngZzAmount(checkResult.amount), currency: checkResult.currency, checkedAt: checkResult.checkedAt },
            updatedAt: new Date(),
          },
        },
        { upsert: true }
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
