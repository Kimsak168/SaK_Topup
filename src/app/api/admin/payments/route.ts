import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";
import { queryAnajakPayTransactionStatus } from "@/lib/services/anajakPayService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const gateway = searchParams.get("gateway")?.trim() || "all";
    const status = searchParams.get("status")?.trim() || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "25", 10)));

    const filter: Record<string, unknown> = {};
    if (gateway !== "all") filter.gateway = gateway;
    if (status !== "all") filter.status = status;

    const total = await Payment.countDocuments(filter).catch(() => 0);
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .catch(() => []);

    // Summary stats
    const [totalSuccess, totalPending, totalFailed, successfulVolumeAgg] =
      await Promise.all([
        Payment.countDocuments({ status: "successful" }).catch(() => 0),
        Payment.countDocuments({ status: "pending" }).catch(() => 0),
        Payment.countDocuments({ status: "failed" }).catch(() => 0),
        Payment.aggregate([
          { $match: { status: "successful" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).catch(() => []),
      ]);

    const totalVolume = successfulVolumeAgg[0]?.total || 0;

    // Gateway configs (with masked secret keys)
    const anajakProfile = process.env.ANAJAKPAY_PROFILE_ID;
    const anajakSecret = process.env.ANAJAKPAY_SECRET_KEY;

    const gateways = [
      {
        id: "anajakpay",
        name: "AnajakPay (KHQR / Cambodian Banks)",
        status: anajakProfile && anajakSecret ? "active" : "unconfigured",
        profileId: anajakProfile ? `${anajakProfile.slice(0, 6)}...${anajakProfile.slice(-4)}` : "Not Configured",
        currency: "USD / KHR",
        type: "Instant KHQR Universal Pay",
      },
      {
        id: "aba",
        name: "ABA PAY Direct",
        status: "active",
        profileId: "Merchant Direct",
        currency: "USD / KHR",
        type: "ABA Mobile Deep-Link",
      },
      {
        id: "wing",
        name: "Wing Bank",
        status: "active",
        profileId: "Merchant Direct",
        currency: "USD / KHR",
        type: "WingPay App",
      },
      {
        id: "binance",
        name: "Binance Pay / Crypto",
        status: "active",
        profileId: "Direct Wallet",
        currency: "USDT",
        type: "Web3 / Crypto",
      },
    ];

    return NextResponse.json({
      success: true,
      payments: payments.map((p) => ({
        id: String(p._id),
        paymentId: p.paymentId,
        orderNumber: p.orderNumber,
        gateway: p.gateway,
        transactionId: p.transactionId || null,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        payerAccount: p.payerAccount || null,
        createdAt: p.createdAt,
      })),
      gateways,
      kpi: {
        totalSuccess,
        totalPending,
        totalFailed,
        totalVolume,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: unknown) {
    console.error("Admin payments error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load payments",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const body = await req.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    // Lookup transaction in DB and AnajakPay gateway
    const payment = await Payment.findOne({
      $or: [{ transactionId }, { paymentId: transactionId }],
    }).lean();

    const relatedOrder = await Order.findOne({
      $or: [{ transactionId }, { orderNumber: transactionId }],
    }).lean();

    const gatewayCheck = await queryAnajakPayTransactionStatus(transactionId);

    return NextResponse.json({
      success: true,
      message: payment
        ? `Transaction found in database. Gateway status: ${gatewayCheck.status || "Audited"}`
        : `Transaction not in local database. Gateway check: ${gatewayCheck.status || "Not found"}`,
      record: payment || null,
      relatedOrder: relatedOrder
        ? {
            orderNumber: relatedOrder.orderNumber,
            paymentStatus: relatedOrder.paymentStatus,
            fulfillmentStatus: relatedOrder.fulfillmentStatus,
            amount: relatedOrder.amount,
          }
        : null,
      gatewayAudit: gatewayCheck,
      queriedId: transactionId,
    });
  } catch (error: unknown) {
    console.error("Admin payment verify error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Verification inquiry failed",
      },
      { status: 500 }
    );
  }
}
