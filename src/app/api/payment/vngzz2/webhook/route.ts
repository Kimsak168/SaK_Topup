import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { verifyVngZz2WebhookSignature } from "@/lib/services/vngzzPayWayService";
import { isPermanentVerificationConflict, paymentGatewayForOrder, reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";
import { dispatchPendingTelegramNotifications } from "@/lib/services/telegramNotificationService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || req.headers.get("x-vngzz2-signature") || req.headers.get("x-webhook-signature") || "";
    if (!verifyVngZz2WebhookSignature({ rawBody, signature })) return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    const body = JSON.parse(rawBody);
    const data = body?.data || body;
    if (!data || typeof data !== "object" || Array.isArray(data)) return NextResponse.json({ success: false, error: "Invalid callback" }, { status: 400 });
    const transactionId = String(data.transaction_id || data.transactionId || body.transaction_id || body.id || "").trim();
    const orderNumber = String(data.orderNumber || data.order_number || data.metadata?.orderNumber || body.orderNumber || "").trim();
    if ((!transactionId && !orderNumber) || transactionId.length > 256 || orderNumber.length > 256) return NextResponse.json({ success: false, error: "Invalid transaction reference" }, { status: 400 });
    await connectDB();
    const order = await Order.findOne({ ...(orderNumber ? { orderNumber } : {}), ...(transactionId ? { transactionId } : {}) });
    if (!order) return NextResponse.json({ success: true, message: "No matching local order" });
    if (paymentGatewayForOrder(order) !== "aba_payway_v2") return NextResponse.json({ success: false, error: "Payment gateway mismatch" }, { status: 400 });
    // Callback status is never trusted, even with a valid signature.
    const latest = await reconcileOrderPayment(order.orderNumber);
    void dispatchPendingTelegramNotifications(6).catch(() => {});
    return NextResponse.json({ success: true, orderNumber: latest.orderNumber, paymentStatus: latest.paymentStatus, isPaid: String(latest.paymentStatus).toUpperCase() === "PAID" });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, error: "Invalid callback JSON" }, { status: 400 });
    if (isPermanentVerificationConflict(error)) return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Payment verification conflict" }, { status: 400 });
    return NextResponse.json({ success: false, error: "Callback verification temporarily unavailable" }, { status: 503 });
  }
}
