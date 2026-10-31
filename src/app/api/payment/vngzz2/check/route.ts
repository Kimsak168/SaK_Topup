import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { isPermanentVerificationConflict, paymentGatewayForOrder, reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["orderNumber", "transactionId"].some(key => body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 256))) {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 400 });
    }
    const orderNumber = body.orderNumber?.trim();
    const transactionId = body.transactionId?.trim();
    if (!orderNumber && !transactionId) return NextResponse.json({ success: false, error: "Order number or transaction ID is required" }, { status: 400 });
    await connectDB();
    const order = await Order.findOne({ ...(orderNumber ? { orderNumber } : {}), ...(transactionId ? { transactionId } : {}) });
    if (!order) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    if (paymentGatewayForOrder(order) !== "aba_payway_v2") return NextResponse.json({ success: false, error: "Payment gateway mismatch" }, { status: 400 });
    const latest = await reconcileOrderPayment(order.orderNumber);
    return NextResponse.json({ success: true, orderNumber: latest.orderNumber, paymentStatus: String(latest.paymentStatus).toUpperCase(), fulfillmentStatus: latest.fulfillmentStatus, isPaid: String(latest.paymentStatus).toUpperCase() === "PAID" });
  } catch (error) {
    if (isPermanentVerificationConflict(error)) return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Payment verification conflict" }, { status: 400 });
    return NextResponse.json({ success: false, error: "Payment verification temporarily unavailable" }, { status: 503 });
  }
}
