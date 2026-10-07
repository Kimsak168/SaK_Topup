"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Check,
  Copy,
} from "lucide-react";
import { ClientGame, ClientPackage } from "@/types/game";
import { PackageOptions } from "./PackageOptions";
import { openKhqrInPageCheckout, closeKhqrInPageCheckout } from "@/lib/khqrPlugin";

interface GameTopUpClientProps {
  game: ClientGame;
  initialPackages: ClientPackage[];
}

interface ActiveOrderInfo {
  orderNumber: string;
  transactionId: string;
  amount: number;
  packageName: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
}

export function GameTopUpClient({ game, initialPackages }: GameTopUpClientProps) {
  // Account Inputs
  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyStatusType, setVerifyStatusType] = useState<"success" | "invalid" | "unsupported" | "unavailable" | null>(null);
  const verificationRequestRef = useRef(0);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [headerImg, setHeaderImg] = useState<string>(() => game.image || "/images/freefire.jpg");

  // Selected Package — no automatic pre-selection; customer must click to choose
  const [selectedPackage, setSelectedPackage] = useState<ClientPackage | null>(null);
  const handlePackageSelect = useCallback((pkg: ClientPackage) => {
    setSelectedPackage((current) => current?.id === pkg.id ? null : pkg);
  }, []);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"khqr" | null>(null);
  const isAccountReady = Boolean(userId.trim()) &&
    (!game.requiresServer || Boolean(serverId.trim())) &&
    !verifying &&
    (verifyStatusType === "success" || verifyStatusType === "unsupported" || verifyStatusType === "unavailable");


  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderInfo | null>(null);
  const [copiedOrderNo, setCopiedOrderNo] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling and modal on unmount
  useEffect(() => {
    return () => {
      verificationRequestRef.current += 1;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      closeKhqrInPageCheckout();
    };
  }, []);

  // Player ID verification
  const handleVerify = async () => {
    const cleanUserId = userId.trim();
    const cleanServerId = serverId.trim();
    if (!cleanUserId) {
      toast.error(`Please enter your ${game.userIdLabel}`);
      return;
    }
    if (game.requiresServer && !cleanServerId) {
      toast.error(`Please enter your ${game.serverLabel}`);
      return;
    }

    const requestId = ++verificationRequestRef.current;
    setVerifying(true);
    setVerifyError(null);
    setVerifiedName(null);
    setVerifyStatusType(null);

    try {
      const res = await fetch("/api/player/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: game.supplier,
          code: game.code,
          slug: game.slug,
          userId: cleanUserId,
          serverId: cleanServerId,
        }),
      });

      const data = await res.json();
      if (verificationRequestRef.current !== requestId) return;
      if (res.ok && data.success) {
        setVerifiedName(data.playerName || "Verified Player");
        setVerifyStatusType("success");
        toast.success(`Account verified: ${data.playerName || "Success"}`);
      } else if (data.isInvalidId) {
        setVerifyError(data.message || "Player account not found. Please double check your Player ID.");
        setVerifyStatusType("invalid");
        toast.error(data.message || "Player not found");
      } else if (data.isSupported === false) {
        setVerifyError(data.message || "Live nickname verification is not available for this game.");
        setVerifyStatusType("unsupported");
        toast.info(data.message || "Live nickname verification is not available for this game.");
      } else if (data.isUnavailable) {
        setVerifyError(data.message || "Verification service is busy. You can still proceed if your ID is correct.");
        setVerifyStatusType("unavailable");
        toast.warning(data.message || "Verification service is busy.");
      } else {
        setVerifyError(data.message || "Player ID could not be validated. Please check your ID.");
        setVerifyStatusType("invalid");
        toast.error(data.message || "Player ID could not be validated.");
      }
    } catch {
      if (verificationRequestRef.current !== requestId) return;
      setVerifyError("Network error checking player ID. You can still proceed if your ID is correct.");
      setVerifyStatusType("unavailable");
    } finally {
      if (verificationRequestRef.current === requestId) setVerifying(false);
    }
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleCopyOrderNumber = () => {
    if (activeOrder?.orderNumber) {
      navigator.clipboard.writeText(activeOrder.orderNumber);
      setCopiedOrderNo(true);
      toast.success("Order number copied to clipboard");
      setTimeout(() => setCopiedOrderNo(false), 2000);
    }
  };

  const verifyPaymentStatus = async (
    orderNumber: string,
    transactionId: string
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
        setActiveOrder((prev) =>
          prev
            ? {
                ...prev,
                paymentStatus: "PAID",
                fulfillmentStatus: data.fulfillmentStatus || prev.fulfillmentStatus,
              }
            : null
        );
        setCheckoutComplete(true);
        toast.success("Payment verified! Your top-up is being processed.");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[SakSuuu] Payment verification error:", err);
      return false;
    }
  };

  const startPaymentVerificationPolling = (orderNumber: string, transactionId: string) => {
    stopPolling();

    let attempts = 0;
    const maxAttempts = 60; // 60 attempts * 3 seconds = 180 seconds (3 minutes)

    pollingRef.current = setInterval(async () => {
      attempts += 1;
      const isPaid = await verifyPaymentStatus(orderNumber, transactionId);

      if (isPaid) {
        stopPolling();
      } else if (attempts >= maxAttempts) {
        stopPolling();
        console.log("[SakSuuu] Payment polling window completed (3 minutes). Order remains pending.");
      }
    }, 3000);
  };

  const handleCheckout = async () => {
    if (!userId.trim()) {
      toast.error(`Please provide your ${game.userIdLabel} before checking out`);
      return;
    }
    if (game.requiresServer && !serverId.trim()) {
      toast.error(`Please enter your ${game.serverLabel}`);
      return;
    }
    if (!isAccountReady) {
      toast.error("Please check and verify your account before checking out");
      return;
    }
    if (!selectedPackage) {
      toast.error("Please select a top-up package");
      return;
    }
    if (!selectedPackage.isAvailable || selectedPackage.sellingPrice === null) {
      toast.error("This package is not currently available for purchase (pending price configuration)");
      return;
    }
    if (!selectedPaymentMethod) {
      toast.error("Please select ABA Pay / KHQR before checking out");
      return;
    }

    try {
      setIsCheckingOut(true);
      const res = await fetch("/api/payment/anajakpay/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameSlug: game.slug || game.code,
          supplier: game.supplier,
          supplierProductCode: selectedPackage.supplierProductCode || selectedPackage.id,
          expectedPrice: selectedPackage.sellingPrice,
          playerId: userId.trim(),
          serverId: serverId.trim() || undefined,
          playerName: verifiedName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.checkoutUrl) {
        toast.error(data.error || "Unable to initialize secure payment. Please try again.");
        return;
      }

      const newOrderInfo: ActiveOrderInfo = {
        orderNumber: data.orderNumber,
        transactionId: data.transactionId,
        amount: data.amount,
        packageName: selectedPackage.name,
        playerId: userId.trim(),
        serverId: serverId.trim() || undefined,
        playerName: verifiedName || undefined,
        paymentStatus: "PENDING",
        fulfillmentStatus: "NOT_STARTED",
      };
      setActiveOrder(newOrderInfo);

      // Open official AnajakPay checkout plugin in-page modal without leaving the game page
      const openResult = await openKhqrInPageCheckout({
        checkoutUrl: data.checkoutUrl,
        onSuccess: () => {
          // Trigger immediate server-side payment verification
          verifyPaymentStatus(data.orderNumber, data.transactionId);
        },
        onError: (err) => {
          console.warn("[AnajakPay] Plugin reported event:", err);
        },
        onClose: () => {
          // User closed checkout: keep order pending
          stopPolling();
          verifyPaymentStatus(data.orderNumber, data.transactionId);
          toast.info("Payment window closed. Your pending order is saved.");
        },
      });

      if (!openResult.opened) {
        toast.error(
          openResult.diagnostic ||
          openResult.error ||
          "Unable to open in-page KHQR checkout. Your pending order has been recorded."
        );
        return;
      }

      toast.success("KHQR payment window opened. Scan with ABA Mobile or any KHQR app.");
      // Polling interval of ~3 seconds for up to 3 minutes
      startPaymentVerificationPolling(data.orderNumber, data.transactionId);
    } catch {
      toast.error("Network error connecting to payment gateway. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-6">
      {/* Simplified Game Header Card */}
      <div className="relative rounded-2xl overflow-hidden p-3 min-[360px]:p-3.5 sm:p-5 border border-pink-100/90 bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 sm:gap-6 flex-wrap sm:flex-nowrap">
          {/* Left: Game picture and name */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="relative h-14 w-14 min-[360px]:h-16 min-[360px]:w-16 sm:h-[80px] sm:w-[80px] shrink-0 rounded-xl overflow-hidden border border-pink-200/60 shadow-xs bg-pink-50/40 group">
              <Image
                src={headerImg}
                alt={game.name}
                fill
                sizes="(min-width: 640px) 80px, 64px"
                preload
                className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                onError={() => setHeaderImg("/images/freefire.jpg")}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-base min-[360px]:text-lg sm:text-2xl md:text-3xl font-black text-foreground tracking-tight break-words">
                {game.name}
              </h1>
            </div>
          </div>

          {/* Right: Back to Home button */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-primary bg-pink-50 hover:bg-pink-100 border border-pink-200 shadow-xs transition-all duration-200 group shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-primary group-hover:-translate-x-1 transition-transform duration-200" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Left Steps (1, 2, 3) vs Right Summary Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-6 items-start">
        {/* Left Column: Top-Up Process */}
        <div className="min-w-0 lg:col-span-8 space-y-3.5 sm:space-y-6">
          {/* STEP 1: Enter Account Information */}
          <section className="rounded-2xl border border-pink-100/90 bg-white shadow-xs p-3.5 sm:p-6 space-y-3.5 sm:space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white shadow-xs">
                  1
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  Enter Account Information
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowIdGuide(!showIdGuide)}
                aria-expanded={showIdGuide}
                aria-controls="player-id-guide"
                className="flex min-h-8 items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>How to find ID?</span>
              </button>
            </div>

            {/* Instruction Callout */}
            {showIdGuide && (
              <div id="player-id-guide" className="rounded-xl border border-pink-200 bg-pink-50/50 p-3.5 text-xs sm:text-sm leading-relaxed text-secondary-foreground animate-in fade-in">
                <p className="font-semibold text-primary mb-1">
                  How to locate your {game.name} ID:
                </p>
                <p>{game.instruction}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <div>
                <label htmlFor="player-id" className="block text-xs font-bold uppercase tracking-wider text-secondary-foreground mb-1.5">
                  {game.userIdLabel} <span className="text-primary">*</span>
                </label>
                <input
                  id="player-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={userId}
                  onChange={(e) => {
                    verificationRequestRef.current += 1;
                    setUserId(e.target.value);
                    setVerifying(false);
                    setVerifiedName(null);
                    setVerifyError(null);
                    setVerifyStatusType(null);
                  }}
                  placeholder="Enter Player ID"
                  className="h-10 sm:h-11 w-full rounded-xl border border-pink-200/80 bg-white px-3 sm:px-4 text-xs sm:text-sm text-foreground placeholder:text-xs sm:placeholder:text-sm placeholder:text-muted-foreground focus:border-primary focus-visible:outline-2 focus-visible:outline-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono shadow-xs"
                />
              </div>

              {game.requiresServer && (
                <div>
                  <label htmlFor="server-id" className="block text-xs font-bold uppercase tracking-wider text-secondary-foreground mb-1.5">
                    {game.serverLabel} <span className="text-primary">*</span>
                  </label>
                  <input
                    id="server-id"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={serverId}
                    onChange={(e) => {
                      verificationRequestRef.current += 1;
                      setServerId(e.target.value);
                      setVerifying(false);
                      setVerifiedName(null);
                      setVerifyError(null);
                      setVerifyStatusType(null);
                    }}
                    placeholder="Enter Zone ID"
                    className="h-10 sm:h-11 w-full rounded-xl border border-pink-200/80 bg-white px-3 sm:px-4 text-xs sm:text-sm text-foreground placeholder:text-xs sm:placeholder:text-sm placeholder:text-muted-foreground focus:border-primary focus-visible:outline-2 focus-visible:outline-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono shadow-xs"
                  />
                </div>
              )}
            </div>

            {/* Verification Button & Status */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying || !userId.trim() || (game.requiresServer && !serverId.trim())}
                className="inline-flex items-center gap-1.5 rounded-xl bg-pink-50 border border-pink-200 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-white hover:border-primary disabled:opacity-50 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying account...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Check & Verify Nickname</span>
                  </>
                )}
              </button>

              {verifiedName && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg shadow-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Verified: {verifiedName}</span>
                </div>
              )}

              {verifyError && verifyStatusType === "invalid" && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{verifyError}</span>
                </div>
              )}

              {verifyError && (verifyStatusType === "unsupported" || verifyStatusType === "unavailable") && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>{verifyError}</span>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2: Select Package */}
          <section className="rounded-2xl border border-pink-100/90 bg-white shadow-xs p-3.5 sm:p-6 space-y-3.5 sm:space-y-5">
            <PackageOptions packages={initialPackages} selectedId={selectedPackage?.id} currencyName={game.currencyName} onSelect={handlePackageSelect} />
          </section>

          {/* STEP 3: Select Payment Method */}
          <section className="rounded-2xl border border-pink-100/90 bg-white shadow-xs p-3.5 sm:p-6 space-y-3.5 sm:space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white shadow-xs">
                  3
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">Payment Method</h3>
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-primary bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Official Gateway
              </span>
            </div>

            {/* ONE payment card: ABA Pay / KHQR */}
            <button
              type="button"
              aria-pressed={selectedPaymentMethod === "khqr"}
              onClick={() => setSelectedPaymentMethod((current) => current === "khqr" ? null : "khqr")}
              className={`relative w-full p-3.5 sm:p-4 rounded-xl border-2 shadow-xs flex items-center justify-between gap-3 text-left cursor-pointer transition-all ${selectedPaymentMethod === "khqr" ? "border-primary bg-pink-50/50 ring-2 ring-primary/20" : "border-slate-200/80 bg-white hover:border-pink-200"}`}
            >
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                <div className="relative h-11 w-11 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-slate-200 bg-[#004B87]">
                  <Image
                    src="/images/aba-logo.png"
                    alt="ABA Bank"
                    width={48}
                    height={48}
                    className="h-full w-full object-cover rounded-xl"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm sm:text-base font-black text-foreground tracking-tight flex flex-wrap items-center gap-1.5">
                    <span className="break-words">ABA Pay / KHQR</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-pink-100 text-primary border border-pink-200 shrink-0">
                      KHQR
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium">Scan with ABA Mobile or any KHQR app</p>
                </div>
              </div>

              {selectedPaymentMethod === "khqr" && (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center text-white shadow-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Order Summary Drawer / Sticky Card */}
        <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-32 space-y-3.5 sm:space-y-4">
          <div className="rounded-2xl border border-pink-100/90 bg-white p-3.5 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-pink-100 pb-2.5">
              <h3 className="text-sm sm:text-base font-extrabold text-foreground">Order Summary</h3>
            </div>

            {/* Selected Game & Package */}
            <div className="space-y-2 text-xs sm:text-sm [&>div]:gap-3 [&>div>span:first-child]:shrink-0 [&>div>span:last-child]:min-w-0 [&>div>span:last-child]:break-words [&>div>span:last-child]:text-right">
              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-bold text-foreground">{game.name}</span>
              </div>

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Package:</span>
                <span className="font-bold text-primary text-right">
                  {selectedPackage?.name || "Select a package"}
                </span>
              </div>

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">{game.userIdLabel}:</span>
                <span className="font-mono text-foreground">
                  {userId ? userId : <em className="text-muted-foreground font-sans">Not provided</em>}
                </span>
              </div>

              {game.requiresServer && (
                <div className="flex justify-between text-secondary-foreground">
                  <span className="text-muted-foreground">{game.serverLabel}:</span>
                  <span className="font-mono text-foreground">
                    {serverId ? serverId : <em className="text-muted-foreground font-sans">Not provided</em>}
                  </span>
                </div>
              )}

              {verifiedName && (
                <div className="flex justify-between text-secondary-foreground">
                  <span className="text-muted-foreground">Character:</span>
                  <span className="font-bold text-emerald-600">{verifiedName}</span>
                </div>
              )}

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-bold text-foreground">
                  {selectedPaymentMethod === "khqr" ? "ABA Pay / KHQR" : "Select payment"}
                </span>
              </div>
            </div>

            {/* Pricing Details */}
            <div className="border-t border-pink-100 pt-3 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs sm:text-sm font-bold text-foreground">Total Amount</span>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-primary">
                    {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined
                      ? `$${selectedPackage.sellingPrice.toFixed(2)}`
                      : "—"}
                  </span>
                  {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined && (
                    <div className="text-[10px] text-muted-foreground">
                      ≈ {Math.round(selectedPackage.sellingPrice * 4100).toLocaleString()} KHR
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || !isAccountReady || !selectedPackage || !selectedPackage.isAvailable || selectedPackage.sellingPrice === null || !selectedPaymentMethod}
              className="public-button w-full rounded-xl py-3 px-4 font-bold text-xs sm:text-sm shadow-xs cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              {isCheckingOut ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing Order...</span>
                </>
              ) : (
                <>
                  <span>Pay with ABA / KHQR</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground pt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Official Direct Top-Up Delivery</span>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Confirmation Modal / Alert */}
      {checkoutComplete && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl public-surface border border-emerald-500/50 p-6 sm:p-8 space-y-6 text-center animate-in zoom-in-95 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-success/10 text-success border border-emerald-500/30">
                Payment Verified
              </span>
              <h3 className="text-xl font-black text-foreground">Top-Up Dispatched!</h3>
              <p className="text-xs text-secondary-foreground">
                Your payment for{" "}
                <strong className="text-primary">{activeOrder.packageName}</strong> has been confirmed and queued for direct delivery.
              </p>
            </div>

            <div className="public-order-details rounded-xl bg-card p-4 text-xs text-left space-y-2.5 border border-border font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-sans">Order Number:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-primary font-bold">{activeOrder.orderNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyOrderNumber}
                    className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                    aria-label="Copy order number"
                  >
                    {copiedOrderNo ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Game:</span>
                <span className="text-foreground font-sans font-semibold">{game.name}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Player ID:</span>
                <span className="text-foreground font-bold">{activeOrder.playerId}</span>
              </div>

              {activeOrder.serverId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-sans">Server / Zone:</span>
                  <span className="text-foreground">{activeOrder.serverId}</span>
                </div>
              )}

              {activeOrder.playerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-sans">IGN:</span>
                  <span className="text-success font-sans">{activeOrder.playerName}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Amount Paid:</span>
                <span className="text-success font-bold text-sm">
                  ${activeOrder.amount.toFixed(2)} USD
                </span>
              </div>

              <div className="flex justify-between pt-1 border-t border-border">
                <span className="text-muted-foreground font-sans">Status:</span>
                <span className="text-success font-bold">PAID (CONFIRMED)</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Delivery:</span>
                <span className="text-primary font-sans">Automated Direct API</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href={`/orders?orderNumber=${encodeURIComponent(activeOrder.orderNumber)}`}
                className="w-full rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground hover:bg-primary transition-colors shadow-[0_0_20px_rgba(255,46,147,0.4)] flex items-center justify-center gap-1.5"
              >
                <span>Track Live Order Status</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setCheckoutComplete(false)}
                className="w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Close & Return to Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
