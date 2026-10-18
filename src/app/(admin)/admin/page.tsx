"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity, ArrowRight, CircleAlert, DollarSign, Gamepad2, Package,
  RefreshCw, ShoppingCart, TrendingUp
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface OverviewData {
  success: boolean;
  dbConnected: boolean;
  stats: {
    totalRevenue: number; totalProfit: number; totalOrders: number;
    pendingOrders: number; completedOrders: number; failedOrders: number;
    activeGames: number; totalGames: number; activePackages: number; totalPackages: number;
  };
  recentOrders: Array<{
    id: string; orderNumber: string; gameName: string; packageName: string;
    playerId: string; amount: number; supplier: string; paymentStatus: string;
    fulfillmentStatus: string; createdAt: string;
  }>;
  salesChart: Array<{ date: string; revenue: number; orders: number }>;
  suppliers: {
    vizo: { configured: boolean };
    g2bulk: { configured: boolean };
    webbuilder?: { configured: boolean };
  };
}

interface SupplierCheck {
  timestamp: string;
  vizo: {
    status: string; apiKeyConfigured: boolean; error: string | null;
    reseller: { balance?: number | string; username?: string; total_orders?: number } | null;
  };
  g2bulk: {
    status: string; apiKeyConfigured: boolean; error: string | null;
    reseller: { balance?: number | string; username?: string; first_name?: string } | null;
  };
  webbuilder?: {
    status: string; apiKeyConfigured: boolean; error: string | null;
    reseller: { balance?: number | string; username?: string } | null;
  };
}

const money = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(amount);
const compact = (value: number) => new Intl.NumberFormat("en-US").format(value);

