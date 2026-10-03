"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DollarSign,
  ShoppingCart,
  Gamepad2,
  Package,
  TrendingUp,
  RefreshCw,
  Server,
  ArrowRight,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface OverviewData {
  success: boolean;
  dbConnected: boolean;
  stats: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    failedOrders: number;
    activeGames: number;
    totalGames: number;
    activePackages: number;
    totalPackages: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    gameName: string;
    packageName: string;
    supplier: string;
    playerId: string;
    amount: number;
    profit: number;
    paymentStatus: string;
    fulfillmentStatus: string;
    createdAt: string;
  }>;
  salesChart: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  suppliers: {
    vizo: {
      connected: boolean;
      balance: number;
      username: string;
      totalSpent: number;
      totalOrders: number;
      successOrders: number;
      failedOrders: number;
      error: string | null;
    };
    g2bulk: {
      connected: boolean;
      balance: number;
      username: string;
      firstName: string;
      userId: number;
      error: string | null;
    };
  };
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: OverviewData = await res.json();
      setData(json);
      if (isRefresh) {
        toast.success("Dashboard statistics updated");
      }
    } catch (err) {
      console.error("Failed to load admin overview:", err);
      toast.error("Failed to fetch dashboard statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-pink-500" />
        <p className="text-xs text-slate-400 font-semibold tracking-wide">
          Connecting to MongoDB & Supplier APIs...
        </p>
      </div>
    );
  }

  const stats = data?.stats || {
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
  };

  const vizo = data?.suppliers?.vizo;
  const g2bulk = data?.suppliers?.g2bulk;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner & Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">HQ Overview</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Zap className="h-3 w-3" /> Live
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time MongoDB Atlas telemetry, sales performance, and wholesale supplier connections.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchOverview(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Refresh Stats"}</span>
          </button>

          <Link
            href="/admin/games"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-[0_0_20px_rgba(255,46,147,0.3)] transition-all"
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            <span>Manage Games</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Revenue */}
        <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-pink-500/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Revenue
            </span>
            <div className="h-9 w-9 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              ${stats.totalRevenue.toFixed(2)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-emerald-400 font-bold">
                ${stats.totalProfit.toFixed(2)}
              </span>
              <span>net gross profit</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Orders */}
        <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-purple-500/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Orders
            </span>
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {stats.totalOrders}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-emerald-400 font-semibold">
                {stats.completedOrders} done
              </span>
              <span className="text-amber-400 font-semibold">
                {stats.pendingOrders} pending
              </span>
              {stats.failedOrders > 0 && (
                <span className="text-rose-400 font-semibold">
                  {stats.failedOrders} failed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Active Games */}
        <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-indigo-500/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Games
            </span>
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Gamepad2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {stats.activeGames}
              <span className="text-sm font-normal text-slate-400 ml-1.5">
                / {stats.totalGames}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Synchronized & live in storefront
            </div>
          </div>
        </div>

        {/* Card 4: Packages */}
        <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-cyan-500/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Packages
            </span>
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {stats.activePackages}
              <span className="text-sm font-normal text-slate-400 ml-1.5">
                / {stats.totalPackages}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Top-up denominations configured
            </div>
          </div>
        </div>
      </div>

      {/* Live Supplier Integrations Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Server className="h-4 w-4 text-pink-400" />
            <span>Wholesale Supplier Telemetry</span>
          </h2>
          <Link
            href="/admin/suppliers"
            className="text-xs text-pink-400 hover:text-pink-300 font-semibold flex items-center gap-1"
          >
            <span>Supplier Details</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vizo Live Telemetry */}
          <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base text-white">Vizo API</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      vizo?.connected
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        vizo?.connected ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    {vizo?.connected ? "Connected" : "Offline"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Exclusive provider for Free Fire Global
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Wallet Balance
                </span>
                <div className="text-xl font-black text-emerald-400">
                  ${(vizo?.balance || 0).toFixed(4)}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[10px]">Reseller:</span>
                <p className="font-mono text-white truncate font-bold">
                  {vizo?.username || "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Supplier Orders:</span>
                <p className="font-bold text-white">
                  {vizo?.totalOrders || 0} ({vizo?.successOrders || 0} ok)
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Lifetime Spent:</span>
                <p className="font-bold text-purple-400">
                  ${(vizo?.totalSpent || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* G2Bulk Live Telemetry */}
          <div className="rounded-2xl p-5 border border-white/10 bg-[#0c0e24] relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base text-white">G2Bulk API</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      g2bulk?.connected
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        g2bulk?.connected ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    {g2bulk?.connected ? "Connected" : "Offline"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct provider for PUBG Mobile, MLBB & Valorant
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Wallet Balance
                </span>
                <div className="text-xl font-black text-emerald-400">
                  ${(g2bulk?.balance || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[10px]">Reseller Account:</span>
                <p className="font-mono text-white truncate font-bold">
                  {g2bulk?.username || "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Account Name:</span>
                <p className="font-bold text-white truncate">
                  {g2bulk?.firstName || "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">User ID:</span>
                <p className="font-mono text-purple-400 font-bold">
                  {g2bulk?.userId || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Chart Section */}
      <div className="rounded-2xl p-6 border border-white/10 bg-[#0c0e24]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-pink-400" />
              <span>Sales & Order Activity</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live transactional aggregation strictly from MongoDB records.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full bg-pink-500" />
              <span>Revenue ($)</span>
            </span>
          </div>
        </div>

        {data?.salesChart && data.salesChart.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesChart}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff2e93" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ff2e93" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090b1c",
                    borderColor: "#ffffff20",
                    borderRadius: "0.75rem",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ff2e93"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56 flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.01] text-center p-6">
            <ShoppingCart className="h-10 w-10 text-slate-600 mb-2" />
            <p className="text-sm font-bold text-slate-300">
              No orders recorded in MongoDB yet
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              As customers initiate and complete top-ups through the storefront, daily sales and volume graphs will plot here automatically.
            </p>
          </div>
        )}
      </div>

      {/* Recent Orders Section */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e24] overflow-hidden">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-white">Recent Customer Orders</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest incoming top-up requests from the MongoDB order log.
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs text-pink-400 hover:text-pink-300 font-bold flex items-center gap-1"
          >
            <span>View All Orders</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {data?.recentOrders && data.recentOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#090b1c] text-slate-400 uppercase text-[10px] font-bold border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Game & Package</th>
                  <th className="py-3 px-4">Player ID</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-pink-400">
                      {order.orderNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{order.gameName}</div>
                      <div className="text-slate-400 text-[11px] truncate max-w-xs">
                        {order.packageName}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {order.playerId}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">
                      ${order.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 uppercase text-[10px] font-bold text-slate-400">
                      {order.supplier}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          order.fulfillmentStatus === "completed"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : order.fulfillmentStatus === "failed"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {order.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            <p className="text-xs">No customer orders recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
