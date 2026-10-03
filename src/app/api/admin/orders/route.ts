import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim().toLowerCase() || "all";
    const supplier = searchParams.get("supplier")?.trim().toLowerCase() || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "25", 10)));

    const filter: Record<string, unknown> = {};

    if (supplier !== "all") {
      filter.supplier = supplier;
    }

    if (status === "completed") {
      filter.fulfillmentStatus = "completed";
    } else if (status === "pending") {
      filter.$or = [
        { fulfillmentStatus: "pending" },
        { fulfillmentStatus: "processing" },
        { paymentStatus: "pending" },
      ];
    } else if (status === "failed") {
      filter.$or = [
        { fulfillmentStatus: "failed" },
        { paymentStatus: "failed" },
      ];
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { playerId: { $regex: search, $options: "i" } },
        { gameName: { $regex: search, $options: "i" } },
        { packageName: { $regex: search, $options: "i" } },
        { playerName: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Order.countDocuments(filter).catch(() => 0);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .catch(() => []);

    // Summary KPIs
    const [totalOrders, completedCount, pendingCount, failedCount, revenueAgg] =
      await Promise.all([
        Order.countDocuments().catch(() => 0),
        Order.countDocuments({ fulfillmentStatus: "completed" }).catch(() => 0),
        Order.countDocuments({
          $or: [
            { fulfillmentStatus: "pending" },
            { fulfillmentStatus: "processing" },
            { paymentStatus: "pending" },
          ],
        }).catch(() => 0),
        Order.countDocuments({
          $or: [{ fulfillmentStatus: "failed" }, { paymentStatus: "failed" }],
        }).catch(() => 0),
        Order.aggregate([
          { $match: { fulfillmentStatus: "completed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).catch(() => []),
      ]);

    const totalRevenue = revenueAgg[0]?.total || 0;

    return NextResponse.json({
      success: true,
      orders: orders.map((o) => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        gameSlug: o.gameSlug,
        gameName: o.gameName,
        packageName: o.packageName,
        supplier: o.supplier,
        supplierProductCode: o.supplierProductCode,
        playerId: o.playerId,
        serverId: o.serverId || null,
        playerName: o.playerName || null,
        amount: o.amount,
        buyingPrice: o.buyingPrice || 0,
        profit: o.profit || 0,
        currency: o.currency || "USD",
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        transactionId: o.transactionId || null,
        paidAt: o.paidAt || null,
        fulfilledAt: o.fulfilledAt || null,
        supplierOrderId: o.supplierOrderId || null,
        customerContact: o.customerContact || null,
        adminNotes: o.adminNotes || "",
        errorLog: o.errorLog || "",
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      kpi: {
        totalOrders,
        completedCount,
        pendingCount,
        failedCount,
        totalRevenue,
      },
    });
  } catch (error: unknown) {
    console.error("Admin GET orders error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load orders",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json();
    const { orderId, fulfillmentStatus, paymentStatus, adminNotes, supplierOrderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing orderId" },
        { status: 400 }
      );
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (fulfillmentStatus) updateFields.fulfillmentStatus = fulfillmentStatus;
    
    // Protect payment integrity: Do not allow arbitrary manual bypass to PAID without verification.
    // If setting to cancelled or failed, allow it; but changing to PAID must go through payment reconciliation.
    if (paymentStatus) {
      const pUpper = String(paymentStatus).toUpperCase();
      if (pUpper === "PAID") {
        return NextResponse.json(
          {
            success: false,
            error: "Payment verification bypass is not permitted. Please use 'Reconcile' to verify authentic settlement with AnajakPay.",
          },
          { status: 400 }
        );
      }
      updateFields.paymentStatus = paymentStatus;
    }

    if (adminNotes !== undefined) updateFields.adminNotes = String(adminNotes).trim();
    if (supplierOrderId !== undefined) updateFields.supplierOrderId = String(supplierOrderId).trim();

    const updated = await Order.findByIdAndUpdate(orderId, updateFields, {
      new: true,
    }).lean();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Order updated successfully",
      order: {
        id: String(updated._id),
        orderNumber: updated.orderNumber,
        fulfillmentStatus: updated.fulfillmentStatus,
        paymentStatus: updated.paymentStatus,
        adminNotes: updated.adminNotes,
      },
    });
  } catch (error: unknown) {
    console.error("Admin PATCH orders error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update order",
      },
      { status: 500 }
    );
  }
}
