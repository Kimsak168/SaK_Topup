import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = decodeURIComponent(id || "").trim();

    if (!cleanId) {
      return NextResponse.json(
        { success: false, error: "Order ID or transaction reference is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const query: Record<string, unknown>[] = [
      { orderNumber: cleanId },
      { transactionId: cleanId },
    ];

    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      query.push({ _id: cleanId });
    }

    const order = await Order.findOne({ $or: query });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    // Active Verify V2 Inquiry for PENDING orders
    // Automatically checks transaction status with AnajakPay Verify V2
    if (
      String(order.paymentStatus).toUpperCase() === "PENDING" &&
      order.transactionId
    ) {
      try {
        const { checkAnajakPayTransactionV2, formatAnajakAmount } = await import(
          "@/lib/services/anajakPayService"
        );
        const { triggerAutomaticFulfillment } = await import(
          "@/lib/services/fulfillmentService"
        );
        const { Payment } = await import("@/models/Payment");

        const checkResult = await checkAnajakPayTransactionV2(order.transactionId);

        if (checkResult.status === "PAID") {
          const expectedAmount = formatAnajakAmount(order.amount);
          const callbackAmount =
            checkResult.amount !== undefined
              ? formatAnajakAmount(checkResult.amount)
              : expectedAmount;

          if (expectedAmount === callbackAmount) {
            const updated = await Order.findOneAndUpdate(
              {
                _id: order._id,
                paymentStatus: { $in: ["PENDING", "pending"] },
              },
              {
                $set: {
                  paymentStatus: "PAID",
                  paidAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              { new: true }
            );

            if (updated) {
              await Payment.findOneAndUpdate(
                { orderNumber: order.orderNumber },
                {
                  $set: {
                    status: "PAID",
                    paidAt: new Date(),
                    rawResponse: checkResult.raw,
                  },
                },
                { upsert: true }
              );

              // Submit top-up to correct supplier exactly once
              await triggerAutomaticFulfillment(order.orderNumber);

              order.paymentStatus = "PAID";
              order.paidAt = updated.paidAt;
            }
          } else {
            console.warn(
              `[Order Status Verify] Amount mismatch on ${order.orderNumber}: expected ${expectedAmount}, provider reported ${callbackAmount}`
            );
          }
        }
      } catch (verifyErr) {
        console.error("[Order Status Verify Error]:", verifyErr);
      }
    }

    // Return authoritative, sanitized customer data only
    // NEVER expose wholesale costs, supplier credentials, or internal raw debug traces!
    const sanitized = {
      id: String(order._id),
      orderNumber: order.orderNumber,
      transactionId: order.transactionId,
      checkoutUrl: order.checkoutUrl,
      gameName: order.gameName,
      gameSlug: order.gameSlug,
      packageName: order.packageName,
      supplierProductCode: order.supplierProductCode,
      playerId: order.playerId,
      serverId: order.serverId || null,
      playerName: order.playerName || null,
      amount: order.amount,
      currency: order.currency || "USD",
      paymentMethod: order.paymentMethod,
      paymentStatus: String(order.paymentStatus).toUpperCase(),
      fulfillmentStatus: String(order.fulfillmentStatus).toUpperCase(),
      createdAt: order.createdAt,
      paidAt: order.paidAt || null,
      fulfilledAt: order.fulfilledAt || null,
    };

    return NextResponse.json({
      success: true,
      order: sanitized,
    });
  } catch (error) {
    console.error("Order lookup error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve order details" },
      { status: 500 }
    );
  }
}
