import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";
import { isPermanentVerificationConflict, reconcileOrderPayment } from "@/lib/services/paymentReconciliationService";
import { reconcileSupplierFulfillment } from "@/lib/services/fulfillmentService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      ["orderId", "orderNumber", "transactionId"].some(key => body[key] !== undefined && (typeof body[key] !== "string" || body[key].length > 256))) return NextResponse.json({ success: false, error: "Invalid order reference" }, { status: 400 });
    const filter = { ...(body.orderId ? { _id: body.orderId } : {}), ...(body.orderNumber ? { orderNumber: body.orderNumber } : {}), ...(body.transactionId ? { transactionId: body.transactionId } : {}) };
    if (!Object.keys(filter).length) return NextResponse.json({ success: false, error: "Order reference is required" }, { status: 400 });
    await connectDB();
    const existing = await Order.findOne(filter);
    if (!existing) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    const order = await reconcileOrderPayment(existing.orderNumber);
    let message = `Payment status: ${order.paymentStatus}.`;
    if (String(order.paymentStatus).toUpperCase() === "PAID" && String(order.fulfillmentStatus).toLowerCase() === "processing") {
      message += ` ${(await reconcileSupplierFulfillment(order.orderNumber)).message}`;
    }
    const latest = await Order.findById(order._id).lean();
    return NextResponse.json({ success: true, message, order: latest ? {
      id: String(latest._id), orderNumber: latest.orderNumber, transactionId: latest.transactionId,
      paymentStatus: latest.paymentStatus, fulfillmentStatus: latest.fulfillmentStatus,
      paidAt: latest.paidAt, fulfilledAt: latest.fulfilledAt, supplierOrderId: latest.supplierOrderId,
    } : null });
  } catch (error) {
    if (isPermanentVerificationConflict(error)) return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Payment verification conflict" }, { status: 400 });
    return NextResponse.json({ success: false, error: "Reconciliation unavailable; inspect the provider before retrying." }, { status: 503 });
  }
}
