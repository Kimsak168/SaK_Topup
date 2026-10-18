"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  CreditCard,
  Copy,
  Check,
  Zap,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { openKhqrInPageCheckout, closeKhqrInPageCheckout } from "@/lib/khqrPlugin";

interface OrderDetail {
  id: string;
  orderNumber: string;
  transactionId?: string;
  checkoutUrl?: string;
  gameName: string;
  gameSlug: string;
  packageName: string;
  supplierProductCode: string;
  playerId: string;
  serverId?: string | null;
  playerName?: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";
  fulfillmentStatus: "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  paidAt?: string | null;
  fulfilledAt?: string | null;
}

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [copiedTxn, setCopiedTxn] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok && data.success && data.order) {
        setOrder(data.order);
        setError(null);
      } else {
        setError(data.error || "Order not found");
      }
    } catch {
      setError("Network error loading order tracking.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
    return () => closeKhqrInPageCheckout();
  }, [fetchOrder]);

  // Auto-refresh pending/processing orders
  useEffect(() => {
    if (!order) return;
    const isOngoing =
      order.paymentStatus === "PENDING" ||
      (order.paymentStatus === "PAID" &&
        (order.fulfillmentStatus === "PROCESSING" ||
          order.fulfillmentStatus === "NOT_STARTED"));

    if (isOngoing) {
      const interval = setInterval(() => {
        fetchOrder();
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [order, fetchOrder]);

  const copyToClipboard = async (text: string, isTxn = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isTxn) {
        setCopiedTxn(true);
        setTimeout(() => setCopiedTxn(false), 2000);
      } else {
        setCopiedOrder(true);
        setTimeout(() => setCopiedOrder(false), 2000);
      }
      toast.success("Copied to clipboard", { id: "clipboard" });
    } catch {
      toast.error("Unable to copy", { id: "clipboard", description: "Please copy the value manually." });
    }
  };

  const handleOpenInPageCheckout = async () => {
    if (!order?.checkoutUrl) return;

    toast.loading("Preparing secure checkout...", { id: "checkout" });
    const res = await openKhqrInPageCheckout({
      checkoutUrl: order.checkoutUrl,
      onSuccess: () => {
        fetchOrder();
      },
      onError: (err) => {
        console.warn("[Orders] In-page checkout event:", err);
        toast.error("Unable to start payment", { id: "checkout", description: "Please try again or contact support if the problem continues." });
      },
      onClose: () => {
        fetchOrder();
        toast.info("Payment window closed", { id: "checkout", description: "Your pending order is saved." });
      },
    });

    if (!res.opened) {
      toast.error("Unable to start payment", { id: "checkout", description: "Your pending order is saved. Please contact support if checkout does not open." });
    } else {
      toast.success("Checkout ready", { id: "checkout", description: "Scan with ABA Mobile or any KHQR app." });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#64748B]">
        <RefreshCw className="h-8 w-8 animate-spin text-[#16A34A]" />
        <span className="text-xs font-semibold">Loading order details...</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-[#EF4444] border border-[#EF4444]/30 shadow-xs">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-[#172033]">Order Not Found</h1>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {error || "We could not find an order matching that reference ID."}
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Link
            href="/orders"
            className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-white font-bold text-xs transition-colors shadow-xs"
          >
            Track Other Orders
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-[#BBF7D0] bg-white text-[#64748B] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:text-[#22C55E] font-bold text-xs transition-colors shadow-xs"
          >
            Storefront
          </Link>
        </div>
      </div>
    );
  }

  const isPaid = order.paymentStatus === "PAID";
  const isPending = order.paymentStatus === "PENDING";
  const isFulfilled = order.fulfillmentStatus === "COMPLETED";

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6 space-y-8 animate-in fade-in">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#64748B]">
        <Link href="/orders" className="hover:text-[#16A34A] active:text-[#22C55E] flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Order Lookup</span>
        </Link>
        <span>/</span>
        <span className="text-[#172033] font-semibold font-mono">{order.orderNumber}</span>
      </div>

      {/* Top Header Card */}
      <div className="rounded-3xl border border-[#BBF7D0] bg-white p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCFCE7] pb-6">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider">
              Authoritative Order Record
            </span>
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 break-all text-2xl sm:text-3xl font-black text-[#172033] font-mono">
                {order.orderNumber}
              </h1>
              <button
                type="button"
                onClick={() => copyToClipboard(order.orderNumber)}
                className="p-1.5 text-[#64748B] hover:text-[#16A34A]"
                title="Copy Order ID"
              >
                {copiedOrder ? (
                  <Check className="h-4 w-4 text-[#22C55E]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#64748B]">
              Placed on {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className="text-xs text-[#64748B] font-medium">Payment Status:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isPaid
                  ? "bg-emerald-50 text-[#22C55E] border border-[#22C55E]/30"
                  : isPending
                  ? "bg-amber-50 text-[#F59E0B] border border-[#F59E0B]/30 animate-pulse"
                  : "bg-rose-50 text-[#EF4444] border border-[#EF4444]/30"
              }`}
            >
              {isPaid ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : isPending ? (
                <Clock className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              <span>{order.paymentStatus}</span>
            </span>
          </div>
        </div>

        {/* Fulfillment Pipeline Banner */}
        <div className="rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-[#16A34A]" />
              <span>Supplier Automated Fulfillment</span>
            </span>
            <span
              className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] border ${
                isFulfilled
                  ? "bg-emerald-50 text-[#22C55E] border border-[#22C55E]/30"
                  : order.fulfillmentStatus === "PROCESSING"
                  ? "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] animate-pulse"
                  : order.fulfillmentStatus === "FAILED"
                  ? "bg-rose-50 text-[#EF4444] border border-[#EF4444]/30"
                  : "bg-white text-[#64748B] border border-[#DCFCE7]"
              }`}
            >
              {order.fulfillmentStatus}
            </span>
          </div>

          <p className="text-xs text-[#64748B] leading-relaxed">
            {isFulfilled
              ? "✓ Order has been successfully injected into your player account by our automated API."
              : order.fulfillmentStatus === "PROCESSING"
              ? "Payment confirmed. Direct server delivery is currently being processed with the game supplier."
              : order.fulfillmentStatus === "FAILED"
              ? "Supplier delivery encountered an issue. Order is held safely for administrative review or automatic refund."
              : "Awaiting verified payment settlement before initiating automated fulfillment."}
          </p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="public-order-details rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] p-4 space-y-2.5">
            <h2 className="text-[11px] font-sans font-extrabold uppercase text-[#64748B] tracking-wider">
              Product Information
            </h2>
            <div className="flex justify-between">
              <span className="text-[#64748B] font-sans">Game:</span>
              <span className="text-[#172033] font-sans font-bold">{order.gameName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B] font-sans">Package:</span>
              <span className="text-[#16A34A] font-sans font-bold">{order.packageName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B] font-sans">Amount:</span>
              <span className="text-[#16A34A] font-bold text-sm">
                ${order.amount.toFixed(2)} USD
              </span>
            </div>
          </div>

          <div className="public-order-details rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] p-4 space-y-2.5">
            <h2 className="text-[11px] font-sans font-extrabold uppercase text-[#64748B] tracking-wider">
              Target Account
            </h2>
            <div className="flex justify-between">
              <span className="text-[#64748B] font-sans">Player ID:</span>
              <span className="text-[#172033] font-bold">{order.playerId}</span>
            </div>
            {order.serverId && (
              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Zone / Server:</span>
                <span className="text-[#172033]">{order.serverId}</span>
              </div>
            )}
            {order.playerName && (
              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">IGN / Nickname:</span>
                <span className="text-[#22C55E] font-sans font-bold">{order.playerName}</span>
              </div>
            )}
            {order.transactionId && (
              <div className="flex justify-between items-center pt-1 border-t border-[#DCFCE7]">
                <span className="text-[#64748B] font-sans">AnajakPay Txn:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#64748B] truncate max-w-[120px]">
                    {order.transactionId}
                  </span>
                  <button
                    type="button"
                    aria-label="Copy transaction ID"
                    onClick={() => copyToClipboard(order.transactionId!, true)}
                    className="p-0.5 text-[#64748B] hover:text-[#16A34A]"
                  >
                    {copiedTxn ? (
                      <Check className="h-3 w-3 text-[#22C55E]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Payment Pay Button */}
        {isPending && order.checkoutUrl && (
          <div className="p-5 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="font-bold text-[#172033] text-sm">Payment Pending</div>
              <p className="text-xs text-[#64748B]">
                Complete your ABA Mobile or KHQR payment to trigger instant delivery.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenInPageCheckout}
              className="py-3 px-6 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-white font-bold text-xs transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <CreditCard className="h-4 w-4" />
              <span>Complete Payment with KHQR</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Timestamps audit footer */}
        <div className="border-t border-[#DCFCE7] pt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#64748B]">
          <div>Created: {new Date(order.createdAt).toLocaleString()}</div>
          {order.paidAt && <div>Paid: {new Date(order.paidAt).toLocaleString()}</div>}
          {order.fulfilledAt && <div>Delivered: {new Date(order.fulfilledAt).toLocaleString()}</div>}
        </div>
      </div>
    </div>
  );
}
