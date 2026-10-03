import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Order } from "@/models/Order";
import { testVizo } from "@/lib/suppliers/vizo";
import { testG2Bulk } from "@/lib/suppliers/g2bulk";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) {
    return auth.response;
  }

  const result = {
    success: true,
    dbConnected: false,
    stats: {
      totalRevenue: 0,
      totalProfit: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      failedOrders: 0,
      activeGames: 0,
      totalGames: 0,
      activePackages: 0,
      totalPackages: 0,
    },
    recentOrders: [] as unknown[],
    salesChart: [] as { date: string; revenue: number; orders: number }[],
    suppliers: {
      vizo: {
        connected: false,
        balance: 0,
        username: "",
        totalSpent: 0,
        totalOrders: 0,
        successOrders: 0,
        failedOrders: 0,
        error: null as string | null,
      },
      g2bulk: {
        connected: false,
        balance: 0,
        username: "",
        firstName: "",
        userId: 0,
        error: null as string | null,
      },
    },
  };

  // 1. Fetch real MongoDB Data
  try {
    await connectDB();
    result.dbConnected = true;

    // Games and Packages stats
    const [totalGames, activeGames, totalPackages, activePackages] =
      await Promise.all([
        Game.countDocuments().catch(() => 0),
        Game.countDocuments({ isActive: true }).catch(() => 0),
        GamePackage.countDocuments().catch(() => 0),
        GamePackage.countDocuments({ isActive: true }).catch(() => 0),
      ]);

    result.stats.totalGames = totalGames;
    result.stats.activeGames = activeGames;
    result.stats.totalPackages = totalPackages;
    result.stats.activePackages = activePackages;

    // Order stats
    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      failedOrders,
      revenueAggregation,
      recentOrdersDocs,
    ] = await Promise.all([
      Order.countDocuments().catch(() => 0),
      Order.countDocuments({
        $or: [{ fulfillmentStatus: "pending" }, { paymentStatus: "pending" }],
      }).catch(() => 0),
      Order.countDocuments({ fulfillmentStatus: "completed" }).catch(() => 0),
      Order.countDocuments({
        $or: [{ fulfillmentStatus: "failed" }, { paymentStatus: "failed" }],
      }).catch(() => 0),
      Order.aggregate([
        {
          $match: {
            $or: [
              { paymentStatus: "paid" },
              { fulfillmentStatus: "completed" },
            ],
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            totalProfit: { $sum: "$profit" },
          },
        },
      ]).catch(() => []),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
        .catch(() => []),
    ]);

    result.stats.totalOrders = totalOrders;
    result.stats.pendingOrders = pendingOrders;
    result.stats.completedOrders = completedOrders;
    result.stats.failedOrders = failedOrders;

    if (revenueAggregation && revenueAggregation.length > 0) {
      result.stats.totalRevenue = revenueAggregation[0].totalRevenue || 0;
      result.stats.totalProfit = revenueAggregation[0].totalProfit || 0;
    }

    result.recentOrders = recentOrdersDocs.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      gameName: o.gameName,
      packageName: o.packageName,
      supplier: o.supplier,
      playerId: o.playerId,
      amount: o.amount,
      profit: o.profit,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      createdAt: o.createdAt,
    }));

    // Real Sales Chart aggregation (Last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const dailyChartData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: fourteenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$amount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).catch(() => []);

    // Format for recharts
    result.salesChart = dailyChartData.map((d) => ({
      date: d._id,
      revenue: Number((d.revenue || 0).toFixed(2)),
      orders: d.orders || 0,
    }));
  } catch (dbErr) {
    console.error("MongoDB Overview query failed:", dbErr);
    result.dbConnected = false;
  }

  // 2. Fetch live Vizo Supplier Data
  try {
    const vizoData = await testVizo();
    if (vizoData) {
      result.suppliers.vizo = {
        connected: true,
        balance: Number(vizoData.balance || 0),
        username: vizoData.username || "",
        totalSpent: Number(vizoData.total_spent || 0),
        totalOrders: Number(vizoData.total_orders || 0),
        successOrders: Number(vizoData.success_orders || 0),
        failedOrders: Number(vizoData.failed_orders || 0),
        error: null,
      };
    }
  } catch (err: unknown) {
    result.suppliers.vizo.error =
      err instanceof Error ? err.message : "Vizo API unavailable";
  }

  // 3. Fetch live G2Bulk Supplier Data
  try {
    const g2Data = await testG2Bulk();
    if (g2Data && g2Data.success) {
      result.suppliers.g2bulk = {
        connected: true,
        balance: Number(g2Data.balance || 0),
        username: g2Data.username || "",
        firstName: g2Data.first_name || "",
        userId: Number(g2Data.user_id || 0),
        error: null,
      };
    }
  } catch (err: unknown) {
    result.suppliers.g2bulk.error =
      err instanceof Error ? err.message : "G2Bulk API unavailable";
  }

  return NextResponse.json(result);
}
