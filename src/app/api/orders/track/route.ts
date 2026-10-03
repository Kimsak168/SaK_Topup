import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query")?.trim() || "";

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Please provide an Order Number or Player ID" },
        { status: 400 }
      );
    }

    try {
      await connectDB();

      // Query by orderNumber or playerId
      const orders = await Order.find({
        $or: [
          { orderNumber: { $regex: new RegExp(`^${query}$`, "i") } },
          { playerId: query },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // SANITIZE: Strictly return public customer data only!
      // NEVER expose buyingPrice, profit, supplier internal credentials, or error logs!
      const sanitized = orders.map((o) => ({
        orderNumber: o.orderNumber,
        gameName: o.gameName,
        packageName: o.packageName,
        playerId: o.playerId,
        serverId: o.serverId || null,
        playerName: o.playerName || null,
        amount: o.amount,
        currency: o.currency,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        createdAt: o.createdAt,
      }));

      return NextResponse.json({
        success: true,
        orders: sanitized,
      });
    } catch (dbErr) {
      console.warn("MongoDB offline or connection error during order track:", dbErr);
      return NextResponse.json({
        success: true,
        orders: [],
        message: "No orders found matching the query",
      });
    }
  } catch (error) {
    console.error("Public order track error:", error);
    return NextResponse.json(
      { success: false, error: "Order lookup failed" },
      { status: 500 }
    );
  }
}
