"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw, ShoppingCart } from "lucide-react";

function CancelContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber") || "";
  const txn = searchParams.get("txn") || "";

  return (
    <div className="max-w-lg mx-auto py-16 px-4 sm:px-6 space-y-6 text-center animate-in fade-in">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-warning/10 text-warning border border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.2)]">
        <AlertTriangle className="h-10 w-10" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
          Payment Cancelled
        </h1>
        <p className="text-xs sm:text-sm text-secondary-foreground leading-relaxed max-w-sm mx-auto">
          You closed the checkout window or cancelled the ABA/KHQR payment. No charges were made to your bank account.
        </p>
      </div>

      {(orderNumber || txn) && (
        <div className="public-order-details rounded-2xl bg-card border border-border p-4 text-xs font-mono text-muted-foreground space-y-1">
          {orderNumber && (
            <div className="flex justify-between">
              <span>Order Reference:</span>
              <span className="text-primary font-bold">{orderNumber}</span>
            </div>
          )}
          {txn && (
            <div className="flex justify-between">
              <span>Transaction ID:</span>
              <span className="text-foreground">{txn}</span>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary text-primary-foreground font-bold text-xs transition-all shadow-md"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Browse Top-Up Catalog</span>
        </Link>

        {orderNumber && (
          <Link
            href={`/orders/${encodeURIComponent(orderNumber)}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border hover:bg-muted text-secondary-foreground font-bold text-xs transition-all"
          >
            <span>View Order Status</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">Loading...</span>
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
