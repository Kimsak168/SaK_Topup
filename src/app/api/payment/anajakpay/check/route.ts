import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  checkAnajakPayTransactionV2,
  formatAnajakAmount,
} from "@/lib/services/anajakPayService";
import { triggerAutomaticFulfillment } from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";

/**
 * Backend-only Verify V2 verification endpoint.
 * Accepts orderNumber or transactionId.
 * Calls AnajakPay check-transv2-khqrcc using SHA1(secret + transaction_id).
 * Never exposes the Secret Key or provider hash to the browser.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["orderNumber", "transactionId"].some(key => body[key] !== undefined &&
        (typeof body[key] !== "string" || body[key].length > 256))) {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 400 });
    }
    const { orderNumber, transactionId } = body;

    const queryKey = String(orderNumber || transactionId || "").trim();
    if (!queryKey) {
      return NextResponse.json(
        { success: false, error: "Order number or transaction ID is required" },
        { status: 400 }
      );
    }

    await connectDB();
    const order = await Order.findOne({
      $or: [{ orderNumber: queryKey }, { transactionId: queryKey }],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const currentStatus = String(order.paymentStatus).toUpperCase();
    if (currentStatus === "PAID") {
      return NextResponse.json({
        success: true,
        orderNumber: order.orderNumber,
        paymentStatus: "PAID",
        fulfillmentStatus: String(order.fulfillmentStatus).toUpperCase(),
        message: "Payment already confirmed",
      });
    }

    if (!order.transactionId) {
      return NextResponse.json(
        { success: false, error: "Order has no associated payment transaction ID" },
        { status: 400 }
      );
    }

    // Call AnajakPay Verify V2 endpoint
    const checkResult = await checkAnajakPayTransactionV2(order.transactionId);

    if (checkResult.status === "PAID") {
      if (typeof checkResult.amount !== "number" || !Number.isFinite(checkResult.amount) || checkResult.amount <= 0) {
        return NextResponse.json(
          { success: false, error: "Payment verification did not provide a valid amount" },
          { status: 503 }
        );
      }
      const expectedAmount = formatAnajakAmount(order.amount);
      const callbackAmount = formatAnajakAmount(checkResult.amount);

      if (expectedAmount === callbackAmount) {
        // Atomic update to prevent duplicate processing
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

          // Submit top-up exactly once to supplier
          const fulfillment = await triggerAutomaticFulfillment(order.orderNumber);

          return NextResponse.json({
            success: true,
            orderNumber: order.orderNumber,
            paymentStatus: "PAID",
            fulfillmentStatus: String(fulfillment?.fulfillmentStatus || updated.fulfillmentStatus).toUpperCase(),
            message: "Payment successfully verified and top-up queued",
          });
        }
      } else {
        console.warn(
          `[AnajakPay Check] Amount mismatch: expected ${expectedAmount}, got ${callbackAmount}`
        );
        return NextResponse.json(
          { success: false, error: "Payment amount mismatch detected" },
          { status: 400 }
        );
      }
    }

    // Another request may have confirmed payment while this inquiry was running.
    const latest = await Order.findOne({ orderNumber: order.orderNumber });
    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      paymentStatus: String(latest?.paymentStatus || order.paymentStatus).toUpperCase(),
      fulfillmentStatus: String(latest?.fulfillmentStatus || order.fulfillmentStatus).toUpperCase(),
      message: checkResult.responseMessage || "Payment pending verification",
    });
  } catch (error) {
    console.error("[AnajakPay Check Route Error]:", error);
    return NextResponse.json(
      { success: false, error: "Error verifying transaction status" },
      { status: 500 }
    );
  }
}
