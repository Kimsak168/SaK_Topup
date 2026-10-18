import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";
import { getAdminPagination, escapeSearchRegex } from "@/lib/adminQuery";

export const dynamic = "force-dynamic";
const COMPLETED = { fulfillmentStatus: { $in: ["completed", "COMPLETED", "delivered", "DELIVERED"] as const } };
const PENDING = { $or: [
  { fulfillmentStatus: { $in: ["NOT_STARTED", "pending", "processing", "PROCESSING"] as const } },
  { paymentStatus: { $in: ["pending", "PENDING"] as const } },
] };
const FAILED = { $or: [
  { fulfillmentStatus: { $in: ["failed", "FAILED"] as const } },
  { paymentStatus: { $in: ["failed", "FAILED"] as const } },
] };

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim().toLowerCase() || "all";
    const supplier = searchParams.get("supplier")?.trim().toLowerCase() || "all";
    const { page, limit } = getAdminPagination(searchParams);

    const filter: Record<string, unknown> = {};

    if (supplier !== "all") {
      filter.supplier = supplier;
    }

    const conditions: Record<string, unknown>[] = [];
    if (status === "completed") conditions.push(COMPLETED);
    else if (status === "pending") conditions.push(PENDING);
    else if (status === "failed") conditions.push(FAILED);

    if (search) {
      const literalSearch = escapeSearchRegex(search);
      conditions.push({ $or: [
        { orderNumber: { $regex: literalSearch, $options: "i" } },
        { playerId: { $regex: literalSearch, $options: "i" } },
        { gameName: { $regex: literalSearch, $options: "i" } },
        { packageName: { $regex: literalSearch, $options: "i" } },
        { playerName: { $regex: literalSearch, $options: "i" } },
      ] });
    }
    if (conditions.length) filter.$and = conditions;

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
        Order.countDocuments(COMPLETED).catch(() => 0),
        Order.countDocuments(PENDING).catch(() => 0),
        Order.countDocuments(FAILED).catch(() => 0),
        Order.aggregate([
          { $match: COMPLETED },
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