function getStatusBadge(status: string) {
  const norm = (status || "").toUpperCase();
  if (norm === "PAID" || norm === "COMPLETED" || norm === "SUCCESS" || norm === "CONNECTED") {
    return (
      <span className="admin-status admin-status-connected">
        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        {status.toLowerCase()}
      </span>
    );
  }
  if (norm === "PENDING" || norm === "PROCESSING" || norm === "CONFIGURED") {
    return (
      <span className="admin-status admin-status-pending">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
        {status.toLowerCase()}
      </span>
    );
  }
  return (
    <span className="admin-status admin-status-failed">
      <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
      {status.toLowerCase() || "Failed"}
    </span>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [days, setDays] = useState(14);
  const [supplierCheck, setSupplierCheck] = useState<SupplierCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const lastRequestedDays = useRef<number | null>(null);
  const activeRequest = useRef(0);

  const fetchOverview = useCallback(async (manual = false) => {
    const requestId = ++activeRequest.current;
    if (manual) setRefreshing(true);
    else setRangeLoading(true);
    try {
      const response = await fetch(`/api/admin/overview?days=${days}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || `HTTP ${response.status}`);
      if (requestId !== activeRequest.current) return;
      setData(body);
      setError("");
      if (manual) toast.success("Dashboard statistics updated");
    } catch (cause) {
      if (requestId !== activeRequest.current) return;
      console.error("Failed to load admin overview:", cause);
      setError(cause instanceof Error ? cause.message : "Dashboard data is unavailable");
      if (manual) toast.error("Could not refresh dashboard statistics");
    } finally {
      if (requestId === activeRequest.current) {
        setLoading(false);
        setRefreshing(false);
        setRangeLoading(false);
      }
    }
  }, [days]);

  useEffect(() => {
    if (lastRequestedDays.current === days) return;
    lastRequestedDays.current = days;
    void fetchOverview();
  }, [days, fetchOverview]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("saksuuu_supplier_check");
      if (saved) {
        const check = JSON.parse(saved) as SupplierCheck;
        const checkedAt = Date.parse(check.timestamp);
        if (Number.isFinite(checkedAt) && Date.now() - checkedAt <= 10 * 60_000) setSupplierCheck(check);
      }
    } catch (cause) {
      console.error("Could not restore supplier verification:", cause);
    }
  }, []);

  const verifySuppliers = async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/admin/suppliers", { method: "POST", cache: "no-store" });
      const body: SupplierCheck & { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setSupplierCheck(body);
      sessionStorage.setItem("saksuuu_supplier_check", JSON.stringify(body));
      window.dispatchEvent(new Event("saksuuu:supplier-status"));
      toast.success("Supplier verification completed");
    } catch (cause) {
      console.error("Supplier verification failed:", cause);
      toast.error("Could not verify supplier connections");
    } finally {
      setChecking(false);
    }
  };

  const statCards = data ? [
    {
      label: "Total revenue",
      value: money(data.stats.totalRevenue),
      note: `${money(data.stats.totalProfit)} recorded profit`,
      icon: DollarSign,
    },
    {
      label: "Total orders",
      value: compact(data.stats.totalOrders),
      note: `${compact(data.stats.completedOrders)} completed · ${compact(data.stats.pendingOrders)} pending`,
      icon: ShoppingCart,
    },
    {
      label: "Active games",
      value: compact(data.stats.activeGames),
      note: `${compact(data.stats.totalGames)} in catalogue`,
      icon: Gamepad2,
    },
    {
      label: "Active packages",
      value: compact(data.stats.activePackages),
      note: `${compact(data.stats.totalPackages)} configured`,
      icon: Package,
    },
  ] : [];

  return (
    <div className="admin-page">
      {/* 5. PAGE HEADER */}
      <div className="admin-page-heading">
        <div>
          <h1>
            Dashboard Overview
          </h1>
          <p className="admin-page-description">
            Store performance and recent activity
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
          <div
            className={`inline-flex items-center gap-2 text-[12px] leading-5 font-medium ${
              error
                ? "text-[#EF4444]"
                : data
                ? "text-[#94A3B8]"
                : "text-[#94A3B8]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                error
                  ? "bg-[#EF4444]"
                  : data
                  ? "bg-[#22C55E]"
                  : "bg-[#64748B]"
              }`}
            />
            <span>{error ? "Data Unavailable" : data ? "MongoDB Connected" : "Checking..."}</span>
          </div>

          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            className="admin-button admin-button-secondary cursor-pointer"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 text-xs text-[#EF4444]"
        >
          <div className="flex items-center gap-2">
            <CircleAlert size={16} className="shrink-0" />
            <span>{error}{data ? " Showing the last loaded figures." : ""}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="px-2.5 py-1 rounded-md bg-[#EF4444] text-white font-semibold hover:bg-[#DC2626] transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* 6. STAT CARDS */}
      {loading && !data ? (
          <div className="admin-stats-grid" aria-label="Loading statistics">
          {[1, 2, 3, 4].map((item) => (
              <div key={item} className="admin-skeleton min-h-28 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="admin-stats-grid">
            {statCards.map(({ label, value, note, icon: Icon }) => (
              <div
                key={label}
                className="admin-stat"
              >
                <div className="admin-stat-top">
                  <span>
                    {label}
                  </span>
                  <div className="admin-stat-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.75} />
                  </div>
                </div>
                <div>
                  <div className="admin-metric">
                    {value}
                  </div>
                  <div className="mt-1 text-[11px] leading-[18px] text-[#94A3B8]">
                    {note}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 8. SUPPLIER SECTION */}
          <section className="admin-panel admin-panel-stack">
            <div className="admin-section-heading">
              <div>
                <h2>Supplier Connections</h2>
                <p className="admin-page-description">Fulfillment providers and account status</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={verifySuppliers}
                  disabled={checking}
                  className="admin-button admin-button-secondary cursor-pointer"
                >
                  <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
                  <span>{checking ? "Verifying..." : "Verify Connections"}</span>
                </button>
                <Link
                  href="/admin/suppliers"
                  className="admin-button admin-button-secondary"
                >
                  <span>Details</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {(["webbuilder", "g2bulk", "vizo"] as const).map((key) => {
                const configured = data.suppliers[key]?.configured ?? false;
                const verified = supplierCheck?.[key];
                const status = !configured ? "Unavailable" : !verified ? "Configured" :
                  verified.status === "connected" ? "Connected" : "Failed";
                const balance = verified?.status === "connected" && verified.reseller?.balance != null
                  ? money(Number(verified.reseller.balance)) : "—";
                return (
                  <div
                    key={key}
                    className="min-w-0 rounded-[10px] bg-[#151F31] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[#F8FAFC]">
                          {key === "webbuilder" ? "WebBuilder" : key === "vizo" ? "Vizo" : "G2Bulk"}
                        </h3>
                        <p className="text-[11px] text-[#94A3B8]">
                          {key === "webbuilder" ? "Free Fire, MLBB & HoK" : key === "vizo" ? "Free Fire (Disabled)" : "Game top-up supplier"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="sr-only">Status:</span>
                        {getStatusBadge(status)}
                      </div>
                    </div>

                    <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 min-[430px]:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="text-[11px] leading-4 text-[#94A3B8]">Wallet Balance</dt>
                        <dd className="mt-1 text-[15px] leading-5 font-semibold tabular-nums text-[#F8FAFC]">{balance}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] leading-4 text-[#94A3B8]">Account</dt>
                        <dd className="mt-1 break-words text-[13px] leading-5 text-[#F8FAFC]">
                          {verified?.status === "connected" ? verified.reseller?.username || "Active" : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] leading-4 text-[#94A3B8]">Last Verified</dt>
                        <dd className="mt-1 text-[12px] leading-5 text-[#F8FAFC]">
                          {supplierCheck && verified ? new Date(supplierCheck.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not checked"}
                        </dd>
                      </div>
                    </dl>

                    {verified?.error && (
                      <p className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 p-2 rounded-lg border border-[#EF4444]/20">
                        {verified.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 9. PERFORMANCE / SALES SECTION */}
          <section className="admin-panel admin-panel-stack">
            <div className="admin-section-heading">
              <div>
                <h2>Sales & Order Activity</h2>
                <p className="admin-page-description">Paid revenue and order volume</p>
              </div>

              <div className="inline-flex items-center rounded-lg border border-[#243047] bg-[#151F31] p-0.5">
                {[7, 14, 30, 90].map((range) => (
                  <button
                    key={range}
                    type="button"
                    aria-pressed={days === range}
                    onClick={() => setDays(range)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      days === range
                        ? "bg-[rgba(34,197,94,0.15)] text-[#22C55E] underline underline-offset-2"
                        : "text-[#94A3B8] hover:text-[#F8FAFC]"
                    }`}
                  >
                    <span>{range}d</span>
                  </button>
                ))}
              </div>
            </div>

            {rangeLoading ? (
              <div className="h-[280px] rounded-xl bg-[#151F31] animate-pulse" aria-label="Updating chart" />
            ) : data.salesChart.length && data.salesChart.some((d) => d.revenue > 0 || d.orders > 0) ? (
              <div className="h-[280px] w-full min-w-0" role="img" aria-label="Daily paid revenue chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesChart} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminRevenueGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#22C55E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#243047" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val: string) => val.slice(5)}
                      stroke="#64748B"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="revenue"
                      stroke="#64748B"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={48}
                      tickFormatter={(val: number) => `$${val}`}
                    />
                    <YAxis
                      yAxisId="orders"
                      orientation="right"
                      stroke="#64748B"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={28}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#151F31",
                        borderColor: "#243047",
                        borderRadius: "8px",
                        color: "#F8FAFC",
                        fontSize: "12px",
                      }}
                      formatter={(val, name) => [
                        name === "revenue" ? money(Number(val)) : val,
                        name === "revenue" ? "Paid Revenue" : "Orders",
                      ]}
                    />
                    <Area
                      name="revenue"
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#22C55E"
                      strokeWidth={2}
                      fill="url(#adminRevenueGreen)"
                    />
                    <Line
                      name="orders"
                      yAxisId="orders"
                      type="monotone"
                      dataKey="orders"
                      stroke="#94A3B8"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-[#94A3B8]">
                <Activity size={28} className="text-[#64748B] mb-2" />
                <strong className="text-sm font-semibold text-[#F8FAFC]">No sales activity in this range</strong>
                <p className="text-xs text-[#64748B] mt-0.5">Orders will display here once recorded.</p>
              </div>
            )}

            {!rangeLoading && (
              <div className="admin-chart-legend">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                  <span>Paid Revenue</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#94A3B8]" />
                  <span>Orders</span>
                </span>
                <span className="w-full text-[#64748B] sm:ml-auto sm:w-auto">
                  {days} days · {data.salesChart.reduce((sum, d) => sum + d.orders, 0)} total orders
                </span>
              </div>
            )}
          </section>

          {/* 10. RECENT ORDERS */}
          <section className="admin-panel admin-panel-stack">
            <div className="admin-section-heading">
              <div>
                <h2>Recent Orders</h2>
                <p className="admin-page-description">Latest customer transactions</p>
              </div>
              <Link
                href="/admin/orders"
                className="admin-button admin-button-secondary"
              >
                <span>All Orders</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {data.recentOrders.length ? (
              <div className="admin-table-scroll rounded-lg">
                <table className="admin-table text-left">
                  <thead>
                    <tr>
                      <th className="py-2 px-3">Order</th>
                      <th className="py-2 px-3">Game</th>
                      <th className="py-2 px-3">Amount</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#243047]">
                    {data.recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#151F31]/50 transition-colors">
                        <td className="py-2 px-3 text-[#F8FAFC] font-medium whitespace-nowrap">
                          {order.orderNumber}
                        </td>
                        <td className="py-2 px-3">
                          <strong className="block text-[#F8FAFC]">{order.gameName}</strong>
                          <span className="text-[11px] text-[#64748B]">{order.packageName}</span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#F8FAFC]">
                          {money(order.amount)}
                        </td>
                        <td className="py-2 px-3">
                          {getStatusBadge(order.paymentStatus)}
                        </td>
                        <td className="py-2 px-3 text-[#64748B]">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-[#94A3B8]">
                <ShoppingCart size={24} className="text-[#64748B] mb-2" />
                <strong className="text-sm font-semibold text-[#F8FAFC]">No orders recorded yet</strong>
                <p className="text-xs text-[#64748B] mt-0.5">Customer purchases will show up here.</p>
              </div>
            )}
          </section>
        </>
      ) : null}

      <div className="admin-helper flex items-start gap-2">
        <TrendingUp size={13} className="mt-0.5 shrink-0" />
        <span>Live store figures. Supplier balances update when you verify connections.</span>
      </div>
    </div>
  );
}
