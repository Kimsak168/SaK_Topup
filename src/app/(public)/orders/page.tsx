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
      toast.error("Please enter an Order Number or Player ID");
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
          toast.info("No matching orders found. Double-check your details.");
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
        <div className="inline-flex items-center gap-2 rounded-full border border-[#F4C7DD] bg-[#FFF1F7] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#EC168C]">
          <ShoppingBag className="h-3.5 w-3.5 text-[#EC168C]" />
          <span>Real-Time Tracking</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#1E293B] tracking-tight">
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
            className="h-10 sm:h-11 w-full rounded-xl border border-[#F4C7DD] bg-white pl-9 sm:pl-10 pr-4 text-xs sm:text-sm text-[#1E293B] placeholder:text-[#64748B] focus:border-[#EC168C] focus-visible:outline-2 focus-visible:outline-[#EC168C] focus:ring-2 focus:ring-[#EC168C]/20 shadow-xs"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="public-button shrink-0 h-10 sm:h-11 px-4 sm:px-5 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-xs"
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
      {loading && <div role="status" className="min-h-64 space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Finding your orders...</div>
        <div className="h-5 w-1/3 rounded bg-secondary animate-pulse" />
        <div className="h-20 rounded-xl bg-secondary animate-pulse" />
      </div>}
      {!loading && searchError && <div role="alert" className="min-h-48 rounded-2xl border border-destructive/20 bg-card p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
        <h2 className="font-bold">We couldn&apos;t load your orders</h2>
        <p className="mt-2 text-sm text-muted-foreground">{searchError}</p>
        <button type="button" onClick={() => handleSearch(submittedQuery)} className="public-button mt-4 min-h-11 rounded-xl px-5 text-sm font-semibold">Try again</button>
      </div>}
      {searched && !loading && !searchError && (
        <div aria-live="polite" className="space-y-4 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-secondary-foreground">
            Order Results ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-5 py-10 sm:p-12 text-center text-muted-foreground space-y-3">
              <AlertCircle className="h-10 w-10 text-secondary-foreground mx-auto" />
              <h3 className="font-bold text-foreground text-base">No orders found</h3>
              <p className="text-xs max-w-sm mx-auto">
                No top-up record matched &quot;{submittedQuery}&quot;. Please verify your Player ID or Order Number, or contact our 24/7 support.
              </p>
              <Link
                href="https://t.me/saksuuu_support"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary underline underline-offset-4"
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
                  className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono font-bold text-primary text-base">
                          {order.orderNumber}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            order.fulfillmentStatus === "completed"
                              ? "bg-success/10 text-success border border-emerald-500/30"
                              : order.fulfillmentStatus === "failed"
                              ? "bg-destructive/10 text-destructive border border-rose-500/30"
                              : "bg-warning/10 text-warning border border-amber-500/30"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              order.fulfillmentStatus === "completed"
                                ? "bg-emerald-400"
                                : order.fulfillmentStatus === "failed"
                                ? "bg-rose-400"
                                : "bg-amber-400"
                            }`}
                          />
                          Fulfillment: {order.fulfillmentStatus}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Placed on {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        Paid Amount
                      </span>
                      <div className="text-lg font-black text-foreground">
                        ${order.amount.toFixed(2)} {order.currency}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs [&>div]:min-w-0 [&_p]:break-words">
                    <div className="p-3 rounded-xl bg-muted border border-border">
                      <span className="text-muted-foreground text-[10px]">Game & Denomination:</span>
                      <p className="font-bold text-foreground mt-0.5">{order.gameName}</p>
                      <p className="text-secondary-foreground text-[11px]">{order.packageName}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-muted border border-border">
                      <span className="text-muted-foreground text-[10px]">Target Account:</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">
                        UID: {order.playerId}
                      </p>
                      {order.serverId && (
                        <p className="font-mono text-muted-foreground text-[10px]">
                          Zone: {order.serverId}
                        </p>
                      )}
                      {order.playerName && (
                        <p className="text-success font-semibold text-[11px]">
                          IGN: {order.playerName}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-muted border border-border">
                      <span className="text-muted-foreground text-[10px]">Payment Status:</span>
                      <p className="font-bold text-foreground uppercase mt-0.5">
                        {order.paymentMethod} (
                        <span className="text-success">{order.paymentStatus}</span>)
                      </p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
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
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">Loading order tracker...</span>
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
