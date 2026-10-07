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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Order ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-secondary-foreground">
          Retrieving authoritative order record...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-rose-500/30">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">Order Lookup Error</h1>
          <p className="text-sm text-secondary-foreground">{error || "Transaction record missing"}</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setLoading(true);
              fetchStatus();
            }}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary transition-colors"
          >
            Retry Verification
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-border text-secondary-foreground font-bold text-xs hover:bg-muted transition-colors"
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
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 text-center space-y-6 shadow-soft relative overflow-hidden">
        {/* Glow backdrop */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-72 h-36 blur-3xl pointer-events-none rounded-full ${
            isPaid
              ? "bg-success/10"
              : isPending
              ? "bg-warning/10"
              : "bg-destructive/10"
          }`}
        />

        {/* Status Icon */}
        <div className="relative z-10 flex justify-center">
          {isPaid && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-success/10 text-success border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          )}
          {isPending && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-warning/10 text-warning border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <Clock className="h-10 w-10 animate-pulse" />
            </div>
          )}
          {isFailed && (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10 text-destructive border border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
              <AlertCircle className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Header Messaging */}
        <div className="relative z-10 space-y-2">
          {isPaid && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Payment Received & Verified!
              </h1>
              <p className="text-xs sm:text-sm text-secondary-foreground max-w-md mx-auto leading-relaxed">
                Thank you! Your payment of{" "}
                <strong className="text-success">
                  ${order.amount.toFixed(2)} USD
                </strong>{" "}
                was cryptographically verified with AnajakPay KHQR.
              </p>
            </>
          )}

          {isPending && isPollExpired && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Awaiting Bank Settlement Confirmation
              </h1>
              <p className="text-xs sm:text-sm text-secondary-foreground max-w-md mx-auto leading-relaxed">
                Your order{" "}
                <span className="font-mono text-primary font-bold">
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
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary text-xs font-bold text-primary-foreground transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Check Status Again</span>
                </button>
              </div>
            </>
          )}

          {isPending && !isPollExpired && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Verifying Payment with ABA/KHQR...
              </h1>
              <p className="text-xs sm:text-sm text-secondary-foreground max-w-md mx-auto leading-relaxed">
                We are currently awaiting bank settlement confirmation for order{" "}
                <span className="font-mono text-primary font-bold">
                  {order.orderNumber}
                </span>
                . Please keep this page open.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/10 border border-amber-500/30 text-[11px] font-bold text-warning mt-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Verifying bank response ({pollCount + 1}/60)...</span>
              </div>
            </>
          )}

          {isFailed && (
            <>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Payment Not Completed
              </h1>
              <p className="text-xs sm:text-sm text-secondary-foreground max-w-md mx-auto leading-relaxed">
                This transaction was not completed or was cancelled at checkout.
              </p>
            </>
          )}
        </div>

        {/* Fulfillment Status Banner (When Paid) */}
        {isPaid && (
          <div className="p-4 rounded-2xl bg-muted border border-border space-y-2 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Delivery Status:</span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] border ${
                  order.fulfillmentStatus === "COMPLETED"
                    ? "bg-success/10 text-success border-emerald-500/30"
                    : order.fulfillmentStatus === "FAILED"
                    ? "bg-destructive/10 text-destructive border-rose-500/30"
                    : "bg-accent text-primary border-pink-500/30 animate-pulse"
                }`}
              >
                {order.fulfillmentStatus === "COMPLETED"
                  ? "✓ DELIVERED TO GAME"
                  : order.fulfillmentStatus === "FAILED"
                  ? "UNDER REVIEW"
                  : "PROCESSING DELIVERY..."}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {order.fulfillmentStatus === "COMPLETED"
                ? "Your top-up items have been injected directly into your account."
                : order.fulfillmentStatus === "FAILED"
                ? "Delivery encountered an issue. Our support team is auditing your transaction."
                : "Automated direct supplier API is delivering your game top-up right now."}
            </p>
          </div>
        )}

        {/* Authoritative Order Details Table */}
        <div className="public-order-details rounded-2xl bg-muted p-4 text-xs space-y-2.5 text-left border border-border font-mono">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground font-sans">Order Number:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-primary font-bold">{order.orderNumber}</span>
              <button
                type="button"
                onClick={() => handleCopy(order.orderNumber)}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Copy Order ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Game:</span>
            <span className="text-foreground font-sans font-bold">{order.gameName}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Package:</span>
            <span className="text-primary font-sans">{order.packageName}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Target UID:</span>
            <span className="text-foreground">{order.playerId}</span>
          </div>

          {order.serverId && (
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Server / Zone:</span>
              <span className="text-foreground">{order.serverId}</span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-border">
            <span className="text-muted-foreground font-sans font-bold">Amount Paid:</span>
            <span className="text-success font-bold text-sm">
              ${order.amount.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/orders/${encodeURIComponent(order.orderNumber)}`}
            className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-primary text-xs font-bold text-primary-foreground transition-all shadow-[0_0_20px_rgba(255,46,147,0.3)] flex items-center justify-center gap-2"
          >
            <span>Live Order Tracker</span>
            <ChevronRight className="h-4 w-4" />
          </Link>

          <Link
            href="/"
            className="py-3 px-5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-secondary-foreground transition-all text-center"
          >
            Top Up Another Game
          </Link>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
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
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">Verifying order status...</span>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
