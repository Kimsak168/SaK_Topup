"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

interface TrackedOrder {
  orderNumber: string;
  gameName: string;
  packageName: string;
  playerId: string;
  serverId: string | null;
  playerName: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
}

function OrderTrackingContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("orderNumber") || "";

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async (targetQuery: string) => {
    const q = targetQuery.trim();
    if (!q) {
      toast.error("Please enter an Order Number or Player ID", { id: "order-search" });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      setLoading(true);
      setSearched(true);
      setSearchError(null);
      setSubmittedQuery(q);
      const res = await fetch(`/api/orders/track?query=${encodeURIComponent(q)}`, { signal: controller.signal });
      const data = await res.json();
      if (controller.signal.aborted) return;

      if (res.ok && data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
        if (data.orders.length === 0) {
          toast.info("No matching orders found. Double-check your details.", { id: "order-search" });
        }
      } else {
        setSearchError(data.error || "Lookup failed. Please try again.");
      }
    } catch {
      if (!controller.signal.aborted) setSearchError("Unable to connect. Check your connection and try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    }
    return () => requestRef.current?.abort();
  }, [initialQuery, handleSearch]);

  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#15803D]">
          <ShoppingBag className="h-3.5 w-3.5 text-[#16A34A]" />
          <span>Real-Time Tracking</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#172033] tracking-tight">
          Track Your Top-Up Order
        </h1>
        <p className="text-sm leading-relaxed text-[#64748B]">
          Enter your Order Number (e.g., ORD-123456) or your in-game Player ID to check fulfillment status.
        </p>
      </div>

      {/* Search Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch(query);
        }}
        className="max-w-xl mx-auto flex items-center gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            aria-label="Order number or player ID"
            autoComplete="off"
            maxLength={128}
            enterKeyHint="search"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter Order # or Player ID..."
            className="h-10 sm:h-11 w-full rounded-xl border border-[#BBF7D0] bg-white pl-9 sm:pl-10 pr-4 text-xs sm:text-sm text-[#172033] placeholder:text-[#94A3B8] focus:border-[#22C55E] focus-visible:outline-none focus:ring-2 focus:ring-[#22C55E]/20 shadow-xs"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 h-10 sm:h-11 px-4 sm:px-5 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-xs bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D]"
        >
          {loading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          <span>Track</span>
        </button>
      </form>

      {/* Results Section */}
      {loading && (
        <div role="status" className="min-h-64 space-y-4 rounded-2xl border border-[#BBF7D0] bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-medium text-[#64748B]"><RefreshCw className="h-4 w-4 animate-spin text-[#16A34A]" />Finding your orders...</div>
          <div className="h-5 w-1/3 rounded bg-[#F0FDF4] animate-pulse" />
          <div className="h-20 rounded-xl bg-[#F0FDF4] animate-pulse" />
        </div>
      )}
      {!loading && searchError && (
        <div role="alert" className="min-h-48 rounded-2xl border border-[#EF4444]/30 bg-white p-6 text-center shadow-xs">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-[#EF4444]" />
          <h2 className="font-bold text-[#172033]">We couldn&apos;t load your orders</h2>
          <p className="mt-2 text-sm text-[#64748B]">{searchError}</p>
          <button type="button" onClick={() => handleSearch(submittedQuery)} className="mt-4 min-h-11 rounded-xl px-5 text-sm font-semibold text-white bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] shadow-xs cursor-pointer">Try again</button>
        </div>
      )}
      {searched && !loading && !searchError && (
        <div aria-live="polite" className="space-y-4 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Order Results ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-[#BBF7D0] bg-white px-5 py-10 sm:p-12 text-center text-[#64748B] space-y-3 shadow-xs">
              <AlertCircle className="h-10 w-10 text-[#64748B] mx-auto" />
              <h3 className="font-bold text-[#172033] text-base">No orders found</h3>
              <p className="text-xs max-w-sm mx-auto">
                No top-up record matched &quot;{submittedQuery}&quot;. Please verify your Player ID or Order Number, or contact our 24/7 support.
              </p>
              <Link
                href="https://t.me/saksuuu_support"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16A34A] hover:text-[#22C55E] underline underline-offset-4"
              >
                <span>Telegram Support 24/7</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orders.map((order) => (
                <div
                  key={order.orderNumber}
                  className="min-w-0 rounded-2xl border border-[#BBF7D0] bg-white p-4 sm:p-6 space-y-4 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DCFCE7] pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono font-bold text-[#16A34A] text-base">
                          {order.orderNumber}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            order.fulfillmentStatus === "completed"
                              ? "bg-emerald-50 text-[#22C55E] border border-[#22C55E]/30"
                              : order.fulfillmentStatus === "failed"
                              ? "bg-rose-50 text-[#EF4444] border border-[#EF4444]/30"
                              : "bg-amber-50 text-[#F59E0B] border border-[#F59E0B]/30"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              order.fulfillmentStatus === "completed"
                                ? "bg-[#22C55E]"
                                : order.fulfillmentStatus === "failed"
                                ? "bg-[#EF4444]"
                                : "bg-[#F59E0B]"
                            }`}
                          />
                          Fulfillment: {order.fulfillmentStatus}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Placed on {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-[#64748B]">
                        Paid Amount
                      </span>
                      <div className="text-lg font-black text-[#172033]">
                        ${order.amount.toFixed(2)} {order.currency}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs [&>div]:min-w-0 [&_p]:break-words">
                    <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
                      <span className="text-[#64748B] text-[10px]">Game & Denomination:</span>
                      <p className="font-bold text-[#172033] mt-0.5">{order.gameName}</p>
                      <p className="text-[#16A34A] text-[11px] font-semibold">{order.packageName}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
                      <span className="text-[#64748B] text-[10px]">Target Account:</span>
                      <p className="font-mono font-bold text-[#172033] mt-0.5">
                        UID: {order.playerId}
                      </p>
                      {order.serverId && (
                        <p className="font-mono text-[#64748B] text-[10px]">
                          Zone: {order.serverId}
                        </p>
                      )}
                      {order.playerName && (
                        <p className="text-[#22C55E] font-semibold text-[11px]">
                          IGN: {order.playerName}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7]">
                      <span className="text-[#64748B] text-[10px]">Payment Status:</span>
                      <p className="font-bold text-[#172033] uppercase mt-0.5">
                        {order.paymentMethod} (
                        <span className="text-[#22C55E]">{order.paymentStatus}</span>)
                      </p>
                      <p className="text-[#64748B] text-[11px] mt-0.5">
                        Automated Direct API Delivery
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#64748B]">
          <RefreshCw className="h-6 w-6 animate-spin text-[#16A34A]" />
          <span className="text-xs">Loading order tracker...</span>
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
