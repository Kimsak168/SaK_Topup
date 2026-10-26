import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Payment, type IPayment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";
import { queryAnajakPayTransactionStatus, checkAnajakPayHealth } from "@/lib/services/anajakPayService";
import { checkVngZz2Health, checkVngZz2Transaction, isVngZz2Configured } from "@/lib/services/vngzzPayWayService";
import { getAdminPagination } from "@/lib/adminQuery";

export const dynamic = "force-dynamic";
const SUCCESS_STATUSES: IPayment["status"][] = ["successful", "SUCCESSFUL", "paid", "PAID"];
const PENDING_STATUSES: IPayment["status"][] = ["pending", "PENDING"];
const FAILED_STATUSES: IPayment["status"][] = ["failed", "FAILED"];

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const gateway = searchParams.get("gateway")?.trim() || "all";
    const status = searchParams.get("status")?.trim() || "all";
    const { page, limit } = getAdminPagination(searchParams);

    const filter: Record<string, unknown> = {};
    if (gateway !== "all") filter.gateway = gateway;
    if (status !== "all") {
      const normalized = status.toLowerCase();
      filter.status = { $in: normalized === "successful" || normalized === "paid" ? SUCCESS_STATUSES
        : [normalized, normalized.toUpperCase()] };
    }

    const total = await Payment.countDocuments(filter).catch(() => 0);
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .catch(() => []);

    // Summary stats
    const [totalSuccess, totalPending, totalFailed, successfulVolumeAgg, health, vngHealth] =
      await Promise.all([
        Payment.countDocuments({ status: { $in: SUCCESS_STATUSES } }).catch(() => 0),
        Payment.countDocuments({ status: { $in: PENDING_STATUSES } }).catch(() => 0),
        Payment.countDocuments({ status: { $in: FAILED_STATUSES } }).catch(() => 0),
        Payment.aggregate([
          { $match: { status: { $in: SUCCESS_STATUSES } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).catch(() => []),
        checkAnajakPayHealth().catch(() => ({ available: false, message: "Health check error" })),
        checkVngZz2Health().catch(() => ({ available: false, message: "Health check error" })),
      ]);

    const totalVolume = successfulVolumeAgg[0]?.total || 0;

    // Gateway configs (with masked secret keys)
    const anajakProfile = process.env.ANAJAKPAY_PROFILE_ID;
    const anajakSecret = process.env.ANAJAKPAY_SECRET_KEY;

    const vngKey = process.env.VNGZZ2_PAYMENT_API_KEY?.trim();
    const vngSlot = process.env.VNGZZ2_PAYMENT_SLOT || "USD";
    const vngConfigured = isVngZz2Configured();

    const gateways = [
      {
        id: "anajakpay",
        name: "AnajakPay (KHQR / Cambodian Banks)",
        status: anajakProfile && anajakSecret ? (health.available ? "active" : "maintenance") : "unconfigured",
        profileId: anajakProfile ? `${anajakProfile.slice(0, 6)}...${anajakProfile.slice(-4)}` : "Not Configured",
        currency: "USD / KHR",
        type: health.available ? "Instant KHQR Universal Pay" : "KHQRcc Rail Temporarily Down",
      },
      {
        id: "aba_payway_v2",
        name: "ABA PayWay V2 (VngZz2)",
        status: vngConfigured ? (vngHealth.available ? "active" : "maintenance") : "unconfigured",
        profileId: vngKey ? `Slot: ${vngSlot} (${vngKey.slice(0, 4)}...${vngKey.slice(-3)})` : "Not Configured",
        currency: "USD / KHR",
        type: vngHealth.available ? "Direct PayWay KHQR & Deep-Link" : (vngConfigured ? "Gateway Offline" : "Awaiting API Key"),
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
        status: SUCCESS_STATUSES.includes(p.status) ? "successful" : p.status.toLowerCase(),
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

    // Determine whether this transaction is VngZz2 / ABA PayWay V2 or AnajakPay
    const isVngZz2 = payment?.gateway === "aba_payway_v2" || payment?.gateway === "vngzz2" || relatedOrder?.paymentMethod === "aba_payway_v2";

    let gatewayCheck: Record<string, unknown>;
    if (isVngZz2) {
      try {
        const vngRes = await checkVngZz2Transaction(transactionId);
        gatewayCheck = {
          provider: "aba_payway_v2",
          status: vngRes.state,
          isPaid: vngRes.isPaid,
          amount: vngRes.amount,
          paywayTransactionId: vngRes.paywayTransactionId,
          receiptUrl: vngRes.receiptUrl,
        };
      } catch (err) {
        gatewayCheck = {
          provider: "aba_payway_v2",
          status: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    } else {
      gatewayCheck = await queryAnajakPayTransactionStatus(transactionId);
    }

    return NextResponse.json({
      success: true,
      message: payment
        ? `Transaction found in database (${payment.gateway}). Gateway status: ${gatewayCheck.status || "Audited"}`
        : `Transaction not in local database. Gateway check: ${gatewayCheck.status || "Not found"}`,
      record: payment || null,
      relatedOrder: relatedOrder
        ? {
            orderNumber: relatedOrder.orderNumber,
            paymentStatus: relatedOrder.paymentStatus,
            fulfillmentStatus: relatedOrder.fulfillmentStatus,
            amount: relatedOrder.amount,
            paymentMethod: relatedOrder.paymentMethod,
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
