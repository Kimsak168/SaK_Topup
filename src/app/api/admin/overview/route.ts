import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const PAID = ["paid", "PAID"];
const PENDING_FULFILLMENT = ["pending", "NOT_STARTED", "processing", "PROCESSING"];
const PENDING_PAYMENT = ["pending", "PENDING"];
const COMPLETED_FULFILLMENT = ["completed", "COMPLETED", "delivered", "DELIVERED"];
const FAILED_FULFILLMENT = ["failed", "FAILED"];
const FAILED_PAYMENT = ["failed", "FAILED"];

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response;
  const requestedDays = Number(req.nextUrl.searchParams.get("days") || 14);
  const days = [7, 14, 30, 90].includes(requestedDays) ? requestedDays : 14;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);

  try {
    await connectDB();

    const [gameStats, packageStats, [orderResults]] = await Promise.all([
      Game.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
          },
        },
      ]),
      GamePackage.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
          },
        },
      ]),
      Order.aggregate([
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  completedOrders: {
                    $sum: {
                      $cond: [{ $in: ["$fulfillmentStatus", COMPLETED_FULFILLMENT] }, 1, 0],
                    },
                  },
                  pendingOrders: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $in: ["$fulfillmentStatus", PENDING_FULFILLMENT] },
                            { $in: ["$paymentStatus", PENDING_PAYMENT] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  failedOrders: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $in: ["$fulfillmentStatus", FAILED_FULFILLMENT] },
                            { $in: ["$paymentStatus", FAILED_PAYMENT] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  totalRevenue: {
                    $sum: {
                      $cond: [{ $in: ["$paymentStatus", PAID] }, { $ifNull: ["$amount", 0] }, 0],
                    },
                  },
                  totalProfit: {
                    $sum: {
                      $cond: [{ $in: ["$paymentStatus", PAID] }, { $ifNull: ["$profit", 0] }, 0],
                    },
                  },
                },
              },
            ],
            recentOrders: [
              { $sort: { createdAt: -1 } },
              { $limit: 8 },
              {
                $project: {
                  _id: 1,
                  orderNumber: 1,
                  gameName: 1,
                  packageName: 1,
                  supplier: 1,
                  playerId: 1,
                  amount: 1,
                  profit: 1,
                  paymentStatus: 1,
                  fulfillmentStatus: 1,
                  createdAt: 1,
                },
              },
            ],
            dailyOrders: [
              { $match: { createdAt: { $gte: start } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  orders: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            dailyRevenue: [
              {
                $match: {
                  paymentStatus: { $in: PAID },
                  $or: [
                    { paidAt: { $gte: start } },
                    { paidAt: null, createdAt: { $gte: start } },
                  ],
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: { $ifNull: ["$paidAt", "$createdAt"] },
                    },
                  },
                  revenue: { $sum: "$amount" },
                },
              },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ]),
    ]);

    const orderStats = orderResults?.stats?.[0];
    const totalOrders = orderStats?.totalOrders ?? 0;
    const completedOrders = orderStats?.completedOrders ?? 0;
    const pendingOrders = orderStats?.pendingOrders ?? 0;
    const failedOrders = orderStats?.failedOrders ?? 0;
    const totalRevenue = orderStats?.totalRevenue ?? 0;
    const totalProfit = orderStats?.totalProfit ?? 0;

    const totalGames = gameStats?.[0]?.total ?? 0;
    const activeGames = gameStats?.[0]?.active ?? 0;
    const totalPackages = packageStats?.[0]?.total ?? 0;
    const activePackages = packageStats?.[0]?.active ?? 0;

    const recentOrders = orderResults?.recentOrders ?? [];
    const dailyOrders = orderResults?.dailyOrders ?? [];
    const dailyRevenue = orderResults?.dailyRevenue ?? [];

    const daily = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const entry of dailyOrders) {
      daily.set(entry._id, { date: entry._id, revenue: 0, orders: entry.orders });
    }
    for (const entry of dailyRevenue) {
      const existing = daily.get(entry._id);
      daily.set(entry._id, {
        date: entry._id,
        revenue: Number((entry.revenue ?? 0).toFixed(2)),
        orders: existing?.orders ?? 0,
      });
    }

    return NextResponse.json({
      success: true,
      dbConnected: true,
      days,
      stats: {
        totalRevenue,
        totalProfit,
        totalOrders,
        pendingOrders,
        completedOrders,
        failedOrders,
        activeGames,
        totalGames,
        activePackages,
        totalPackages,
      },
      recentOrders: recentOrders.map((order: Record<string, unknown>) => ({
        id: String(order._id),
        orderNumber: order.orderNumber,
        gameName: order.gameName,
        packageName: order.packageName,
        supplier: order.supplier,
        playerId: order.playerId,
        amount: order.amount,
        profit: order.profit,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
      })),
      salesChart: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      suppliers: {
        webbuilder: { configured: Boolean(process.env.WEBBUILDER_API_KEY) },
        g2bulk: { configured: Boolean(process.env.G2BULK_API_KEY) },
      },
    });
  } catch (error) {
    console.error("MongoDB overview query failed:", error);
    return NextResponse.json(
      { success: false, error: "Dashboard data is unavailable. Please retry." },
      { status: 503 }
    );
  }
}
