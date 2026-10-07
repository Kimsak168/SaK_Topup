import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import {
  verifyAnajakPayWebhookSignature,
  formatAnajakAmount,
  checkAnajakPayTransactionV2,
  type AnajakPayVerifyV2Result,
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

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid callback body" }, { status: 400 });
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
    let verifiedAmount = rawAmount;
    let reconciliation: AnajakPayVerifyV2Result | undefined;

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
        if (typeof verifyCheck.amount !== "number" || !Number.isFinite(verifyCheck.amount)) {
          return NextResponse.json(
            { success: false, error: "Transaction reconciliation did not provide a valid amount" },
            { status: 503 }
          );
        }
        reconciliation = verifyCheck;
        verifiedAmount = verifyCheck.amount;
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
      typeof verifiedAmount === "number" ? verifiedAmount : String(verifiedAmount)
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
    if (!reconciliation && currency !== (order.currency || "USD").toUpperCase()) {
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
      Boolean(reconciliation) || paymentStatusRaw === "SUCCESS" ||
      paymentStatusRaw === "PAID" ||
      paymentStatusRaw === "COMPLETED";

    if (!isSuccessCallback) {
      // The signature authenticates SUCCESS, not arbitrary callback status text.
      return NextResponse.json(
        { success: false, error: "Callback status does not match its success signature" },
        { status: 400 }
      );
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
    const queryCheck = reconciliation ?? await checkAnajakPayTransactionV2(transactionId);
    if (queryCheck.status === "FAILED") {
      return NextResponse.json(
        { success: false, error: "Transaction verification inquiry reported failure" },
        { status: 400 }
      );
    }

    if (queryCheck.amount !== undefined && formatAnajakAmount(queryCheck.amount) !== orderCanonicalAmount) {
      return NextResponse.json({ success: false, error: "Verified payment amount mismatch" }, { status: 400 });
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
