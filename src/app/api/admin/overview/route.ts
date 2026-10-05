import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { GamePackage } from "@/models/GamePackage";
import { Order } from "@/models/Order";
import { requireAdminAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const PAID = ["paid", "PAID"];

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
    const [totalGames, activeGames, totalPackages, activePackages, totalOrders,
      pendingOrders, completedOrders, failedOrders, revenue, recentOrders, dailyOrders, dailyRevenue] = await Promise.all([
      Game.countDocuments(),
      Game.countDocuments({ isActive: true }),
      GamePackage.countDocuments(),
      GamePackage.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Order.countDocuments({ $or: [
        { fulfillmentStatus: { $in: ["pending", "NOT_STARTED", "processing", "PROCESSING"] } },
        { paymentStatus: { $in: ["pending", "PENDING"] } },
      ] }),
      Order.countDocuments({ fulfillmentStatus: { $in: ["completed", "COMPLETED", "delivered", "DELIVERED"] } }),
      Order.countDocuments({ $or: [
        { fulfillmentStatus: { $in: ["failed", "FAILED"] } },
        { paymentStatus: { $in: ["failed", "FAILED"] } },
      ] }),
      Order.aggregate([
        { $match: { paymentStatus: { $in: PAID } } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" }, totalProfit: { $sum: "$profit" } } },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(8).lean(),
      Order.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: { $in: PAID } } },
        { $addFields: { saleDate: { $ifNull: ["$paidAt", "$createdAt"] } } },
        { $match: { saleDate: { $gte: start } } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
          revenue: { $sum: "$amount" },
        } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const daily = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const entry of dailyOrders)
      daily.set(entry._id, { date: entry._id, revenue: 0, orders: entry.orders });
    for (const entry of dailyRevenue) {
      const existing = daily.get(entry._id);
      daily.set(entry._id, {
        date: entry._id, revenue: Number((entry.revenue ?? 0).toFixed(2)),
        orders: existing?.orders ?? 0,
      });
    }
    return NextResponse.json({
      success: true, dbConnected: true, days,
      stats: {
        totalRevenue: revenue[0]?.totalRevenue ?? 0,
        totalProfit: revenue[0]?.totalProfit ?? 0,
        totalOrders, pendingOrders, completedOrders, failedOrders,
        activeGames, totalGames, activePackages, totalPackages,
      },
      recentOrders: recentOrders.map((order) => ({
        id: String(order._id), orderNumber: order.orderNumber,
        gameName: order.gameName, packageName: order.packageName,
        supplier: order.supplier, playerId: order.playerId,
        amount: order.amount, profit: order.profit,
        paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
      })),
      salesChart: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      suppliers: {
        vizo: { configured: Boolean(process.env.VIZO_API_KEY) },
        g2bulk: { configured: Boolean(process.env.G2BULK_API_KEY) },
      },
    });
  } catch (error) {
    console.error("MongoDB overview query failed:", error);
    return NextResponse.json({ success: false, error: "Dashboard data is unavailable. Please retry." }, { status: 503 });
  }
}
