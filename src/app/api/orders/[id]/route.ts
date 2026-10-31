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
    const cleanId = (id || "").trim();

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

    if (["PENDING", "EXPIRED", "PAID"].includes(String(order.paymentStatus).toUpperCase()) && order.transactionId) {
      try {
        const { reconcileOrderPayment } = await import("@/lib/services/paymentReconciliationService");
        const latest = await reconcileOrderPayment(order.orderNumber);
        order.paymentStatus = latest.paymentStatus;
        order.fulfillmentStatus = latest.fulfillmentStatus;
        order.paidAt = latest.paidAt;
        order.fulfilledAt = latest.fulfilledAt;
      } catch {
        // An unavailable inquiry does not change either business status.
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
