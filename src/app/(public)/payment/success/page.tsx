"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface OrderData {
  orderNumber: string;
  transactionId?: string;
  gameName: string;
  packageName: string;
  playerId: string;
  serverId?: string | null;
  playerName?: string | null;
  amount: number;
  currency: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";
  fulfillmentStatus: "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  paidAt?: string | null;
}

function SuccessContent() {
  const searchParams = useSearchParams();

  const orderNumber = searchParams.get("orderNumber") || "";
  const txn = searchParams.get("txn") || "";
  const queryRef = orderNumber || txn;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    if (!queryRef) {
      setError("No transaction reference provided in payment return.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(queryRef)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok && data.success && data.order) {
        setOrder(data.order);
        setError(null);
      } else {
        setError(data.error || "Order details not found.");
      }
    } catch {
      setError("Network error communicating with order tracking.");
    } finally {
      setLoading(false);
    }
  }, [queryRef]);

  useEffect(() => {
    setPollCount(0);
    fetchStatus();
  }, [fetchStatus]);

  // Auto-polling when payment is still pending verification
  // Recommended documentation standard: Poll every ~3 seconds for up to 3 minutes (60 iterations)
  const MAX_POLL_COUNT = 60;
  const isPollExpired = pollCount >= MAX_POLL_COUNT;

  useEffect(() => {
    if (!order) return;

    const ongoing = order.paymentStatus === "PENDING" ||
      (order.paymentStatus === "PAID" &&
        (order.fulfillmentStatus === "NOT_STARTED" || order.fulfillmentStatus === "PROCESSING"));
    if (ongoing && pollCount < MAX_POLL_COUNT) {
      const timer = setTimeout(() => {
        setPollCount((prev) => prev + 1);
        fetchStatus();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [order, pollCount, fetchStatus]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard", { id: "clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Unable to copy", { id: "clipboard", description: "Please copy the value manually." });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <RefreshCw className="h-10 w-10 animate-spin text-[#16A34A]" />
        <p className="text-sm font-semibold text-[#64748B]">
          Retrieving authoritative order record...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-[#EF4444] border border-[#EF4444]/30 shadow-xs">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-[#172033]">Order Lookup Error</h1>
          <p className="text-sm text-[#64748B]">{error || "Transaction record missing"}</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setLoading(true);
              fetchStatus();
            }}
            className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-white font-bold text-xs transition-colors shadow-xs"
          >
            Retry Verification
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-[#BBF7D0] bg-white text-[#64748B] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:text-[#22C55E] font-bold text-xs transition-colors shadow-xs"
          >
            Return to Store
          </Link>
        </div>
      </div>
    );
  }

  const isPaid = order.paymentStatus === "PAID";
  const isPending = order.paymentStatus === "PENDING";
  const isFailed =
    order.paymentStatus === "FAILED" ||
    order.paymentStatus === "CANCELLED" ||
    order.paymentStatus === "EXPIRED";

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6 space-y-8 animate-in fade-in">
      {/* Status Hero Card */}
      <div className="rounded-3xl border border-[#BBF7D0] bg-white p-6 sm:p-8 text-center space-y-6 shadow-xs relative overflow-hidden">
        {/* Glow backdrop */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-72 h-36 blur-3xl pointer-events-none rounded-full ${
            isPaid
              ? "bg-[#22C55E]/5"
              : isPending
              ? "bg-[#F59E0B]/5"
              : "bg-[#EF4444]/5"
          }`}
        />

        {/* Status Icon */}
        <div className="relative z-10 flex justify-center">
          {isPaid && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-[#22C55E] border border-[#22C55E]/30 shadow-xs">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          )}
          {isPending && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-[#F59E0B] border border-[#F59E0B]/30 shadow-xs">
              <Clock className="h-10 w-10 animate-pulse" />
            </div>
          )}
          {isFailed && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-[#EF4444] border border-[#EF4444]/30 shadow-xs">
              <AlertCircle className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Header Messaging */}
        <div className="relative z-10 space-y-2">
          {isPaid && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-[#172033] tracking-tight">
                Payment Received & Verified!
              </h1>
              <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                Thank you! Your payment of{" "}
                <strong className="text-[#22C55E]">
                  ${order.amount.toFixed(2)} USD
                </strong>{" "}
                was cryptographically verified via KHQR.
              </p>
            </>
          )}

          {isPending && isPollExpired && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-[#172033] tracking-tight">
                Awaiting Bank Settlement Confirmation
              </h1>
              <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                Your order{" "}
                <span className="font-mono text-[#16A34A] font-bold">
                  {order.orderNumber}
                </span>{" "}
                remains PENDING and is awaiting final settlement confirmation from the bank. If you already completed payment in ABA Mobile or via KHQR, our background reconciliation will automatically fulfill your items once confirmed.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPollCount(0);
                    fetchStatus();
                  }}
                  className="px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Check Status Again</span>
                </button>
              </div>
            </>
          )}

          {isPending && !isPollExpired && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-[#172033] tracking-tight">
                Verifying Payment with ABA/KHQR...
              </h1>
              <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                We are currently awaiting bank settlement confirmation for order{" "}
                <span className="font-mono text-[#16A34A] font-bold">
                  {order.orderNumber}
                </span>
                . Please keep this page open.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-[#F59E0B]/30 text-[11px] font-bold text-[#F59E0B] mt-2 shadow-xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Verifying bank response ({pollCount + 1}/60)...</span>
              </div>
            </>
          )}

          {isFailed && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-[#172033] tracking-tight">
                Payment Not Completed
              </h1>
              <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                This transaction was not completed or was cancelled at checkout.
              </p>
            </>
          )}
        </div>

        {/* Fulfillment Status Banner (When Paid) */}
        {isPaid && (
          <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] space-y-2 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#64748B]">Delivery Status:</span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] border ${
                  order.fulfillmentStatus === "COMPLETED"
                    ? "bg-emerald-50 text-[#22C55E] border-[#22C55E]/30"
                    : order.fulfillmentStatus === "FAILED"
                    ? "bg-rose-50 text-[#EF4444] border-[#EF4444]/30"
                    : "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0] animate-pulse"
                }`}
              >
                {order.fulfillmentStatus === "COMPLETED"
                  ? "✓ DELIVERED TO GAME"
                  : order.fulfillmentStatus === "FAILED"
                  ? "UNDER REVIEW"
                  : "PROCESSING DELIVERY..."}
              </span>
            </div>
            <p className="text-[11px] text-[#64748B]">
              {order.fulfillmentStatus === "COMPLETED"
                ? "Your top-up items have been injected directly into your account."
                : order.fulfillmentStatus === "FAILED"
                ? "Delivery encountered an issue. Our support team is auditing your transaction."
                : "Automated direct supplier API is delivering your game top-up right now."}
            </p>
          </div>
        )}

        {/* Authoritative Order Details Table */}
        <div className="public-order-details rounded-2xl bg-[#F0FDF4] p-4 text-xs space-y-2.5 text-left border border-[#DCFCE7] font-mono">
          <div className="flex justify-between items-center">
            <span className="text-[#64748B] font-sans">Order Number:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[#16A34A] font-bold">{order.orderNumber}</span>
              <button
                type="button"
                onClick={() => handleCopy(order.orderNumber)}
                className="p-1 text-[#64748B] hover:text-[#16A34A] active:text-[#22C55E]"
                title="Copy Order ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-[#22C55E]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64748B] font-sans">Game:</span>
            <span className="text-[#172033] font-sans font-bold">{order.gameName}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64748B] font-sans">Package:</span>
            <span className="text-[#16A34A] font-sans font-semibold">{order.packageName}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-[#64748B] font-sans">Target UID:</span>
            <span className="text-[#172033]">{order.playerId}</span>
          </div>

          {order.serverId && (
            <div className="flex justify-between">
              <span className="text-[#64748B] font-sans">Server / Zone:</span>
              <span className="text-[#172033]">{order.serverId}</span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-[#DCFCE7]">
            <span className="text-[#64748B] font-sans font-bold">Amount Paid:</span>
            <span className="text-[#16A34A] font-bold text-sm">
              ${order.amount.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/orders/${encodeURIComponent(order.orderNumber)}`}
            className="flex-1 py-3 px-4 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-xs font-bold text-white transition-all shadow-xs flex items-center justify-center gap-2"
          >
            <span>Live Order Tracker</span>
            <ChevronRight className="h-4 w-4" />
          </Link>

          <Link
            href="/"
            className="py-3 px-5 rounded-xl border border-[#BBF7D0] bg-white hover:bg-[#F0FDF4] hover:text-[#16A34A] active:text-[#22C55E] text-xs font-bold text-[#64748B] transition-all text-center shadow-xs"
          >
            Top Up Another Game
          </Link>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#64748B]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#22C55E]" />
          <span>Official Anti-Ban Delivery Guarantee</span>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#64748B]">
          <RefreshCw className="h-6 w-6 animate-spin text-[#16A34A]" />
          <span className="text-xs">Verifying order status...</span>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
