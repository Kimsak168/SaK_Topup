import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { verifyAnajakPayWebhookSignature } from "@/lib/services/anajakPayService";
import { paymentGatewayForOrder, reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const body = contentType.includes("form") ? Object.fromEntries((await req.formData()).entries()) : await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid callback" }, { status: 400 });
    const transactionId = String(body.transaction_id || body.transactionId || body.order_id || "").trim();
    if (!transactionId || transactionId.length > 256) return NextResponse.json({ success: false, error: "Invalid transaction reference" }, { status: 400 });
    const receivedHash = String(body.hash || body.signature || req.headers.get("x-signature") || "");
    if (receivedHash && !verifyAnajakPayWebhookSignature({ reqTime: String(body.req_time || body.request_time || body.time || body.timestamp || ""), transactionId, amount: body.amount, receivedHash })) {
      return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }
    await connectDB();
    const order = await Order.findOne({ transactionId });
    if (!order) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    if (paymentGatewayForOrder(order) !== "anajakpay") return NextResponse.json({ success: false, error: "Payment gateway mismatch" }, { status: 400 });
    // Unsigned legacy callbacks are only inquiry triggers. All outcomes,
    // including signed success callbacks, require Verify V2 confirmation.
    const latest = await reconcileOrderPayment(order.orderNumber);
    return NextResponse.json({ success: true, orderNumber: latest.orderNumber, paymentStatus: latest.paymentStatus, isPaid: String(latest.paymentStatus).toUpperCase() === "PAID" });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof SyntaxError ? "Invalid callback JSON" : "Callback verification temporarily unavailable" }, { status: error instanceof SyntaxError ? 400 : 503 });
  }
}
