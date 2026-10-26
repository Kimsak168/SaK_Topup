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
  AlertTriangle,
} from "lucide-react";
import { openKhqrInPageCheckout, closeKhqrInPageCheckout } from "@/lib/khqrPlugin";
import AbaPayWayV2Modal, { AbaPayWayV2ModalData } from "@/components/public/AbaPayWayV2Modal";

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
  const supplier = "webbuilder";
  const packageName = searchParams.get("package") || "100 Diamonds";
  const price = parseFloat(searchParams.get("price") || "1.99");
  const playerId = searchParams.get("playerId") || "12345678";
  const serverId = searchParams.get("serverId") || "";
  const playerName = searchParams.get("playerName") || "";

  const [selectedMethod, setSelectedMethod] = useState<"khqr" | "aba_payway_v2">("khqr");
  const [paywayV2ModalData, setPaywayV2ModalData] = useState<AbaPayWayV2ModalData | null>(null);
  const [isPaywayV2Open, setIsPaywayV2Open] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState<CompletedOrder | null>(null);
  const [copied, setCopied] = useState(false);
  const [gatewayDown, setGatewayDown] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/payment/anajakpay/health")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.available === false) {
          setGatewayDown(true);
        }
      })
      .catch(() => {});

    return () => {
      toast.dismiss("checkout");
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
        toast.success("Payment verified", { id: `payment-status-${orderNumber}`, description: "Your top-up has been dispatched." });
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

      if (selectedMethod === "aba_payway_v2") {
        toast.loading("Generating ABA PayWay QR...", { id: "checkout" });
        const res = await fetch("/api/payment/vngzz2/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameSlug,
            supplier,
            supplierProductCode: packageName,
            expectedPrice: price,
            playerId,
            serverId,
            playerName,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error("Unable to start ABA PayWay payment", {
            id: "checkout",
            description: data?.error || "Please try again or select AnajakPay KHQR.",
          });
          return;
        }

        setPaywayV2ModalData({
          orderNumber: data.orderNumber,
          transactionId: data.transactionId,
          amount: data.amount || price,
          currency: data.currency || "USD",
          packageName,
          gameName: game,
          qrImage: data.qrImage,
          qrPngUrl: data.qrPngUrl,
          deepLink: data.deepLink,
          payUrl: data.payUrl,
          expireInSec: data.expireInSec,
        });
        setIsPaywayV2Open(true);
        toast.success("PayWay QR generated", { id: "checkout", description: "Scan with ABA Mobile or any KHQR app." });
        return;
      }

      // Default: AnajakPay KHQR
      toast.loading("Preparing secure checkout...", { id: "checkout" });
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
        if (data?.isMaintenance || res.status === 503) {
          setGatewayDown(true);
          toast.error("AnajakPay KHQR Rail Temporarily Down", {
            id: "checkout",
            description: "AnajakPay's KHQR banking rail is undergoing maintenance. Please try again shortly or contact support.",
          });
          return;
        }
        toast.error("Unable to start payment", { id: "checkout", description: data?.error || "Please try again or contact support if the problem continues." });
        return;
      }

      const completedOrderSnapshot: CompletedOrder = {
        orderNumber: data.orderNumber,
        game,
        packageName,
        amount: data.amount || price,
        playerId,
        serverId: serverId || undefined,
        paymentMethod: "AnajakPay KHQR",
      };
      toast.success("Order created successfully", { id: "order-creation" });

      // Open official AnajakPay checkout in-page modal without leaving the website
      const openResult = await openKhqrInPageCheckout({
        checkoutUrl: data.checkoutUrl,
        onSuccess: () => {
          // Immediately trigger server-side verification
          verifyPaymentStatus(data.orderNumber, data.transactionId, completedOrderSnapshot);
        },
        onError: (err) => {
          console.warn("[Checkout] Plugin error or closed:", err);
          toast.error("Unable to start payment", { id: "checkout", description: "Please try again or contact support if the problem continues." });
        },
        onClose: () => {
          stopPolling();
          verifyPaymentStatus(data.orderNumber, data.transactionId, completedOrderSnapshot);
          toast.info("Payment window closed", { id: "checkout", description: "Your pending order is saved." });
        },
      });

      if (!openResult.opened) {
        toast.error("Unable to start payment", { id: "checkout", description: "Your pending order is saved. Please contact support if checkout does not open." });
        return;
      }

      toast.success("Checkout ready", { id: "checkout", description: "Scan with ABA Mobile or any KHQR app." });
      startPaymentVerificationPolling(data.orderNumber, data.transactionId, completedOrderSnapshot);
    } catch {
      toast.error("Unable to start payment", { id: "checkout", description: "Check your connection and try again." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyOrder = async () => {
    if (orderComplete?.orderNumber) {
      try {
        await navigator.clipboard.writeText(orderComplete.orderNumber);
        setCopied(true);
        toast.success("Copied to clipboard", { id: "clipboard" });
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Unable to copy", { id: "clipboard", description: "Please copy the order number manually." });
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      {/* Breadcrumb Header */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
        <Link href="/games" className="hover:text-[#16A34A] active:text-[#22C55E] flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Back to Games</span>
        </Link>
        <span>/</span>
        <span className="text-[#172033] font-semibold">Secure Checkout</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black text-[#172033] tracking-tight">
          Confirm & Pay
        </h1>
        <p className="text-sm leading-relaxed text-[#64748B]">
          Review your in-game UID and select your preferred payment method.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column: Payment Selection */}
        <div className="min-w-0 lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-[#BBF7D0] bg-white p-4 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#172033] flex items-center gap-2">
                <QrCode className="h-4 w-4 text-[#16A34A]" />
                <span>Payment Method</span>
              </h2>
              <span className="text-[11px] font-bold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                Official Gateway
              </span>
            </div>

            {/* Payment Options Grid */}
            <div className="grid grid-cols-1 gap-3">
              {/* Option 1: AnajakPay KHQR */}
              <button
                type="button"
                onClick={() => setSelectedMethod("khqr")}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left flex items-center justify-between gap-4 cursor-pointer ${
                  selectedMethod === "khqr"
                    ? "border-[#16A34A] bg-[#F0FDF4] ring-2 ring-[#16A34A]/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-[#BBF7D0] bg-[#004B87]">
                    <Image
                      src="/images/aba-logo.png"
                      alt="ABA Bank"
                      width={50}
                      height={50}
                      className="h-full w-full object-cover rounded-xl"
                      priority
                    />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-base font-black text-[#172033] tracking-tight flex flex-wrap items-center gap-2">
                      <span>AnajakPay KHQR</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-[#16A34A] border border-[#BBF7D0] shrink-0">
                        Universal
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] font-medium">All Cambodian Banks (KHQR)</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center shadow-xs ${
                    selectedMethod === "khqr" ? "bg-[#16A34A] text-white" : "border border-slate-300"
                  }`}>
                    {selectedMethod === "khqr" ? <CheckCircle2 className="h-4 w-4" /> : null}
                  </div>
                </div>
              </button>

              {/* Option 2: ABA PayWay V2 */}
              <button
                type="button"
                onClick={() => setSelectedMethod("aba_payway_v2")}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left flex items-center justify-between gap-4 cursor-pointer ${
                  selectedMethod === "aba_payway_v2"
                    ? "border-[#004B87] bg-sky-50/50 ring-2 ring-[#004B87]/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-xl shadow-xs bg-[#004B87] flex items-center justify-center text-white">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-base font-black text-[#172033] tracking-tight flex flex-wrap items-center gap-2">
                      <span>ABA PayWay V2</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-sky-100 text-[#004B87] border border-sky-200 shrink-0">
                        Direct ABA
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] font-medium">PayWay QR Code & ABA Mobile App</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center shadow-xs ${
                    selectedMethod === "aba_payway_v2" ? "bg-[#004B87] text-white" : "border border-slate-300"
                  }`}>
                    {selectedMethod === "aba_payway_v2" ? <CheckCircle2 className="h-4 w-4" /> : null}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Maintenance Notice if AnajakPay KHQRcc is down */}
          {gatewayDown && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-500/30 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in"
            >
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-1.5 flex-wrap">
                  <span>AnajakPay KHQR Rail Temporarily Down</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-200/80 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                    Bank Maintenance
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  AnajakPay&apos;s banking rail is currently reporting service maintenance (KHQRcc unavailable). Checkout is temporarily paused until bank services recover. Please try again shortly.
                </p>
              </div>
            </div>
          )}

          {/* Guarantee Note */}
          <div className="p-4 rounded-xl bg-emerald-50 border border-[#22C55E]/30 flex items-center gap-3 text-xs text-[#22C55E]">
            <ShieldCheck className="h-5 w-5 text-[#22C55E] shrink-0" />
            <span>
              Official Direct Top-Up Delivery. Secure KHQR checkout with automated fulfillment.
            </span>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div className="min-w-0 lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-[#BBF7D0] bg-white p-4 sm:p-6 space-y-5 lg:sticky lg:top-32 shadow-xs">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#172033]">
              Order Summary
            </h2>

            <div className="p-4 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] space-y-3 text-sm [&>div]:gap-4 [&>div>span:first-child]:shrink-0 [&>div>span:last-child]:min-w-0 [&>div>span:last-child]:break-words [&>div>span:last-child]:text-right">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Game:</span>
                <span className="font-bold text-[#172033]">{game}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Package:</span>
                <span className="font-bold text-[#16A34A]">{packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Player ID:</span>
                <span className="font-mono text-[#172033] font-bold">{playerId}</span>
              </div>
              {serverId && (
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Server ID:</span>
                  <span className="font-mono text-[#172033]">{serverId}</span>
                </div>
              )}
              {playerName && (
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Nickname:</span>
                  <span className="text-[#22C55E] font-semibold">{playerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#64748B]">Payment:</span>
                <span className="font-bold text-[#172033]">
                  {selectedMethod === "aba_payway_v2" ? "ABA PayWay V2" : "AnajakPay KHQR"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#DCFCE7] space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[#64748B]">Total USD:</span>
                <span className="text-2xl font-black text-[#16A34A]">
                  ${price.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#64748B]">
                <span>Total Riel (KHR):</span>
                <span className="font-mono font-bold text-[#64748B]">
                  {priceKHR.toLocaleString()} ៛
                </span>
              </div>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={isProcessing}
              className="w-full py-3.5 px-4 rounded-xl text-white font-bold text-sm bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none transition-colors active:scale-98"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {selectedMethod === "aba_payway_v2" ? "Pay with ABA PayWay V2" : "Pay with AnajakPay KHQR"}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#64748B]">
              <Lock className="h-3 w-3" />
              <span>256-Bit Encrypted Payment Rail</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {orderComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-[#BBF7D0] bg-white p-6 sm:p-8 space-y-5 text-center shadow-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-[#22C55E] border border-[#22C55E]/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-[#172033]">Order Registered!</h3>
              <p className="text-xs text-[#64748B]">
                Scan KHQR code to fulfill diamonds automatically.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] text-xs font-mono space-y-2 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[#64748B] font-sans">Order #:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[#16A34A] font-bold">{orderComplete.orderNumber}</span>
                  <button type="button" onClick={handleCopyOrder} aria-label={copied ? "Order number copied" : "Copy order number"} className="p-2 text-[#64748B] hover:text-[#16A34A]">
                    {copied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Amount Due:</span>
                <span className="text-[#172033] font-bold">${orderComplete.amount.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Target UID:</span>
                <span className="text-[#172033]">{orderComplete.playerId}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={`/orders?orderNumber=${orderComplete.orderNumber}`}
                className="w-full py-3 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] text-xs font-bold text-white transition-colors shadow-xs"
              >
                Track Fulfillment Status &rarr;
              </Link>
              <button
                onClick={() => setOrderComplete(null)}
                className="w-full py-2.5 rounded-xl border border-[#BBF7D0] hover:bg-[#F0FDF4] active:bg-[#F0FDF4] text-xs font-semibold text-[#172033] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA PayWay V2 Interactive QR Modal */}
      <AbaPayWayV2Modal
        isOpen={isPaywayV2Open}
        data={paywayV2ModalData}
        onClose={() => setIsPaywayV2Open(false)}
        onSuccess={({ orderNumber }) => {
          setIsPaywayV2Open(false);
          setOrderComplete({
            orderNumber,
            game,
            packageName,
            amount: price,
            playerId,
            serverId: serverId || undefined,
            paymentMethod: "ABA PayWay V2",
          });
        }}
        onRetry={() => {
          setIsPaywayV2Open(false);
          handleCreateOrder();
        }}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#64748B]">
          <RefreshCw className="h-6 w-6 animate-spin text-[#16A34A]" />
          <span className="text-xs">Loading checkout...</span>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
