import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  verifyAnajakPayWebhookSignature,
  formatAnajakAmount,
  checkAnajakPayTransactionV2,
} from "@/lib/services/anajakPayService";
import { triggerAutomaticFulfillment } from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Read body supporting JSON, urlencoded, or multipart
    let body: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        body = Object.fromEntries(formData.entries());
      }
    } else {
      body = await req.json().catch(() => ({}));
    }

    const reqTime = String(
      body.req_time || body.request_time || body.time || body.timestamp || ""
    ).trim();

    const transactionId = String(
      body.transaction_id || body.transactionId || body.order_id || ""
    ).trim();

    const rawAmount = body.amount;
    const receivedHash = String(
      body.hash || body.signature || req.headers.get("x-signature") || ""
    ).trim();

    const paymentStatusRaw = String(
      body.status || body.payment_status || "SUCCESS"
    ).toUpperCase();

    const currency = String(body.currency || "USD").toUpperCase();

    if (!transactionId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required transaction_id in callback",
        },
        { status: 400 }
      );
    }

    // 1. Signature Verification with Timing-Safe SHA-256
    // Formula: SHA256(secret_key + req_time + transaction_id + amount + "SUCCESS")
    const hasSignatureFields = Boolean(reqTime && transactionId && rawAmount !== undefined && receivedHash);
    let isSignatureValid = false;

    if (hasSignatureFields) {
      isSignatureValid = verifyAnajakPayWebhookSignature({
        reqTime,
        transactionId,
        amount: typeof rawAmount === "number" ? rawAmount : String(rawAmount),
        receivedHash,
      });
    }

    // Reject an invalid signature. If a required signature field is missing, do not treat the callback as authenticated;
    // reconcile the transaction through Verify V2 instead.
    if (!isSignatureValid) {
      console.warn(
        `[AnajakPay Webhook] Invalid signature or missing signature fields for txn: ${transactionId}. Reconciling via Verify V2...`
      );

      const verifyCheck = await checkAnajakPayTransactionV2(transactionId);
      if (verifyCheck.status === "PAID") {
        console.log(`[AnajakPay Webhook] Successfully reconciled transaction via Verify V2: ${transactionId}`);
        isSignatureValid = true;
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid signature and transaction reconciliation failed",
          },
          { status: 401 }
        );
      }
    }

    await connectDB();

    // 2. Locate original order in MongoDB
    const order = await Order.findOne({
      $or: [{ transactionId }, { orderNumber: transactionId }],
    });

    if (!order) {
      console.warn(`[AnajakPay Webhook] Order not located for transaction ID: ${transactionId}`);
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    // 3. Exact payment amount verification
    const orderCanonicalAmount = formatAnajakAmount(order.amount);
    const callbackCanonicalAmount = formatAnajakAmount(
      typeof rawAmount === "number" ? rawAmount : String(rawAmount)
    );

    if (orderCanonicalAmount !== callbackCanonicalAmount) {
      console.warn(
        `[AnajakPay Webhook] Amount mismatch on ${order.orderNumber}. Expected: ${orderCanonicalAmount}, Got: ${callbackCanonicalAmount}`
      );
      return NextResponse.json(
        { success: false, error: "Payment amount mismatch" },
        { status: 400 }
      );
    }

    // 4. Currency verification where provided
    if (currency && currency !== "USD" && currency !== order.currency) {
      console.warn(
        `[AnajakPay Webhook] Currency mismatch on ${order.orderNumber}: ${currency}`
      );
      return NextResponse.json(
        { success: false, error: "Payment currency mismatch" },
        { status: 400 }
      );
    }

    // 5. Payment status check from callback
    const isSuccessCallback =
      paymentStatusRaw === "SUCCESS" ||
      paymentStatusRaw === "PAID" ||
      paymentStatusRaw === "COMPLETED";

    if (!isSuccessCallback) {
      // Mark as failed or cancelled
      const newStatus =
        paymentStatusRaw === "CANCELLED" || paymentStatusRaw === "CANCELED"
          ? "CANCELLED"
          : paymentStatusRaw === "EXPIRED"
          ? "EXPIRED"
          : "FAILED";

      await Order.findByIdAndUpdate(order._id, {
        $set: {
          paymentStatus: newStatus,
          errorLog: `Callback received non-success status: ${paymentStatusRaw}`,
        },
      });

      await Payment.findOneAndUpdate(
        { orderNumber: order.orderNumber },
        { $set: { status: newStatus, rawResponse: body } }
      );

      return NextResponse.json({
        success: true,
        message: `Order payment status updated to ${newStatus}`,
      });
    }

    // 6. Duplicate callback detection (Idempotency)
    const currentStatus = String(order.paymentStatus).toUpperCase();
    if (currentStatus === "PAID") {
      // Order was already marked PAID and fulfillment was triggered
      return NextResponse.json({
        success: true,
        message: "Duplicate callback: payment already recorded as PAID",
      });
    }

    // 7. Verify V2 query status check as additional transaction audit
    const queryCheck = await checkAnajakPayTransactionV2(transactionId);
    if (queryCheck.status === "FAILED") {
      return NextResponse.json(
        { success: false, error: "Transaction verification inquiry reported failure" },
        { status: 400 }
      );
    }

    // 8. Idempotent Atomic Database Update: PENDING -> PAID
    const updatedOrder = await Order.findOneAndUpdate(
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

    if (!updatedOrder) {
      // Handled by concurrent request
      return NextResponse.json({
        success: true,
        message: "Duplicate callback acknowledged",
      });
    }

    // Update Payment record
    await Payment.findOneAndUpdate(
      { orderNumber: order.orderNumber },
      {
        $set: {
          status: "PAID",
          paidAt: new Date(),
          rawResponse: body,
        },
      },
      { upsert: true }
    );

    // 9. Automatic Supplier Fulfillment
    // Triggered safely AFTER server-side payment verification
    await triggerAutomaticFulfillment(order.orderNumber);

    return NextResponse.json({
      success: true,
      message: "AnajakPay V2 payment verified and fulfillment initiated",
      orderNumber: order.orderNumber,
      transactionId,
    });
  } catch (error) {
    console.error("[AnajakPay Webhook Error]:", error);
    return NextResponse.json(
      { success: false, error: "Internal webhook processing error" },
      { status: 500 }
    );
  }
}
