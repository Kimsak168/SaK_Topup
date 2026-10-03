import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { requireAdminAuth } from "@/lib/auth";
import { queryAnajakPayTransactionStatus } from "@/lib/services/anajakPayService";
import {
  triggerAutomaticFulfillment,
  reconcileSupplierFulfillment,
} from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const { orderId, orderNumber, transactionId } = body;

    const query: Record<string, unknown>[] = [];
    if (orderId) query.push({ _id: orderId });
    if (orderNumber) query.push({ orderNumber });
    if (transactionId) query.push({ transactionId });

    if (query.length === 0) {
      return NextResponse.json(
        { success: false, error: "Order reference is required for reconciliation" },
        { status: 400 }
      );
    }

    const order = await Order.findOne({ $or: query });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const currentPayStatus = String(order.paymentStatus).toUpperCase();
    let paymentVerified = currentPayStatus === "PAID";
    let message = "";

    // 1. If not yet marked PAID, query AnajakPay gateway
    if (!paymentVerified && order.transactionId) {
      const check = await queryAnajakPayTransactionStatus(order.transactionId);

      if (check.verified) {
        order.paymentStatus = "PAID";
        order.paidAt = new Date();
        await order.save();

        await Payment.findOneAndUpdate(
          { orderNumber: order.orderNumber },
          {
            $set: {
              status: "PAID",
              paidAt: new Date(),
              rawResponse: check.details as Record<string, unknown>,
            },
          },
          { upsert: true }
        );

        paymentVerified = true;
        message = "AnajakPay gateway verified payment as PAID. ";

        // Trigger fulfillment automatically since payment is verified
        const fulfillRes = await triggerAutomaticFulfillment(order.orderNumber);
        message += fulfillRes.message;
      } else {
        message = `AnajakPay status query: ${check.status}. Payment remains ${order.paymentStatus}. (Verification bypass is disallowed).`;
      }
    } else if (paymentVerified) {
      // 2. If already paid, reconcile supplier fulfillment status
      const fulfillRes = await reconcileSupplierFulfillment(order.orderNumber);
      message = `Payment already verified as PAID. Supplier status check: ${fulfillRes.message}`;
    } else {
      message = `No transaction ID recorded on order ${order.orderNumber} to reconcile against AnajakPay.`;
    }

    const reloaded = await Order.findById(order._id).lean();

    return NextResponse.json({
      success: true,
      message,
      order: reloaded
        ? {
            id: String(reloaded._id),
            orderNumber: reloaded.orderNumber,
            transactionId: reloaded.transactionId,
            paymentStatus: reloaded.paymentStatus,
            fulfillmentStatus: reloaded.fulfillmentStatus,
            paidAt: reloaded.paidAt,
            fulfilledAt: reloaded.fulfilledAt,
            supplierOrderId: reloaded.supplierOrderId,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("Admin order reconciliation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      },
      { status: 500 }
    );
  }
}
