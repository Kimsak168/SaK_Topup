"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ShoppingCart,
  Search,
  RefreshCw,
  Eye,
  Download,
  Save,
  X,
  ShieldCheck,
} from "lucide-react";

interface AdminOrder {
  id: string;
  orderNumber: string;
  gameSlug: string;
  gameName: string;
  packageName: string;
  supplier: "vizo" | "g2bulk";
  supplierProductCode: string;
  playerId: string;
  serverId: string | null;
  playerName: string | null;
  amount: number;
  buyingPrice: number;
  profit: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  transactionId?: string | null;
  paidAt?: string | null;
  fulfilledAt?: string | null;
  supplierOrderId: string | null;
  customerContact: string | null;
  adminNotes: string;
  errorLog: string;
  createdAt: string;
  updatedAt: string;
}

interface KPIStats {
  totalOrders: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  totalRevenue: number;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIStats>({
    totalOrders: 0,
    completedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalRevenue: 0,
  });

  // Filter state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selected Order for detail modal
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [editFulfillment, setEditFulfillment] = useState<string>("pending");
  const [editPayment, setEditPayment] = useState<string>("pending");
  const [editNotes, setEditNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrder) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = detailRef.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedOrder(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      previousFocus?.focus();
    };
  }, [selectedOrder]);

  const handleReconcileOrder = async (order: AdminOrder) => {
    try {
      setReconcilingId(order.id);
      const res = await fetch("/api/admin/orders/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderNumber: order.orderNumber,
          transactionId: order.transactionId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Reconciliation finished");
        if (data.order) {
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, ...data.order } : o))
          );
          if (selectedOrder && selectedOrder.id === order.id) {
            setSelectedOrder((prev) => (prev ? { ...prev, ...data.order } : null));
          }
        }
      } else {
        toast.error(data.error || "Reconciliation failed");
      }
    } catch {
      toast.error("Network error during reconciliation");
    } finally {
      setReconcilingId(null);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        status: statusFilter,
        supplier: supplierFilter,
        search: debouncedSearch,
      });

      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
        setTotalPages(data.pagination.totalPages);
        setKpi(data.kpi);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, supplierFilter, debouncedSearch]);

  useEffect(() => {
    if (search === debouncedSearch) void fetchOrders();
  }, [search, debouncedSearch, fetchOrders]);

  const handleOpenDetail = (order: AdminOrder) => {
    setSelectedOrder(order);
    setEditFulfillment(order.fulfillmentStatus);
    setEditPayment(order.paymentStatus);
    setEditNotes(order.adminNotes || "");
  };

  const handleSaveOrder = async () => {
    if (!selectedOrder) return;
    try {
      setIsUpdating(true);
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          fulfillmentStatus: editFulfillment,
          paymentStatus: editPayment,
          adminNotes: editNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Order status updated successfully");
        // Update local list
        setOrders((prev) =>
          prev.map((o) =>
            o.id === selectedOrder.id
              ? {
                  ...o,
                  fulfillmentStatus: editFulfillment as AdminOrder["fulfillmentStatus"],
                  paymentStatus: editPayment as AdminOrder["paymentStatus"],
                  adminNotes: editNotes,
                }
              : o
          )
        );
        setSelectedOrder(null);
      } else {
        toast.error(data.error || "Update failed");
      }
    } catch {
      toast.error("Network error while updating order");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleExportCSV = () => {
    if (orders.length === 0) {
      toast.error("No orders to export");
      return;
    }

    const headers = [
      "Order Number",
      "Date",
      "Game",
      "Package",
      "Supplier",
      "Player ID",
      "Server ID",
      "Player Name",
      "Amount USD",
      "Wholesale Cost USD",
      "Net Profit USD",
      "Payment Method",
      "Payment Status",
      "Fulfillment Status",
      "Supplier Ref",
    ];

    const rows = orders.map((o) => [
      o.orderNumber,
      new Date(o.createdAt).toISOString(),
      `"${o.gameName}"`,
      `"${o.packageName}"`,
      o.supplier,
      `"${o.playerId}"`,
      `"${o.serverId || ""}"`,
      `"${o.playerName || ""}"`,
      o.amount,
      o.buyingPrice,
      o.profit,
      o.paymentMethod,
      o.paymentStatus,
      o.fulfillmentStatus,
      `"${o.supplierOrderId || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `saksuuu_orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported orders CSV successfully");
  };

  return (
    <div className="admin-page animate-in fade-in duration-300">
      {/* Top Title & Header */}
      <div className="admin-page-heading">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Customer Orders</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real MongoDB order log, fulfillment auditing, and customer top-up verification.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => fetchOrders()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-[0_0_15px_rgba(255,46,147,0.3)] transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Orders
          </span>
          <div className="text-xl font-black text-white mt-1">
            {kpi.totalOrders}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Completed
          </span>
          <div className="text-xl font-black text-emerald-400 mt-1">
            {kpi.completedCount}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Pending / Queue
          </span>
          <div className="text-xl font-black text-amber-400 mt-1">
            {kpi.pendingCount}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
            Failed / Errors
          </span>
          <div className="text-xl font-black text-rose-400 mt-1">
            {kpi.failedCount}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-white/10 bg-[#0c0e24]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400">
            Completed Revenue
          </span>
          <div className="text-xl font-black text-pink-400 mt-1">
            ${kpi.totalRevenue.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl p-4 border border-white/10 bg-[#0c0e24] flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Order #, Player ID, Game, or Customer Name..."
            className="w-full rounded-xl border border-white/10 bg-[#08091a] pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-white/10 bg-[#08091a] px-3 py-2.5 text-xs text-white focus:border-pink-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-white/10 bg-[#08091a] px-3 py-2.5 text-xs text-white focus:border-pink-500 focus:outline-none"
          >
            <option value="all">All Suppliers</option>
            <option value="vizo">Vizo (Free Fire)</option>
            <option value="g2bulk">G2Bulk</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e24] overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-pink-500" />
            <span className="text-xs">Loading customer orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <ShoppingCart className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">No orders found</p>
            <p className="text-xs text-slate-500 mt-1">
              Customer orders placed on the storefront will appear here with live fulfillment details.
            </p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#090b1c] text-slate-400 uppercase text-[10px] font-bold border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Game & Package</th>
                  <th className="py-3 px-4">Player Details</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">AnajakPay Txn</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Fulfillment</th>
                  <th className="py-3 px-4">Timestamps</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((order) => {
                  const payUpper = String(order.paymentStatus).toUpperCase();
                  const fulUpper = String(order.fulfillmentStatus).toUpperCase();
                  const isReconciling = reconcilingId === order.id;

                  return (
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
                        <div>ID: {order.playerId}</div>
                        {order.serverId && (
                          <div className="text-[10px] text-slate-500">
                            Server: {order.serverId}
                          </div>
                        )}
                        {order.playerName && (
                          <div className="text-[10px] text-emerald-400 font-sans">
                            IGN: {order.playerName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">
                          ${order.amount.toFixed(2)} {order.currency || "USD"}
                        </div>
                        <div className="text-[10px] text-emerald-400">
                          +${order.profit.toFixed(2)} net
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {order.transactionId ? (
                          <span className="text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10 select-all" title={order.transactionId}>
                            {order.transactionId.length > 16
                              ? `${order.transactionId.slice(0, 10)}...${order.transactionId.slice(-4)}`
                              : order.transactionId}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            payUpper === "PAID"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : payUpper === "FAILED" || payUpper === "CANCELLED" || payUpper === "EXPIRED"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse"
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            fulUpper === "COMPLETED" || fulUpper === "DELIVERED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : fulUpper === "FAILED"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {order.fulfillmentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px] font-mono leading-tight space-y-0.5">
                        <div>Cr: {new Date(order.createdAt).toLocaleDateString()}</div>
                        {order.paidAt && (
                          <div className="text-emerald-400/90 text-[10px]">
                            Pd: {new Date(order.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleReconcileOrder(order)}
                          disabled={isReconciling}
                          className="admin-table-action cursor-pointer"
                          title="Protected Reconcile (AnajakPay & Supplier)"
                        >
                          <ShieldCheck className={`h-3.5 w-3.5 ${isReconciling ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(order)}
                          className="admin-table-action cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div ref={detailRef} role="dialog" aria-modal="true" aria-label="Order details"
            className="admin-modal-panel w-full max-w-2xl p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white font-mono">
                    {selectedOrder.orderNumber}
                  </h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    {selectedOrder.supplier}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Placed on {new Date(selectedOrder.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#08091a] border border-white/5 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Game & Package
                </span>
                <p className="font-bold text-white text-sm">
                  {selectedOrder.gameName}
                </p>
                <p className="text-slate-300">{selectedOrder.packageName}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  Code: {selectedOrder.supplierProductCode}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#08091a] border border-white/5 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Target Account
                </span>
                <p className="font-mono font-bold text-white">
                  Player ID: {selectedOrder.playerId}
                </p>
                {selectedOrder.serverId && (
                  <p className="font-mono text-slate-300">
                    Server/Zone: {selectedOrder.serverId}
                  </p>
                )}
                {selectedOrder.playerName && (
                  <p className="text-emerald-400 font-semibold">
                    In-Game Name: {selectedOrder.playerName}
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#08091a] border border-white/5 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Financials & Margin
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer Paid:</span>
                  <span className="font-bold text-white">
                    ${selectedOrder.amount.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Wholesale Cost:</span>
                  <span className="font-mono text-slate-300">
                    ${selectedOrder.buyingPrice.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/5">
                  <span className="text-slate-400">Gross Profit:</span>
                  <span className="font-bold text-emerald-400">
                    +${selectedOrder.profit.toFixed(2)} USD
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#08091a] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Payment Gateway
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReconcileOrder(selectedOrder)}
                    disabled={reconcilingId === selectedOrder.id}
                    className="px-2.5 py-1 rounded-lg border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <ShieldCheck className={`h-3 w-3 ${reconcilingId === selectedOrder.id ? "animate-spin" : ""}`} />
                    <span>Reconcile Now</span>
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Method:</span>
                  <span className="font-bold text-white uppercase">
                    {selectedOrder.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">AnajakPay Txn:</span>
                  <span className="font-mono text-pink-400 truncate max-w-[160px] select-all">
                    {selectedOrder.transactionId || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Supplier Order ID:</span>
                  <span className="font-mono text-purple-400 truncate max-w-[150px]">
                    {selectedOrder.supplierOrderId || "Direct API"}
                  </span>
                </div>
                {selectedOrder.paidAt && (
                  <div className="flex justify-between text-[11px] text-emerald-400">
                    <span>Paid At:</span>
                    <span>{new Date(selectedOrder.paidAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedOrder.fulfilledAt && (
                  <div className="flex justify-between text-[11px] text-emerald-400">
                    <span>Delivered At:</span>
                    <span>{new Date(selectedOrder.fulfilledAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Editable Status Form */}
            <div className="space-y-4 pt-2 border-t border-white/10">
              <h4 className="text-xs font-bold uppercase text-slate-300">
                Update Order Status & Audit Notes
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400">
                    Fulfillment Status
                  </label>
                  <select
                    value={editFulfillment}
                    onChange={(e) => setEditFulfillment(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3 py-2 text-xs text-white focus:border-pink-500 focus:outline-none"
                  >
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400">
                      Payment Status
                    </label>
                    <span className="text-[10px] text-slate-500">
                      (Bypass disabled)
                    </span>
                  </div>
                  <select
                    value={editPayment}
                    onChange={(e) => setEditPayment(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3 py-2 text-xs text-white focus:border-pink-500 focus:outline-none"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELLED">CANCELLED</option>
                    <option value="refunded">Refunded</option>
                    {String(selectedOrder.paymentStatus).toUpperCase() === "PAID" && (
                      <option value="PAID">PAID (Verified)</option>
                    )}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    To mark as PAID, use &ldquo;Reconcile Now&rdquo; to confirm real AnajakPay settlement.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">
                  Admin Internal Notes
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Audit notes or transaction references..."
                  className="w-full rounded-xl border border-white/10 bg-[#08091a] p-3 text-xs text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrder}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isUpdating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
