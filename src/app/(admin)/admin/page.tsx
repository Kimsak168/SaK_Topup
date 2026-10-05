"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity, ArrowRight, CircleAlert, DollarSign, Gamepad2, Package,
  RefreshCw, Server, ShoppingCart, TrendingUp,
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

  const cards = data ? [
    { label: "Total revenue", value: money(data.stats.totalRevenue),
      note: `${money(data.stats.totalProfit)} recorded profit`, icon: DollarSign, accent: "pink" },
    { label: "Total orders", value: compact(data.stats.totalOrders),
      note: `${compact(data.stats.completedOrders)} completed · ${compact(data.stats.pendingOrders)} pending`,
      icon: ShoppingCart, accent: "violet" },
    { label: "Active games", value: compact(data.stats.activeGames),
      note: `${compact(data.stats.totalGames)} in catalogue`, icon: Gamepad2, accent: "sky" },
    { label: "Active packages", value: compact(data.stats.activePackages),
      note: `${compact(data.stats.totalPackages)} configured`, icon: Package, accent: "amber" },
  ] : [];

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Workspace / Overview</p>
          <h1>Dashboard overview</h1>
          <p>Store performance, recent orders and supplier account status.</p>
        </div>
        <div className="admin-heading-actions">
          <span className={`admin-connection ${error ? "is-failed" : data ? "is-connected" : ""}`}>
            <span className="admin-connection-dot" />
            {error ? "Data unavailable" : data ? "MongoDB connected" : "Checking data"}
          </span>
          <button type="button" onClick={() => void fetchOverview(true)} disabled={refreshing}
            className="admin-button admin-button-secondary">
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing" : "Refresh stats"}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="admin-error">
        <CircleAlert size={18} /><span>{error}{data ? " Showing the last loaded figures." : ""}</span>
        <button type="button" onClick={() => void fetchOverview(true)}>Try again</button>
      </div>}

      {loading && !data ? (
        <div className="admin-stats-grid" aria-label="Loading dashboard statistics">
          {[1, 2, 3, 4].map((item) => <div key={item} className="admin-skeleton h-36 rounded-2xl" />)}
        </div>
      ) : data ? (
        <>
          <div className="admin-stats-grid">
            {cards.map(({ label, value, note, icon: Icon, accent }) => (
              <div key={label} className={`admin-stat admin-stat-${accent}`}>
                <div className="admin-stat-top"><span>{label}</span><span className="admin-stat-icon"><Icon size={19} /></span></div>
                <strong>{value}</strong><p>{note}</p>
              </div>
            ))}
          </div>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div><p className="admin-eyebrow">Integrations</p><h2>Supplier accounts</h2>
                <p>Connection and balances are shown only after an explicit verification.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={verifySuppliers} disabled={checking}
                  className="admin-button admin-button-secondary">
                  <RefreshCw size={15} className={checking ? "animate-spin" : ""} />
                  {checking ? "Checking" : "Verify connections"}
                </button>
                <Link href="/admin/suppliers" className="admin-text-link">Details <ArrowRight size={14} /></Link>
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
                return <div className="admin-supplier-card" key={key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3"><span className="admin-supplier-icon"><Server size={19} /></span>
                      <div><h3>{key === "vizo" ? "Vizo" : "G2Bulk"}</h3>
                        <p>{key === "vizo" ? "Free Fire provider" : "Game top-up provider"}</p></div></div>
                    <span className={`admin-status admin-status-${status.toLowerCase()}`}>{status}</span>
                  </div>
                  <div className="admin-supplier-balance"><span>Verified wallet balance</span><strong>{balance}</strong></div>
                  <div className="admin-supplier-meta">
                    <span>Account: {verified?.status === "connected" ? verified.reseller?.username || "Available" : "—"}</span>
                    <span>{supplierCheck && verified ? `Checked ${new Date(supplierCheck.timestamp).toLocaleString()}` : "Not checked this session"}</span>
                  </div>
                  {verified?.error && <p className="admin-inline-error">{verified.error}</p>}
                </div>;
              })}
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div><p className="admin-eyebrow">Performance</p><h2>Sales & order activity</h2>
                <p>Paid revenue and all orders recorded in MongoDB.</p></div>
              <div className="admin-range" role="group" aria-label="Chart date range">
                {[7, 14, 30, 90].map((range) => <button key={range} type="button"
                  aria-pressed={days === range} onClick={() => setDays(range)}
                  className={days === range ? "is-active" : ""}>{range}d</button>)}
              </div>
            </div>
            {rangeLoading ? <div className="admin-skeleton h-72 rounded-xl" aria-label="Updating chart" />
              : data.salesChart.length ? <div className="h-72 w-full min-w-0" role="img" aria-label="Daily paid revenue chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesChart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e92b91" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#ec168c" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#ffffff18" strokeDasharray="3 5" />
                  <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)}
                    stroke="#9aa6bd" tickLine={false} axisLine={false} fontSize={11} minTickGap={22} />
                  <YAxis yAxisId="revenue" stroke="#9aa6bd" tickLine={false} axisLine={false} fontSize={11} width={52}
                    tickFormatter={(value: number) => `$${value}`} />
                  <YAxis yAxisId="orders" orientation="right" stroke="#9aa6bd"
                    tickLine={false} axisLine={false} fontSize={11} width={30}
                    allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#161b2b", border: "1px solid #374055",
                    borderRadius: 12, color: "#fff" }}
                    formatter={(value, name) => [name === "revenue" ? money(Number(value)) : value, name === "revenue" ? "Paid revenue" : "Orders"]} />
                  <Area name="revenue" yAxisId="revenue" type="linear" dataKey="revenue"
                    stroke="#f338a0" strokeWidth={2.5} fill="url(#adminRevenue)" />
                  <Line name="orders" yAxisId="orders" type="linear" dataKey="orders"
                    stroke="#8ea0b7" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div> : <div className="admin-empty"><Activity size={24} /><strong>No activity in this range</strong>
              <p>Orders will appear here when they are recorded.</p></div>}
            {!rangeLoading && <div className="admin-chart-footnote"><span className="admin-legend-dot" /> Paid revenue
              <span className="admin-legend-dot admin-legend-orders" /> Orders
              <span className="ml-auto">{days} days · {data.salesChart.reduce((sum, day) => sum + day.orders, 0)} orders</span></div>}
          </section>

          <section className="admin-panel admin-panel-table">
            <div className="admin-panel-heading"><div><p className="admin-eyebrow">Activity</p><h2>Recent orders</h2>
              <p>Latest customer requests from the order log.</p></div>
              <Link href="/admin/orders" className="admin-text-link">All orders <ArrowRight size={14} /></Link></div>
            {data.recentOrders.length ? <div className="overflow-x-auto">
              <table className="admin-table"><thead><tr><th>Order</th><th>Game & package</th>
                <th>Player</th><th>Amount</th><th>Payment</th><th>Fulfillment</th><th>Date</th></tr></thead>
                <tbody>{data.recentOrders.map((order) => <tr key={order.id}>
                  <td><span className="font-mono text-pink-300">{order.orderNumber}</span></td>
                  <td><strong>{order.gameName}</strong><small>{order.packageName}</small></td>
                  <td>{order.playerId}</td><td>{money(order.amount)}</td>
                  <td><span className="admin-status">{order.paymentStatus || "Unknown"}</span></td>
                  <td><span className="admin-status">{order.fulfillmentStatus || "Unknown"}</span></td>
                  <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                </tr>)}</tbody></table>
            </div> : <div className="admin-empty"><ShoppingCart size={24} /><strong>No orders yet</strong></div>}
          </section>
        </>
      ) : null}
      <div className="admin-footer-link"><TrendingUp size={14} /> All figures reflect stored records. Supplier balances require verification.</div>
    </div>
  );
}
