"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity, ArrowRight, CircleAlert, DollarSign, Gamepad2, Package,
  RefreshCw, Server, ShoppingCart, TrendingUp, CheckCircle2, Clock, AlertTriangle
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
  suppliers: { vizo: { configured: boolean }; g2bulk: { configured: boolean } };
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
}

const money = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(amount);
const compact = (value: number) => new Intl.NumberFormat("en-US").format(value);

function getStatusBadge(status: string) {
  const norm = (status || "").toUpperCase();
  if (norm === "PAID" || norm === "COMPLETED" || norm === "SUCCESS" || norm === "CONNECTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(34,197,94,0.10)] text-[#22C55E] border border-[rgba(34,197,94,0.28)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        {status}
      </span>
    );
  }
  if (norm === "PENDING" || norm === "PROCESSING" || norm === "CONFIGURED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30">
      <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
      {status || "Failed"}
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
      label: "TOTAL REVENUE",
      value: money(data.stats.totalRevenue),
      note: `${money(data.stats.totalProfit)} recorded profit`,
      icon: DollarSign,
    },
    {
      label: "TOTAL ORDERS",
      value: compact(data.stats.totalOrders),
      note: `${compact(data.stats.completedOrders)} completed · ${compact(data.stats.pendingOrders)} pending`,
      icon: ShoppingCart,
    },
    {
      label: "ACTIVE GAMES",
      value: compact(data.stats.activeGames),
      note: `${compact(data.stats.totalGames)} in catalogue`,
      icon: Gamepad2,
    },
    {
      label: "ACTIVE PACKAGES",
      value: compact(data.stats.activePackages),
      note: `${compact(data.stats.totalPackages)} configured`,
      icon: Package,
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* 5. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F8FAFC]">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
            Store performance and recent activity
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              error
                ? "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30"
                : data
                ? "bg-[rgba(34,197,94,0.10)] text-[#22C55E] border-[rgba(34,197,94,0.28)]"
                : "bg-[#151F31] text-[#94A3B8] border-[#243047]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                error
                  ? "bg-[#EF4444]"
                  : data
                  ? "bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : "bg-[#64748B]"
              }`}
            />
            <span>{error ? "Data Unavailable" : data ? "MongoDB Connected" : "Checking..."}</span>
          </div>

          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
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

      {/* 6. STAT CARDS & 7. STAT GRID RESPONSIVE */}
      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Loading statistics">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 rounded-xl bg-[#111A2B] border border-[#243047] animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, note, icon: Icon }) => (
              <div
                key={label}
                className="flex flex-col justify-between h-28 p-4 rounded-xl bg-[#111A2B] border border-[#243047] hover:border-[rgba(34,197,94,0.3)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    {label}
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-[rgba(34,197,94,0.10)] border border-[rgba(34,197,94,0.25)] flex items-center justify-center text-[#22C55E]">
                    <Icon size={15} strokeWidth={2} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-[#F8FAFC]">
                    {value}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate mt-0.5">
                    {note}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 8. SUPPLIER SECTION */}
          <section className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#243047]">
              <div>
                <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Supplier Connections</h2>
                <p className="text-xs text-[#94A3B8]">Direct API integrations for automated fulfillment</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={verifySuppliers}
                  disabled={checking}
                  className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
                  <span>{checking ? "Verifying..." : "Verify Connections"}</span>
                </button>
                <Link
                  href="/admin/suppliers"
                  className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-[#243047] bg-[#151F31] hover:bg-[#111A2B] text-xs font-medium text-[#22C55E] transition-colors"
                >
                  <span>Details</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(["vizo", "g2bulk"] as const).map((key) => {
                const configured = data.suppliers[key].configured;
                const verified = supplierCheck?.[key];
                const status = !configured ? "Unavailable" : !verified ? "Configured" :
                  verified.status === "connected" ? "Connected" : "Failed";
                const balance = verified?.status === "connected" && verified.reseller?.balance != null
                  ? money(Number(verified.reseller.balance)) : "—";
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-[#243047] bg-[#151F31] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#111A2B] border border-[#243047] flex items-center justify-center text-[#22C55E]">
                          <Server size={16} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#F8FAFC]">
                            {key === "vizo" ? "Vizo" : "G2Bulk"}
                          </h3>
                          <p className="text-[11px] text-[#94A3B8]">
                            {key === "vizo" ? "Free Fire supplier" : "Game top-up supplier"}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(status)}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#243047]/60 text-xs">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Wallet Balance</div>
                        <div className="text-sm font-bold text-[#F8FAFC] mt-0.5">{balance}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Account</div>
                        <div className="text-xs text-[#94A3B8] truncate mt-0.5">
                          {verified?.status === "connected" ? verified.reseller?.username || "Active" : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Last Verified</div>
                        <div className="text-[11px] text-[#94A3B8] truncate mt-0.5">
                          {supplierCheck && verified ? new Date(supplierCheck.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not checked"}
                        </div>
                      </div>
                    </div>

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
          <section className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#243047]">
              <div>
                <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Sales & Order Activity</h2>
                <p className="text-xs text-[#94A3B8]">Paid revenue and order volume recorded in MongoDB</p>
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
                        ? "bg-[rgba(34,197,94,0.15)] text-[#22C55E]"
                        : "text-[#94A3B8] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {range}D
                  </button>
                ))}
              </div>
            </div>

            {rangeLoading ? (
              <div className="h-64 rounded-xl bg-[#151F31] animate-pulse" aria-label="Updating chart" />
            ) : data.salesChart.length && data.salesChart.some((d) => d.revenue > 0 || d.orders > 0) ? (
              <div className="h-64 w-full min-w-0" role="img" aria-label="Daily paid revenue chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              <div className="flex items-center gap-4 text-xs text-[#94A3B8] pt-2 border-t border-[#243047]/60">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                  <span>Paid Revenue</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#94A3B8]" />
                  <span>Orders</span>
                </span>
                <span className="ml-auto text-[#64748B]">
                  {days} days · {data.salesChart.reduce((sum, d) => sum + d.orders, 0)} total orders
                </span>
              </div>
            )}
          </section>

          {/* 10. RECENT ORDERS & 11. TABLE DESIGN */}
          <section className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#243047]">
              <div>
                <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Recent Orders</h2>
                <p className="text-xs text-[#94A3B8]">Latest customer transactions</p>
              </div>
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#22C55E] hover:underline"
              >
                <span>All Orders</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {data.recentOrders.length ? (
              <div className="overflow-x-auto rounded-lg border border-[#243047]">
                <table className="w-full text-left text-xs text-[#94A3B8]">
                  <thead className="bg-[#151F31] text-[11px] uppercase tracking-wider text-[#94A3B8] font-bold border-b border-[#243047]">
                    <tr>
                      <th className="py-2.5 px-3.5">Order ID</th>
                      <th className="py-2.5 px-3.5">Game & Package</th>
                      <th className="py-2.5 px-3.5">Player ID</th>
                      <th className="py-2.5 px-3.5">Amount</th>
                      <th className="py-2.5 px-3.5">Payment</th>
                      <th className="py-2.5 px-3.5">Fulfillment</th>
                      <th className="py-2.5 px-3.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#243047]">
                    {data.recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#151F31]/50 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono text-[#F8FAFC] font-medium">
                          {order.orderNumber}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <strong className="block text-[#F8FAFC]">{order.gameName}</strong>
                          <span className="text-[11px] text-[#64748B]">{order.packageName}</span>
                        </td>
                        <td className="py-2.5 px-3.5 text-[#F8FAFC]">
                          {order.playerId}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-[#F8FAFC]">
                          {money(order.amount)}
                        </td>
                        <td className="py-2.5 px-3.5">
                          {getStatusBadge(order.paymentStatus)}
                        </td>
                        <td className="py-2.5 px-3.5">
                          {getStatusBadge(order.fulfillmentStatus)}
                        </td>
                        <td className="py-2.5 px-3.5 text-[#64748B]">
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

      <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
        <TrendingUp size={13} />
        <span>All dashboard figures reflect live MongoDB records. Supplier balances update upon verification.</span>
      </div>
    </div>
  );
}
