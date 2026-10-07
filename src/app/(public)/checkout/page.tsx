"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ShieldCheck,
  QrCode,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Lock,
  ChevronLeft,
  Copy,
  Check,
} from "lucide-react";
import { openKhqrInPageCheckout, closeKhqrInPageCheckout } from "@/lib/khqrPlugin";

interface CompletedOrder {
  orderNumber: string;
  game: string;
  packageName: string;
  amount: number;
  playerId: string;
  serverId?: string;
  paymentMethod: string;
}

function CheckoutContent() {
  const searchParams = useSearchParams();

  const game = searchParams.get("game") || "Free Fire";
  const gameSlug = searchParams.get("gameSlug") || "freefire_global";
  const supplier = searchParams.get("supplier") || "vizo";
  const packageName = searchParams.get("package") || "100 Diamonds";
  const price = parseFloat(searchParams.get("price") || "1.99");
  const playerId = searchParams.get("playerId") || "12345678";
  const serverId = searchParams.get("serverId") || "";
  const playerName = searchParams.get("playerName") || "";

  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState<CompletedOrder | null>(null);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      closeKhqrInPageCheckout();
    };
  }, []);

  const priceKHR = Math.round(price * 4100);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const verifyPaymentStatus = async (
    orderNumber: string,
    transactionId: string,
    orderSnapshot: CompletedOrder
  ) => {
    try {
      const res = await fetch("/api/payment/anajakpay/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, transactionId }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.success && data.paymentStatus === "PAID") {
        stopPolling();
        closeKhqrInPageCheckout();
        setOrderComplete(orderSnapshot);
        toast.success("Payment verified! Top-up has been dispatched.");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Checkout] Payment verification check error:", err);
      return false;
    }
  };

  const startPaymentVerificationPolling = (
    orderNumber: string,
    transactionId: string,
    orderSnapshot: CompletedOrder
  ) => {
    stopPolling();

    let attempts = 0;
    const maxAttempts = 60; // 3 seconds * 60 = 180 seconds (3 minutes)

    pollingRef.current = setInterval(async () => {
      attempts += 1;
      const isPaid = await verifyPaymentStatus(orderNumber, transactionId, orderSnapshot);

      if (isPaid) {
        stopPolling();
      } else if (attempts >= maxAttempts) {
        stopPolling();
        console.log("[Checkout] Polling completed. Order remains pending.");
      }
    }, 3000);
  };

  const handleCreateOrder = async () => {
    try {
      setIsProcessing(true);
      const res = await fetch("/api/payment/anajakpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          supplier,
          supplierProductCode: packageName,
          playerId,
          serverId,
          playerName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.checkoutUrl) {
        toast.error(data.error || "Unable to initialize secure checkout. Please try again.");
        return;
      }

      const completedOrderSnapshot: CompletedOrder = {
        orderNumber: data.orderNumber,
        game,
        packageName,
        amount: data.amount || price,
        playerId,
        serverId: serverId || undefined,
        paymentMethod: "ABA Pay / KHQR",
      };

      // Open official AnajakPay checkout in-page modal without leaving the website
      const openResult = await openKhqrInPageCheckout({
        checkoutUrl: data.checkoutUrl,
        onSuccess: () => {
          // Immediately trigger server-side verification
          verifyPaymentStatus(data.orderNumber, data.transactionId, completedOrderSnapshot);
        },
        onError: (err) => {
          console.warn("[Checkout] Plugin error or closed:", err);
        },
        onClose: () => {
          stopPolling();
          verifyPaymentStatus(data.orderNumber, data.transactionId, completedOrderSnapshot);
          toast.info("Payment window closed. Order remains pending.");
        },
      });

      if (!openResult.opened) {
        toast.error(
          openResult.diagnostic ||
          openResult.error ||
          "Unable to open in-page KHQR checkout. Your pending order is saved."
        );
        return;
      }

      toast.success("KHQR payment window opened. Scan with ABA Mobile or any KHQR app.");
      startPaymentVerificationPolling(data.orderNumber, data.transactionId, completedOrderSnapshot);
    } catch {
      toast.error("Network error connecting to payment gateway");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyOrder = () => {
    if (orderComplete?.orderNumber) {
      navigator.clipboard.writeText(orderComplete.orderNumber);
      setCopied(true);
      toast.success("Order number copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      {/* Breadcrumb Header */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-foreground">
        <Link href="/games" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Back to Games</span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-semibold">Secure Checkout</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
          Confirm & Pay
        </h1>
        <p className="text-sm leading-relaxed text-secondary-foreground">
          Review your in-game UID and select your preferred payment method.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column: Payment Selection */}
        <div className="min-w-0 lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-secondary-foreground flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <span>Payment Method</span>
              </h2>
              <span className="text-[11px] font-bold text-[#EC168C] bg-[#FFF1F7] border border-[#F4C7DD] px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                Official Gateway
              </span>
            </div>

            {/* Single Payment Card: ABA Pay / KHQR */}
            <div className="relative p-4 sm:p-5 rounded-2xl border-2 border-[#EC168C] bg-[#FFF1F7] ring-2 ring-[#EC168C]/20 shadow-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                <div className="relative h-[55px] w-[55px] shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-[#F4C7DD] bg-[#004B87]">
                  <Image
                    src="/images/aba-logo.png"
                    alt="ABA Bank"
                    width={55}
                    height={55}
                    className="h-full w-full object-cover rounded-xl"
                    priority
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight flex flex-wrap items-center gap-2">
                    <span className="break-words">ABA Pay / KHQR</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white text-[#EC168C] border border-[#F4C7DD] shrink-0">
                      KHQR
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] font-medium">Secure KHQR Checkout</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Guarantee Note */}
          <div className="p-4 rounded-xl bg-success/10 border border-emerald-500/20 flex items-center gap-3 text-xs text-success">
            <ShieldCheck className="h-5 w-5 text-success shrink-0" />
            <span>
              Official Direct Top-Up Delivery. Secure KHQR checkout with automated fulfillment.
            </span>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div className="min-w-0 lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-5 lg:sticky lg:top-32">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-secondary-foreground">
              Order Summary
            </h2>

            <div className="p-4 rounded-xl bg-muted border border-border space-y-3 text-sm [&>div]:gap-4 [&>div>span:first-child]:shrink-0 [&>div>span:last-child]:min-w-0 [&>div>span:last-child]:break-words [&>div>span:last-child]:text-right">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-bold text-foreground">{game}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Package:</span>
                <span className="font-bold text-primary">{packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Player ID:</span>
                <span className="font-mono text-foreground font-bold">{playerId}</span>
              </div>
              {serverId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server ID:</span>
                  <span className="font-mono text-foreground">{serverId}</span>
                </div>
              )}
              {playerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nickname:</span>
                  <span className="text-success font-semibold">{playerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-bold text-foreground">ABA Pay / KHQR</span>
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Total USD:</span>
                <span className="text-2xl font-black text-primary">
                  ${price.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Total Riel (KHR):</span>
                <span className="font-mono font-bold text-primary">
                  {priceKHR.toLocaleString()} ៛
                </span>
              </div>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={isProcessing}
              className="public-button w-full py-3.5 px-4 rounded-xl text-primary-foreground font-bold text-sm shadow-[0_0_25px_rgba(255,46,147,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Pay with ABA / KHQR</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>256-Bit Encrypted Payment Rail</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {orderComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-[#F8DCE9] bg-white p-6 sm:p-8 space-y-5 text-center shadow-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success border border-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-foreground">Order Registered!</h3>
              <p className="text-xs text-secondary-foreground">
                Scan KHQR code to fulfill diamonds automatically.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-muted border border-border text-xs font-mono space-y-2 text-left">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-sans">Order #:</span>
                <div className="flex items-center gap-1">
                  <span className="text-primary font-bold">{orderComplete.orderNumber}</span>
                  <button type="button" onClick={handleCopyOrder} aria-label={copied ? "Order number copied" : "Copy order number"} className="p-2 text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Amount Due:</span>
                <span className="text-foreground font-bold">${orderComplete.amount.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Target UID:</span>
                <span className="text-foreground">{orderComplete.playerId}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={`/orders?orderNumber=${orderComplete.orderNumber}`}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary text-xs font-bold text-primary-foreground transition-all shadow-md"
              >
                Track Fulfillment Status &rarr;
              </Link>
              <button
                onClick={() => setOrderComplete(null)}
                className="w-full py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-muted-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">Loading checkout...</span>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
