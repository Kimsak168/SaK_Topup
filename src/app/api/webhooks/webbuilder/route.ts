import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { verifyWebBuilderWebhookSignature } from "@/lib/suppliers/webbuilder";

export const dynamic = "force-dynamic";

/**
 * WebBuilder Signed Final-Status Webhook Handler
 * Accepts: order.succeeded, order.failed, order.manual_review
 * Signature: HMAC-SHA256(signing_secret, timestamp + "." + raw_request_body)
 * Durable recording & replay protection via X-WebBuilder-Event.
 */
export async function POST(req: NextRequest) {
  try {
    const signature =
      req.headers.get("x-webbuilder-signature") ||
      req.headers.get("x-signature") ||
      "";

    const timestamp =
      req.headers.get("x-webbuilder-timestamp") ||
      req.headers.get("x-timestamp") ||
      "";

    const eventId =
      req.headers.get("x-webbuilder-event") ||
      req.headers.get("x-event-id") ||
      "";

    // 1. Read raw body as text for byte-exact cryptographic signature verification
    const rawBody = await req.text();

    if (!rawBody) {
      return NextResponse.json({ success: false, error: "Empty webhook payload" }, { status: 400 });
    }

    // 2. Cryptographic signature and freshness verification
    const isValid = verifyWebBuilderWebhookSignature({
      rawBody,
      signature,
      timestamp,
    });

    if (!isValid) {
      console.warn("[WebBuilder Webhook] Signature verification failed or expired timestamp.");
      return NextResponse.json(
        { success: false, error: "Invalid signature or expired timestamp" },
        { status: 401 }
      );
    }

    // 3. Parse JSON after signature verification
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: "Malformed JSON payload" }, { status: 400 });
    }

    const eventType = String(payload.event || payload.type || "");
    const data = (payload.data || payload) as Record<string, unknown>;
    const wbOrderId = String(data.order_id || data.id || "").trim();
    const reference = String(data.reference || "").trim();
    const failureReason = String(data.failure_reason || data.error || "");

    const effectiveEventId = eventId || String(payload.event_id || `${wbOrderId}-${eventType}`);

    if (!wbOrderId && !reference) {
      return NextResponse.json(
        { success: false, error: "Missing order_id or reference in event payload" },
        { status: 400 }
      );
    }

    await connectDB();

    // 4. Locate order in database
    const order = await Order.findOne({
      supplier: "webbuilder",
      $or: [
        ...(wbOrderId ? [{ supplierOrderId: wbOrderId }] : []),
        ...(reference ? [{ orderNumber: reference }] : []),
      ],
    });

    if (!order) {
      console.warn(`[WebBuilder Webhook] Order not found for wbOrderId: ${wbOrderId}, ref: ${reference}`);
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // 5. Idempotent check (replay protection)
    const existingEvents = order.webhookEvents || [];
    if (existingEvents.includes(effectiveEventId)) {
      return NextResponse.json({
        success: true,
        message: `Duplicate webhook event acknowledged: ${effectiveEventId}`,
      });
    }

    // 6. Durable recording & state transition
    const updateQuery: Record<string, unknown> = {
      $addToSet: { webhookEvents: effectiveEventId },
      $set: {
        updatedAt: new Date(),
        lastSupplierStatus: eventType.replace(/^order\./, ""),
      },
    };

    const updateSet = updateQuery.$set as Record<string, unknown>;

    if (eventType === "order.succeeded") {
      updateSet.fulfillmentStatus = "completed";
      updateSet.fulfilledAt = new Date();
      updateSet.adminNotes = "Delivered confirmed via WebBuilder signed webhook";
    } else if (eventType === "order.failed") {
      updateSet.fulfillmentStatus = "failed";
      updateSet.errorLog = failureReason || "WebBuilder webhook marked order failed";
      updateSet.adminNotes = "WebBuilder order failed. Reserved funds released.";
    } else if (eventType === "order.manual_review") {
      // Keep customer order pending/processing, stop automatic retries, contact support
      updateSet.fulfillmentStatus = "processing";
      updateSet.adminNotes = "Flagged by WebBuilder for manual review. Awaiting support reconciliation.";
    } else {
      console.log(`[WebBuilder Webhook] Received unhandled event type: ${eventType}`);
    }

    // Durable database update
    await Order.findOneAndUpdate({
      _id: order._id,
      paymentStatus: { $in: ["PAID", "paid"] },
      fulfillmentStatus: { $in: ["processing", "PROCESSING", "pending", "NOT_STARTED"] },
      webhookEvents: { $ne: effectiveEventId },
    }, updateQuery);

    console.log(
      `[WebBuilder Webhook] Durably recorded event ${effectiveEventId} (${eventType}) for order ${order.orderNumber}`
    );

    // Return 200 only after durable database commit
    return NextResponse.json({
      success: true,
      message: `Webhook event ${effectiveEventId} processed successfully`,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error("[WebBuilder Webhook Error]:", error);
    return NextResponse.json({ success: false, error: "Internal webhook processing error" }, { status: 500 });
  }
}
